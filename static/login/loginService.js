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

var LoginService = function(config, $http, $resource, $q, $rootScope) {
  this.$rootScope = $rootScope;
  this.$http = $http;
  basicAuth = 'Basic ' + window.btoa(config.CLIENT_ID + ":" + config.CLIENT_SECRET),

  this.Login = $resource('/api/auth', {}, {
    connect: {
      method: 'POST',
      url: '/auth/connector-token',
      headers: {
        'Authorization': basicAuth
      }
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

  this.$rootScope.$apply();
  this.google.resolve(this.googleUser);
};

LoginService.prototype.loginToGoogle = function() {
  if (!this.auth2) {
    throw Error('auth2 is not ready yet.');
    // TODO do this better.
  }
  this.auth2.signIn();

  return this.google.promise;
}


LoginService.prototype.logout = function() {
  if (!this.auth2) {
    throw Error('auth2 is not ready yet.');
    // TODO do this better.
  }
  this.auth2.signOut().then(function() {
    console.log('logged out');
    window.location.reload();
  });
}

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

    this.$http.defaults.headers.common.Authorization =
        'Bearer ' + auth.access_token;

    userData = this.parseJwt(auth.access_token);
    // TODO setup default auth.
    this.user = this.User.get({id: userData.user.id});
    return this.user;
  }.bind(this));
}

LoginService.prototype.parseJwt = function(jwt) {
  parts = jwt.split('.')
  claims = parts[1]
  claims = atob(claims);
  data = JSON.parse(claims);
  return data;
}

angular.module('loginService', [
  'ngResource',
  'config'
])
.service('loginService', LoginService)
.config(function($httpProvider) {
  $httpProvider.interceptors.push('authInterceptor');
})
.factory('authInterceptor', function ($injector, $q, $templateCache) {
  return {
    response: function(response) {
      if (response.data.data) {
        // Handle API's which always return json with a data object.
        return $q.resolve({
          data: response.data.data
        })
      }
      return $q.resolve(response);
    },
    responseError: function (response) {
      if (response.status == 403 || response.status == 401) {
        // Need to lazy inject this to avoid a dependency cycle.
        console.warn('Should attempt relogin here?');
        // var loginService = $injector.get('loginService');
        // loginService.badResponse();
      }
      alert('Error occurred')
      // Fail the request.
      return $q.reject(response);
    }
  }
});
