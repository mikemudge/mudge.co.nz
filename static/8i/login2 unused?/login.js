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
  gapi.load('auth2', auth2.load.bind(auth2));
}
(function() {
  var js = document.createElement('script');
  js.src = 'https://apis.google.com/js/api:client.js?onload=initGoogle'
  var fjs = document.getElementsByTagName('script')[0];
  fjs.parentNode.insertBefore(js, fjs);
})();

var LoginService = function($http, $timeout, $location, $resource, $rootScope, $route, config, $q) {
  this.info = {};
  this.config = config;
  this.$location = $location;
  this.$http = $http;
  this.$rootScope = $rootScope;
  this.$route = $route;
  this.$timeout = $timeout;
  this.$q = $q;
  if (!this.config.WEB_CLIENT_ID) {
    throw new Error('Unable to create login service without config.WEB_CLIENT_ID')
  }
  this.chainOfEvents = [];

  // Make a promise which resolves when the google user is available.
  this.google = $q.defer();
  // Setup data and status from google auth.
  this.googleUser = {};
  this.googleStatus = "Checking google auth";
  this.google.promise.then(function(user) {
    this.googleStatus = "Logged in as google user " + this.googleUser.email;
  }.bind(this))


  var auth = window.btoa(config.WEB_CLIENT_ID + ":" + config.WEB_CLIENT_SECRET);
  this.Login = $resource(config.API_URL + '/auth/token', {
    'id': '@id'
  }, {
    socialAuth: {
      method: 'POST',
      url: config.API_URL + '/auth/connector-token',
      headers: {'Authorization': 'Basic ' + auth}
    },
    anon: {
      method: 'POST',
      url: config.API_URL + '/auth/guest-token',
      headers: {'Authorization': 'Basic ' + auth}
    },
  });

  this.User = $resource(config.API_URL + '/api/v1/users/:id', {
    'id': '@id'
  });

  // Check for auth token.
  this.user8i = this.loadFromStorage();

  if (this.user8i) {
    // Then load the full user.
    this.loginStatus = 'Loading user data.';
    this.user8i.promise = this.user8i.$get();
    this.user8i.promise.then(function() {
      this.loginStatus = 'Login Complete';
      // Set these again after the user loads.
      this.user8i.admin = this.currentAccess.scopes.includes('admin');
      this.user8i.staff = this.currentAccess.scopes.includes('staff');
    }.bind(this));

    // Do a reauth 60 seconds before our current auth expires.
    var delay = Math.max(this.remainingAuthTimeSeconds() - 60, 0);
    this.$timeout(this.stealthyReauth.bind(this), delay * 1000);
  } else {
    // If the user is not loaded, then auth using google.
    this.user8i = new this.User();
    var defer = $q.defer();
    this.user8i.promise = defer.promise;
    this.loginStatus = 'Checking for google user.';
    this.google.promise.then(function(user) {
      this.forceNewLogin().then(function(response) {
        // Once we return a login we can resolve the user8i.
        defer.resolve();
      });
    }.bind(this));
  };

  auth2.addCallback(this.setAuth.bind(this));
}

// Called by controllers who see a 401 or 403.
LoginService.prototype.badResponse = function() {
  if (this.alreadyKnow) {
    // We already know we need to reauth, just waiting on google.
    return;
  }
  console.warn('Attempting relogin');
  this.alreadyKnow = true;

  // TODO check if there is a refresh token and use it?
  this.google.promise.then(function() {
    this.forceNewLogin().then(function(response) {
      console.log('User should now be logged in');
      // Reload the page to refetch the api calls?
      window.location.reload();
      // Just reloading the route doesn't remake services which make http requests.
      // this.$route.reload();
      this.alreadyKnow = false;
    }.bind(this), function(error) {
      console.log('Error with auth', error);
      this.alreadyKnow = false;
    });
  }.bind(this), function() {
    // Else no google user available, go to /login?
    // Or show a login popup?
    window.location.href = '/login?nextPage=' + window.location.href
  });
}

LoginService.prototype.ensureLoggedIn = function() {
  // Called by angular apps which require a login.
  this.chainOfEvents.push('Login required by angular app');

  if (this.remainingAuthTimeSeconds() > 0) {
    // Already logged in.
    return true;
  }

  // Treat it the same as a badResponse.
  // TODO should probably call a common method?
  this.badResponse();
}

LoginService.prototype.stealthyReauth = function() {
  console.log('Reauthing due to expiry in', this.remainingAuthTimeSeconds(), 'seconds');
  // After google user available update the access token.
  this.google.promise.then(this.forceNewLogin.bind(this));
}

LoginService.prototype.requireLogin = function() {
  if (this.user8i.id) {
    // Already have a user, don't need to login.
    return true;
  }
  // TODO if this gets called more than once, just skip the latter.
  console.log('Require Login');
  if (this.googleUser.id_token) {
    this.forceNewLogin();
  } else {
    this.google.promise.then(function(user) {
      this.forceNewLogin().then(function(response) {
        // Reload the page to ensure all requests are remade?
        console.log('Reload required');
        // Ensure auth is there?
        this.$route.reload();
        // window.location.reload();
      }.bind(this));
    }.bind(this));
  }
  // Prevent additional API calls.
  return false;
}
LoginService.prototype.loginUsingGoogle = function() {
  if (this.googleUser.id_token) {
    this.chainOfEvents.push('loginUsingGoogle requested with google user');
    return this.forceNewLogin();
  }

  this.chainOfEvents.push('loginUsingGoogle requested with no google user');
  if (!this.auth2) {
    // TODO can we handle this better?
    throw Error('auth2 not loaded yet, try again shortly.');
  }

  return this.loginToGoogle().then(function(user) {
    // Once the user is logged into google we can use the id_token to log into 8i
    this.chainOfEvents.push('Logged into google, connecting to 8i');
    return this.forceNewLogin();
  }.bind(this));
}

// Log the user into Google via a popup window if required.
LoginService.prototype.loginToGoogle = function() {
  // In case we have already logged in as some one else, start a new promise?
  this.google = this.$q.defer();
  // Open a popup window letting the user login with google.
  // If successful will fire a googleUserChanged call and resolve this.google.promise.
  this.auth2.signIn({
    scope: 'profile email'
  });

  return this.google.promise;
}

LoginService.prototype.loginAnon = function(identity) {
  if (this.anonLoginInProgress) {
    // Already logging in.
    return this.anonLoginInProgress;
  }

  var login = this.Login.anon({
    identity: identity
  });

  this.anonLoginInProgress = login.$promise.then(function(response) {
    // Save this for future authing.
    this.anonLoginInProgress = null;
    this.currentAccess = this.saveLocalStorage(response);

    this.user8i.id = this.currentAccess.user.id;
    // TODO shouldn't use email as a determine if user exists.
    this.user8i.email = this.currentAccess.user.email;
    return this.user8i;
  }.bind(this));

  return this.anonLoginInProgress
}

LoginService.prototype.logout = function() {
  // In case we have already logged in as some one else, start a new promise?
  this.google = this.$q.defer();

  // Clear all storage of login information.
  localStorage.removeItem('eighti.auth.access_token');
  localStorage.removeItem('eighti.auth.refresh_token');

  // TODO is there a way to clear this without duplicating?
  this.user8i = new this.User()

  this.chainOfEvents.push('User logged out from 8i');
}

LoginService.prototype.forceNewLogin = function() {
  if (!this.googleUser.id_token) {
    throw new Error('No google id_token, can\'t force new login');
  }
  this.loginStatus = 'Authenticating using google user.';

  // Authenticate using google.
  // TODO support other options.
  var login = this.Login.socialAuth({
    type: 'google',
    access_token: this.googleUser.id_token
  });
  return login.$promise.then(function(response) {
    // Save this for future authing.
    this.currentAccess = this.saveLocalStorage(response);
    // Set user id and then load user data from server.
    this.user8i.id = this.currentAccess.user.id;
    this.user8i.email = this.currentAccess.user.email;
    this.user8i.admin = this.currentAccess.scopes.includes('admin');
    this.user8i.staff = this.currentAccess.scopes.includes('staff');

    this.loginStatus = 'Loading user data'
    this.user8i.$get().then(function() {
      // Set these again after the user loads.
      this.user8i.admin = this.currentAccess.scopes.includes('admin');
      this.user8i.staff = this.currentAccess.scopes.includes('staff');
    }.bind(this));

    // Do a reauth 60 seconds before our current auth expires.
    var delay = Math.max(this.remainingAuthTimeSeconds() - 60, 0);
    this.$timeout(this.stealthyReauth.bind(this), delay * 1000);

    return this.user8i;
  }.bind(this));
}

LoginService.prototype.remainingAuthTimeSeconds = function() {
  if (!this.currentAccess) {
    // Not completely accurate, but the user has no auth right now.
    return -1;
  }
  return this.currentAccess.exp - Math.floor(Date.now() / 1000);
}

LoginService.prototype.saveLocalStorage = function(response) {
  // Validate the jwts first.
  // TODO start using the refresh_token
  try {
    data = this.getValidJwt(response.access_token);
  } catch(e) {
    console.warn('Jwt Error:', e.message);
    return;
  }
  this.chainOfEvents.push('access jwt saved ' + data.user.email);
  // Jwts are valid, we can store them in localStorage.
  localStorage['eighti.auth.access_token'] = response.access_token;

  // Update deafult headers to be authorized from now on.
  this.$http.defaults.headers.common['Authorization'] = 'Bearer ' + response.access_token;

  return data
}

LoginService.prototype.loadFromStorage = function() {
  var accessJwt = localStorage['eighti.auth.access_token'];
  if (!accessJwt) {
    return null;
  }
  try {
    authData = this.getValidJwt(accessJwt);
  } catch(e) {
    // Need to refresh or require login again.
    this.refreshToken();
    return null;
  }

  this.chainOfEvents.push('access jwt loaded ' + authData.user.email);
  this.$http.defaults.headers.common['Authorization'] = 'Bearer ' + accessJwt;

  // Create a User object with the local user data.
  this.currentAccess = authData;
  var user = new this.User({
    id: authData.user.id,
    email: authData.user.email
  });
  user.admin = authData.scopes.includes('admin')
  user.staff = authData.scopes.includes('staff')
  return user;
}

LoginService.prototype.refreshToken = function() {
  // If its expired we can check the refresh token.
  var refreshJwt = localStorage['eighti.auth.refresh_token'];
  if (!refreshJwt) {
    return null;
  }
  try {
    authData = this.getValidJwt(refreshJwt);
  } catch(e) {
    console.warn('Invalid refresh jwt:', e);
    return;
  }

  return this.Login.refresh({
    'refresh_token': refreshJwt
  });
};

LoginService.prototype.setAuth = function(auth2) {
  // TODO if we have a cookie we can just send that straight to the 8i server?
  // Only need to hit google up when we don't know who the user is?
  this.auth2 = auth2;
  // Listen for sign-in state changes?
  // auth2.isSignedIn.listen(function(state) {
  //   console.log("Google signin state:" + state);
  // });
  // Listen for changes to current user.
  auth2.currentUser.listen(this.googleUserChanged.bind(this));
}

LoginService.prototype.getValidJwt = function(jwt) {
  var params = this.parseJwt(jwt);
  var now = Math.round(Date.now() / 1000);
  if (now > params.exp) {
    // Looks like it might be expired, but could just be client vs server clock.
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

// This is only called when 8i has permission to access the users basic info.
// It may be called more than once with the same user.
LoginService.prototype.googleUserChanged = function(user) {
  if (!user.isSignedIn()) {
    this.chainOfEvents.push('Google User logged out or not logged in');
    this.$rootScope.$apply();
    // reject the promise for log in.
    this.google.reject(user);
    return;
  }

  data = this.parseJwt(user.getAuthResponse().id_token);
  this.googleUser.id_token = user.getAuthResponse().id_token;
  this.googleUser.data = data;
  this.googleUser.name = data.name;
  this.googleUser.email = data.email;

  console.log('got google user', data.email)

  this.chainOfEvents.push('Google User logged in: ' + data.email);
  this.google.resolve(this.googleUser);

  // googleUser changed and 8i user changed if present.
  this.$rootScope.$apply();
};

// Show an example of the login service.
var LoginController = function(loginService, $location, $route, $scope) {
  window.loginCtrl = this;
  this.loginService = loginService;
  this.loginEvents = loginService.chainOfEvents;
  params = $location.search();
  this.debug = params['debug']
  this.nextPage = params['nextPage']

  this.current_user = loginService.user8i;
  if (this.nextPage) {
    loginService.user8i.promise.then(this.continueToNextPage.bind(this));
  };
}

LoginController.prototype.continueToNextPage = function(force) {
  if (!this.nextPage) {
    // No next page to go to.
    return;
  }
  console.log(this.loginService.user8i);
  // Already logged in, just redirect if thats whats asked for.
  // TODO track this, incase of infinite redirecting?
  lastTime = sessionStorage.getItem('eighti.auth.redirected', 0);
  diff = Date.now() - lastTime
  console.log('Time since last redirect', diff);
  if (diff > 10 * 1000 || force) {
    sessionStorage.setItem('eighti.auth.redirected', Date.now());
    // More than 10 seconds since the last redirect.
    window.location.href = this.nextPage;
  }
}

LoginController.prototype.loginUsingGoogle = function() {
  this.loginService.loginUsingGoogle().then(function() {
    this.continueToNextPage();
  }.bind(this));
}

LoginController.prototype.logout = function() {
  this.loginService.logout();
  this.current_user = this.loginService.user8i;

  // TODO immediately need to restrict access after a logout?
  window.location.reload();
}

angular.module("loginService2", [
  'config',
  'ngResource',
  'ngRoute'
])
.service('loginService', LoginService)
.controller('LoginController', LoginController)
.directive('eiLogin', function(config) {
  return {
    template: [
      '<div class="modal_back_overlay"></div>',
      '<div class="modal" ng-controller="LoginController as login">',
        '<div class="inner_modal">',
          '<h2> This page requires you to login </h2>',
          '<p ng-show="login.loginService.googleUser">',
            'Have a google user already {{ login.loginService.googleUser.email }}',
          '</p>',
          '<div class="button" ng-click="login.loginUsingGoogle()">',
            'Use google',
          '</div>',
        '</div>',
      '</div>'
    ].join('')
  }
})
;

// Example module which shows a page using it.
angular
    .module("loginExample2", [
      'config',
      'loginService2',
    ])
    .config(function($routeProvider, $locationProvider) {
      $locationProvider.html5Mode(true);
      $routeProvider
        .when('/', {
          templateUrl: '/static/angular/login2/login.html',
          title: '8i - login'
        })
        .otherwise({
          templateUrl: '/static/angular/login2/login.html',
          title: '8i - login'
        });
    })
    .config(function($httpProvider) {
      $httpProvider.interceptors.push('AuthInterceptor');
    })
    .factory('AuthInterceptor', function ($injector, $q) {
      return {
        response: function(response) {
          if (response.data.data) {
            // Handle API's which always return json with a data object.
            response.data = response.data.data
          }
          return $q.resolve(response);
        }
      }
    })
;
