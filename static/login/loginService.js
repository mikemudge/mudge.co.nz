var auth2 = {
  auth2: null,
  cbs: [],
  addCallback: function(cb) {
    if (this.auth2) {
      cb.apply(null, [this.auth2]);
    }
    this.cbs.push(cb)
  },
  load: function() {
    this.auth2 = gapi.auth2.init({
      client_id: '872711897303-6rkqgedhsq6rni9ikt6j6v8rbhkkkd7a.apps.googleusercontent.com'
    });
    var i = 0;
    for (;i < this.cbs.length;i++) {
      this.cbs[i].apply(null, [this.auth2]);
    }
  }
}

// Called when the google auth script is downloaded.
function initGoogle() {
  gapi.load('auth2', auth2.load.bind(auth2));
}
(function() {
  var js = document.createElement('script');
  js.src = 'https://apis.google.com/js/api:client.js?onload=initGoogle'
  var fjs = document.getElementsByTagName('script')[0];
  fjs.parentNode.insertBefore(js, fjs);
})();

var LoginService = function($resource, $q) {

  this.Login = $resource('/api/auth', {}, {
    connect: {
      method: 'POST',
      url: '/api/connect-token'
    }
  });
  this.User = $resource('/api/user/:id');

  // Attempt to load user from cache?
  this.user = new this.User();

  this.google = $q.defer();
  this.googleStatus = "Checking google login"

  auth2.addCallback(this.setAuth.bind(this));
}

LoginService.prototype.setAuth = function(auth2) {
  this.auth2 = auth2;
  auth2.currentUser.listen(this.googleUserChanged.bind(this));
}

LoginService.prototype.googleUserChanged = function(user) {
  this.loginComplete = true;
  if (!user.isSignedIn()) {
    // No google account is logged in.
    this.googleStatus = "No google login"
    this.google.reject();
    return;
  }

  // Get the jwt.
  var parts = user.getAuthResponse().id_token.split('.');
  var data = JSON.parse(atob(parts[1]));

  this.googleStatus = "Logged in as Google user " + data.email;
  this.googleUser = {
    id_token: user.getAuthResponse().id_token,
    data: data,
    name: data.name,
    email: data.email
  };
  this.google.resolve(this.googleUser);
};

LoginService.prototype.loginWithGoogle = function() {
  if (!this.googleUser.id_token) {
    throw Error('No id_token for google login.');
  }

  auth = this.Login.connect({
    type: 'google',
    id_token: this.googleUser.id_token
  });

  return auth.$promise.then(function(auth) {
    console.log('auth', auth);

    // TODO setup default auth.
    return this.User.get();
  }.bind(this));
}

angular.module('loginService', [
  'ngResource'
])
.service('loginService', LoginService)
