
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

var UserService = function($resource, $rootScope) {
  this.$rootScope = $rootScope;
  this.User = $resource('/api/user', {}, {
    'login': {
      method: 'POST',
      url: '/api/login'
    },
    'register': {
      method: 'POST',
      url: '/api/register'
    }
  });

  // TODO longer persistance?
  if (sessionStorage.auth_token) {
    this.user = this.User.get({'auth_token': sessionStorage.auth_token})
  }
};

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

angular.module('user', [
  'ngRoute'
])
.controller('LoginControl', LoginControl)
.service('userService', UserService)
.config(function($routeProvider) {
  $routeProvider
    .when('/login', {
      templateUrl: '/static/common/login.html'
    })
});