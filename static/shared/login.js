// Called when the google auth script is downloaded.
function initGoogle() {
  if (window.googleScriptReady) {
    window.googleScriptReady();
  } else {
    console.warn('Google script was ready before the googleScriptReady callback was set.');
  }
}

window.initGoogle = initGoogle;
(function() {
  var js = document.createElement('script');
  // js.src = 'https://apis.google.com/js/api:client.js?onload=initGoogle'
  js.src = 'https://accounts.google.com/gsi/client'
  js.onload = function() {
    initGoogle();
  };
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
  // 2 promises, one for the "One Tap" login, and then another for any login.
  this.googleAuto = this.$q.defer();
  this.google = this.$q.defer();

  // Update status based on result of auto login.
  this.googleAuto.promise.then((googleUser) => {
    this.googleStatus = "Auto Logged in as " + googleUser.email;
  }, (err) => {
    this.googleStatus = err;
  });
  // Also update status on result of any login.
  this.google.promise.then((googleUser) => {
    this.googleStatus = "Logged in as " + googleUser.email;
  });

  window.googleScriptReady = this.googleScriptReady.bind(this);
}

LoginService.prototype.googleScriptReady = function() {

  // Always need to have this initialized in case an app want to render a button.
  google.accounts.id.initialize({
    client_id: config.GOOGLE_CLIENT_ID,
    callback: this.googleUserChanged.bind(this)
  });

  if (this.currentAccess) {
    // We are already logged in, no need to prompt for One Tap login.
    // Seeing the prompt on every page is annoying for the user.
    this.googleStatus = 'Already logged in, not prompting';

    // TODO google isn't attempted here, so rejecting the promise so apps can show a login button.
    // We have login access for mudge.co.nz so didn't attempt google.
    this.googleAuto.reject('Not attempted, access token for mudge.co.nz already available.');
    return;
  }

  // Also prompt the user to login for one tap access if available.
  // If a user clicks X on the prompt its "skipped" for user_cancel.
  // Then if the user reloads its "not displayed" for suppressed_by_user.
  // If the user logs in or continues its "dismissed" for credential_returned.
  google.accounts.id.prompt((notification) => {
    // If not displayed or skipped, the user will need to use a button to login.
    if (notification.isNotDisplayed()) {
      this.googleAuto.reject("One Tap not displayed - " + notification.getNotDisplayedReason());
    }
    if (notification.isSkippedMoment()) {
      this.googleAuto.reject("One Tap skipped - " + notification.getSkippedReason());
    }
    // Dismissed can be a successful result, not sure if it can be anything else.
    // However success will also call the initialize callback.
    if (notification.isDismissedMoment()) {
      console.log("One Tap dismissed", notification.getDismissedReason());
    }
  });
}

// This is called on a successful login (auto or manual)
LoginService.prototype.googleUserChanged = function(response) {
  // response has clientId, credential and select_by fields.
  this.loginComplete = true;

  // Get the jwt.
  data = this.parseJwt(response.credential);

  this.googleStatus = "Logged in as " + data.email;
  this.googleUser = {
    id_token: response.credential,
    data: data,
    name: data.name,
    email: data.email
  };
  // Resolve the current promise with the googleUser value.
  this.google.resolve(this.googleUser);
  // TODO this could have already been rejected by One Tap login?
  // Can we check that and not resolve it here?
  this.googleAuto.resolve(this.googleUser);
};

LoginService.prototype.showGoogleButton = function() {
  // Called to render a google button on the current page.
  // Requires a div with an id of loginWithGoogle already on the page.
  google.accounts.id.renderButton(
    document.getElementById("googleLoginButton"),
    { theme: "outline", size: "large" }  // customization attributes
  );
}

// ensureLoggedIn will ensure that a user is availble for your app/page.
// If a user isn't available it will redirect to <app>/login to display a google sign in button.
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

  console.log('Ensuring login');

  // Prevent any bad responses from adding more promise listeners.
  this.already_know = true;

  // Wait for the google promise, and subtly log in to mudge.co.nz if we can.
  // Otherwise redirect to /login and show button for the user to login.
  this.googleAuto.promise.then(function () {
    // This will use the google account to login to mudge.co.nz
    return this.loginWithGoogle();
  }.bind(this), function(err) {
    // Login failed, will need to display the google button.
    this.showGoogleButton();

    // Depending on the page being /login a button will be rendered for the user to click.
    // This will redirect if the page is not already /login.
    // TODO this could be improved on, but requires some app specific login code.
    this.$location.path("/login");

    // Return a promise which will resolve after a manual login happens.
    // This is only useful when the page is already /login
    // It requires user action to proceed.
    return this.loginWithGoogle();
  }.bind(this)).then(function(user) {
    console.log('Now logged in after ensureLoggedIn.',  user.email);

    console.log(this.$location.path());
    if (this.$location.path() == '/login') {
      // /login is an app path, so it works for any app, E.g trail/login.
      console.log("Login success");

      // This would redirect to the "home" page for an app.
      // Currently works, but gets a 10 $digest() iterations reached. Aborting! error.
      // this.$location.path(".");

      // Could also redirect somewhere else if we have a redirect provided?
    } else {
      // Reload the page as there may have been bad requests.
      console.log('Will reload in 5 seconds');
      setTimeout(function() {
        console.log('Reloading now');
        window.location.reload();
      }, 1000);
    }
    // Here we reload the page, which is helpful for silent login after bad request.
    // On /login, reloading the page isn't so useful though, showing a success would be.
  }.bind(this));
  return false;
};

// Call this when a bad response is recieved by an API call.
LoginService.prototype.badResponse = function(response) {
  // TODO double check what we do here.
  if (this.already_know) {
    // Nothing else we can do.
    console.warn('Bad Response, Already attempting a relogin');
    return;
  }

  if (response.status == 403) {
    alert('Trying to access a resource which you are not allowed access\n'
        + response.data.message + '\n' + response.data.detail);
    // TODO figure out the best action?
    // Relogin shouldn't help but it might if the user logs in as someone else?
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
  // Log out of mudge.co.nz first

  // Clear all storage of login information.
  sessionStorage.removeItem('mudge.auth.access_token');
  sessionStorage.removeItem('mudge.auth.refresh_token');

  // Clear the authorization.
  this.$http.defaults.headers.common['Authorization'] = null;

  // TODO is there a way to clear this without duplicating?
  this.user = new this.User();
  this.currentAccess = null;
  this.currentStatus = 'Logged out';
};

// Returns a promise which will be resolved when a user is logged in.
// Uses a google user to log into mudge.co.nz
LoginService.prototype.loginWithGoogle = function() {
  // TODO should this method do nothing if there is already an authenticated user for mudge.co.nz?

  // Its possible for a logged in user to then log out. In that case there may be no google user.
  // How should that be handled? Maybe logout should reload the page (force the google stuff again).

  return this.google.promise.then((googleUser) => {
    console.log("Google login success");
    // Now just use the google user to authenticate with mudge.co.nz via ajax.
    var auth = this.Login.connect({
      type: 'google',
      id_token: googleUser.id_token
    });

    // Handle the response by persisting creds for a valid login.
    // Errors are just propegated to the caller.
    var result = auth.$promise.then((response) => {
      if (!response.access_token) {
        return this.$q.reject('Unexpected response from connector-token');
      }
      // Parse the jwt response.
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
    }, (err) => {
      return this.$q.reject(err);
    });

    return result;
  });
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
  this.currentStatus = "Found login " + this.currentAccess.user.email + " for " + remaining + " more seconds";

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
  return JSON.parse(atob(parts[1]));
}

var LoginController = function(loginService, $location, $scope) {
  // For debugging.
  window.login = this;
  this.$location = $location;
  this.$scope = $scope;
  this.loginService = loginService;
  this.currentAccess = loginService.currentAccess;
  this.currentUser = loginService.user;

  this.currentApp = config.appName;
  if (!this.currentApp) {
    // Don't show header "Back" on this page.
    this.home = true;
  }
  // Loads once the google auth completes.
  this.googleUser = null;

  // This is used to track the sequence of events which happen.
  this.debug = [
    "Checking authentication"
  ];

  loginService.googleAuto.promise.then(function() {
    this.debug.push("One Tap login to google");
  }.bind(this), function(err) {
    this.debug.push("One Tap: " + err + " - showing Google Login button");
    this.googleLoginButton = true;
    // Show the login button so the user can still login if they want to use the app.
    this.loginService.showGoogleButton();
  }.bind(this));

  // This promise is only resolved if a google user is available.
  loginService.google.promise.then(function(gUser) {
    this.googleUser = gUser;
    this.debug.push("Google user available: " + gUser.email);
  }.bind(this), function(err) {
    this.debug.push("Google User not available: " + err)
  });

  // This doesn't result in a logged in mudge.co.nz user until Login Using Google is clicked.

  // TODO Should we always show the google login button?
  // Do other pages than /login use the LoginController?
  // this.googleLoginButton = true;
  // this.loginService.showGoogleButton();

  // console.log("LoginController constructed");
}

// Use google creds to authenticate with mudge.co.nz.
LoginController.prototype.loginWithGoogle = function() {
  this.debug.push("Login with Google requested");
  this.loginService.googleAuto.promise.then((user) => {}, (err) => {
    this.debug.push("Google login required, click the sign in button");
  });
  this.loginService.loginWithGoogle().then((user) => {
    this.debug.push("Used google creds to login as " + user.email);
  });
}

LoginController.prototype.logout = function() {
  this.loginService.logout();

  this.debug.push("Logout");

  // Update the controllers view of the user.
  this.currentUser = this.loginService.user;
  this.currentAccess = this.loginService.currentAccess;
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