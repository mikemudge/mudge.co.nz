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

var UserService = function(config, $cookies, $location, $resource, $rootScope) {
  this.$rootScope = $rootScope;
  this.config = config;
  this.$cookies = $cookies;
  this.User = $resource('/api/user', {}, {
    'login': {
      method: 'POST',
      url: '/api/login'
    },
    'register': {
      method: 'POST',
      url: '/api/register'
    },
    'init': {
      method: 'GET',
      url: '/init/users'
    }
  });

  this.cookie = $cookies.get(config.AUTH_COOKIE_ID);

  console.log("I found a user cookie:", this.cookie);

  if (this.cookie) {
    // This just needs to check the token is still valid?
    // May require relogin if its expired etc?
    this.user = this.User.get(function(response) {
      // Nothing else to do, you were logged in.
    }.bind(this), function(response) {
      console.log('response', response)
      if (response.status == 403) {
        // Need to login.
        if (this.googleUser) {
          this.User.login({
            'id_token': this.googleUser.id_token
          });
        }
        this.user.loginRequired = true;
      }
    }.bind(this));
  }

  // Always load google user data.
  this.googleUser = null;
  auth2.addCallback(this.setAuth.bind(this));
};

UserService.prototype.setAuth = function(auth2) {
  this.auth2 = auth2;
  auth2.currentUser.listen(this.googleUserChanged.bind(this));

  if (!this.cookie) {
    // Attempt passive login?
  }
}

UserService.prototype.googleUserChanged = function(user) {
  this.loginComplete = true;
  if (!user.isSignedIn()) {
    // No google account is logged in, clear google data.
    this.googleUser = null;
    console.log('Not Logged in:', this.googleUser);
    return;
  }

  // If signup we need to create the user in the 8i DB.
  var parts = user.getAuthResponse().id_token.split('.');
  var data = JSON.parse(atob(parts[1]))
  this.googleUser = {
    id_token: user.getAuthResponse().id_token,
    data: data,
    name: data.name,
    email: data.email
  };

  console.log('Logged in:', this.googleUser);

  // If there is no cookie or the user requires login then do it with id_token.
  if (!this.cookie || this.user.loginRequired) {
    this.user = this.User.login({
      'id_token': this.googleUser.id_token
    }, function() {
      if (this.loginCallback) {
        this.cookie = this.$cookies.get(this.config.AUTH_COOKIE_ID);
        this.loginCallback.apply();
      }
    }.bind(this));
  }
  this.$rootScope.$apply();
};

UserService.prototype.logout = function() {
  this.prompt = 'select_account';
  this.auth2.signOut();
}

UserService.prototype.loginToGoogle = function(callback) {
  if (!this.auth2) {
    alert('auth2 not ready');
    return;
  }
  this.loginCallback = callback;
  // 'prompt': 'none' will login without showing a popup if it can.
  this.auth2.signIn({
    'scope': 'profile email',
    'prompt': this.prompt
  });
}

UserService.prototype.register = function(user) {
  this.User.register(user, angular.bind(this, function(result) {
    this.result = result;
    if (result.auth_token) {
      sessionStorage.auth_token = result.auth_token;
    } else {
      sessionStorage.auth_token = ''
    }
  }));
};

UserService.prototype.login = function(user) {
  this.User.login(user, angular.bind(this, function(result) {
    this.result = result;
    if (result.user) {
      this.$rootScope.user = result.user;
    } else {
      this.$rootScope.user = undefined;
    }
    if (result.auth_token) {
      sessionStorage.auth_token = result.auth_token;
    } else {
      sessionStorage.auth_token = ''
    }
  }));
};

// Example control.
var LoginControl = function(userService) {
  window.login = this;
 this.userService = userService;
};

LoginControl.prototype.createUser = function(user) {
  this.user = this.userService.register(user);
};

LoginControl.prototype.login = function(user) {
  this.user = this.userService.login(user);
};

angular.module('userService', [
  'config',
  'ngCookies',
  'ngResource'
])
.service('userService', UserService)

angular.module('userExample', [
  'ngRoute',
  'userService'
])
.controller('LoginControl', LoginControl)
.config(function($routeProvider) {
  $routeProvider
    .when('/login', {
      templateUrl: '/static/common/login.html'
    })
});