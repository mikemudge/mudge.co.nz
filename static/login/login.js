var LoginController = function(loginService) {
  window.ctrl = this;
  this.loginService = loginService;
  this.currentUser = loginService.user;
  this.googleLoginButton = false;
  loginService.google.promise.then(function(gUser) {
    console.log('Google user arrived', gUser)
  }, function() {
    // No google user
    this.googleLoginButton = true;
  }.bind(this));
}

LoginController.prototype.loginWithGoogle = function() {
  this.loginService.loginWithGoogle().then(function() {
    console.log('login complete');
    // Do we need to do anything here?
  });
}

angular.module('login', [
  'loginService',
  'ngRoute',
])
.controller('LoginController', LoginController)
.config(function($routeProvider, $locationProvider) {
  $locationProvider.html5Mode(true);
  $routeProvider
    .when('/login', {
      templateUrl: '/static/login/login.html'
    });
});