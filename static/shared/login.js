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
      client_id: config.GOOGLE_CLIENT_ID
    });
    var i = 0;
    for (;i < this.cbs.length;i++) {
      this.cbs[i].apply(null, [this.auth2]);
    }
  }
}

// Called when the google auth script is downloaded.
function initGoogle() {
  // This seems to clear the console???
  gapi.load('auth2', auth2.load.bind(auth2));
}

window.initGoogle = initGoogle;
(function() {
  var js = document.createElement('script');
  js.src = 'https://apis.google.com/js/api:client.js?onload=initGoogle'
  var fjs = document.getElementsByTagName('script')[0];
  fjs.parentNode.insertBefore(js, fjs);
})();

var LoginService = function(config, $http, $location, $resource, $q) {
  this.$http = $http;
  this.$location = $location;
  this.$q = $q;

  if (!config.CLIENT_ID || !config.CLIENT_SECRET) {
    throw new Error('Login service requires CLIENT_ID and CLIENT_SECRET');
  }
  var auth = window.btoa(config.CLIENT_ID + ":" + config.CLIENT_SECRET);
  this.Login = $resource(config.LOGIN_URL + 'api/auth', {}, {
    connect: {
      method: 'POST',
      url: config.LOGIN_URL + 'auth/connector-token',
      headers: {'Authorization': 'Basic ' + auth}
    }
  });
  this.currentStatus = "Checking login";
  this.User = $resource(config.LOGIN_URL + 'api/user/:id', {
    'id': '@id'
  });

  // Attempt to load user from cache
  this.user = this.loadFromStorage();
  if (!this.user) {
    // No local user available, make a fresh one with no creds.
    this.user = new this.User();
    this.currentStatus = "No login available";
  }

  // Add google.
  this.googleStatus = "Checking google login";
  this.google = this.$q.defer();
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
    this.googleStatus = "No google login";
    this.google.reject();
    return;
  }

  // Get the jwt.
  var parts = user.getAuthResponse().id_token.split('.');
  var data = JSON.parse(atob(parts[1]));

  this.googleStatus = "Logged in as " + data.email;
  this.googleUser = {
    id_token: user.getAuthResponse().id_token,
    data: data,
    name: data.name,
    email: data.email
  };
  this.google.resolve(this.googleUser);
};

// Call this at first load of an app.
// Currently being called by api.js at runtime.
LoginService.prototype.ensureLoggedIn = function() {
  // TODO check if there is a logged in user.
  if (this.currentAccess) {
    var remaining = this.currentAccess.exp - Date.now() / 1000
    console.log('already have access for', remaining.toFixed(0), 'more seconds');
    if (remaining > 300) {
      // You are logged in for at least 5 more minutes.
      return true;
    }
    // Otherwise we should request a new token.
  }

  console.warn('Ensuring login');
  // Prevent any bad responses from adding more promise listeners.
  this.already_know = true;

  // Otherwise attempt subtle log in and refresh.
  // TODO support worst case show a login modal to open google popup.
  this.google.promise.then(function () {
    return this.loginWithGoogle();
  }.bind(this), function(a){
    console.log('no google');
    this.$location.path("/login");
  }.bind(this)).then(function(googleUser) {
    console.log('Now logged in after ensureLoggedIn.',  googleUser);
    if (googleUser) {
      console.log('Will reload in 5 seconds');
      setTimeout(function() {
        console.log('Reloading now');
        window.location.reload();
      }, 5000);
    }
  }.bind(this));
  return false;
};

// Call this when a bad response is recieved by an API call.
LoginService.prototype.badResponse = function(response) {
  // TODO double check what we do here.
  if (this.already_know) {
    // Nothing else we can do.
    console.warn('Already trying a relogin');
    return;
  }

  if (response.status == 401) {
    alert('Trying to access a resource which you are not authorized for\n'
        + response.data.message + '\n' + response.data.detail);
    // TODO figure out the best action?
    console.error(this.currentAccess);
    console.error(response.data);
  }

  console.warn('Attempting relogin');
  this.already_know = true;
  this.google.promise.then(function() {
    return this.loginWithGoogle();
  }.bind(this)).then(function(user) {
    console.log('user', user);
    console.log('Now logged in after bad response.');
    // TODO can we just re send the request?
    // window.location.reload();
  }.bind(this));
};

LoginService.prototype.logout = function() {
  // Start a new promise?
  this.google = this.$q.defer();

  // Clear all storage of login information.
  sessionStorage.removeItem('mudge.auth.access_token');
  sessionStorage.removeItem('mudge.auth.refresh_token');

  // Clear the authorization.
  this.$http.defaults.headers.common['Authorization'] = null;

  // TODO is there a way to clear this without duplicating?
  this.user = new this.User();
  this.currentStatus = 'Logged out';
};

// Returns a promise which will be resolved when a user is logged in.
LoginService.prototype.loginWithGoogle = function() {
  if (!this.googleUser) {
    // Need to login to google first.
    console.log('Not logged into google yet.');

    // TODO not sure if promise was rejected or just not resolved yet?
    // We need to create a new promise so we can be sure it will get resolved???
    this.google = this.$q.defer();

    // Now tell google we need a user signed in to show the popup.
    this.auth2.signIn();

    return this.google.promise.then(function() {
      // Then try again?
      console.log('google login success?');
      // TODO should just go straight to Login.connect()?
      return this.loginWithGoogle();
    }.bind(this));
  }

  console.log('googleUser exists', this.googleUser)
  console.log('Attempting connect');
  var auth = this.Login.connect({
    type: 'google',
    id_token: this.googleUser.id_token
  });

  var result = auth.$promise.then(function(response) {
    if (!response.access_token) {
      throw new Error('Unexpected response from connector-token');
    }
    this.currentAccess = this.getValidJwt(response.access_token);
    this.currentStatus = 'Logged in to mudge.co.nz';
    // Jwts are valid, we can store them in sessionStorage.
    sessionStorage['mudge.auth.access_token'] = response.access_token;
    // TODO use this?
    // sessionStorage['mudge.auth.refresh_token'] = response.refresh_token;

    // Update default headers to be authorized from now on.
    this.$http.defaults.headers.common['Authorization'] = 'Bearer ' + response.access_token;

    this.user.id = this.currentAccess.user.id;
    // Hit the server to load all the rest of the user data.
    return this.user.$get();
  }.bind(this));
  return result;
}

// Returns a user object or null.
// The user object will have local data and be loading the full data
LoginService.prototype.loadFromStorage = function() {
  var accessJwt = sessionStorage['mudge.auth.access_token'];
  if (!accessJwt) {
    return null;
  }
  try {
    this.currentAccess = this.getValidJwt(accessJwt);
  } catch(e) {
    console.warn('Invalid access_token:', e.message);
    // Need to refresh or require login again.
    this.refreshToken();
    return null;
  }

  this.$http.defaults.headers.common['Authorization'] = 'Bearer ' + accessJwt;

  var remaining = this.currentAccess.exp - Date.now() / 1000
  remaining = remaining.toFixed();
  this.currentStatus = "Found login " + this.currentAccess.user.email + " with " + remaining + " seconds remaining";

  // Create a User object with the local user data.
  var user = new this.User(this.currentAccess.user);
  user.$get();
  return user;
}

LoginService.prototype.refreshToken = function() {
  // If its expired we can check the refresh token.
  var refreshJwt = sessionStorage['mudge.auth.refresh_token'];
  if (!refreshJwt) {
    return null;
  }
  try {
    var authData = this.getValidJwt(refreshJwt);
  } catch(e) {
    console.warn('Invalid refresh jwt:', e);
    return;
  }

  return this.Login.refresh({
    'refresh_token': refreshJwt
  });
};

LoginService.prototype.getValidJwt = function(jwt) {
  var params = this.parseJwt(jwt);
  var now = Math.round(Date.now() / 1000);
  // Add 5 seconds as a buffer for client vs server clocks.
  if (params.iat && now + 5 < params.iat) {
    console.log('Issued =', params.iat, 'now =', now)
    // Even though its not valid yet, put it into sessionStorage.
    // This way eventually it will be valid and the user can auth.
    // Otherwise the user will forever be stuff getting new tokens.
    sessionStorage['mudge.auth.access_token'] = jwt;
    // TODO track this only as a warning?
    // Need to inform sentry.
    throw Error('Not Issued Yet?');
  }
  if (now > params.exp) {
    console.log('Expiry =', params.exp, 'now =', now)
    throw Error('Expired jwt');
  }
  // Otherwise its valid.
  return params;
}

LoginService.prototype.parseJwt = function(jwt) {
  var parts = jwt.split('.');
  var data = JSON.parse(atob(parts[1]));
  return data;
}

var LoginController = function(loginService, $location) {
  // For debugging.
  window.login = this;
  this.$location = $location;
  this.loginService = loginService;
  this.currentUser = loginService.user;
  // TODO if not logged in make sure to show a modal?
  this.debug = [
    "Checking authentication"
  ];

  loginService.google.promise.then(function(gUser) {
    this.debug.push("Google user available " + gUser.email);
    console.log('Google user arrived', gUser);
  }.bind(this), function() {
    this.debug.push("No Google user, will need manual login");
    // No google user
    this.googleLoginButton = true;
  }.bind(this));
}

LoginController.prototype.loginWithGoogle = function() {
  this.loginService.loginWithGoogle().then(function() {
    console.log('login complete, reloading the app at .');
    // Do we need to do anything here?
    // Redirect to app?
    this.$location.path('.');
  }.bind(this));
}
LoginController.prototype.login = function() {
  this.loginService.loginWithGoogle();
}
LoginController.prototype.logout = function() {
  this.loginService.logout();
}

angular.module('mmLogin', [
  'config',
  'ngResource',
  'ngRoute',
])
.controller('LoginController', LoginController)
.config(function($routeProvider) {
  $routeProvider
    .when('/login', {
      templateUrl: '/static/shared/login.tpl.html'
    });
})
.service('loginService', LoginService)
;