var AdminController = function($resource, $scope, userService) {
  this.userService = userService;
  this.$scope = $scope;

  this.User = $resource('/api/user', {}, {
    register: {
      method: 'POST',
      url: '/api/register'
    },
    init: {
      method: 'POST',
      url: '/init/users'
    }
  });
  this.users = this.User.query();
}

AdminController.prototype.loginUsingGoogle = function() {
  this.userService.loginToGoogle();
}

AdminController.prototype.initUsers = function() {
  this.users = this.User.init();
}

AdminController.prototype.deleteUser = function(user) {
  // Only send the user id when deleting, don't need anything else.
  this.User.remove({id: user.id});
}

AdminController.prototype.registerUser = function() {
  console.log(this.register);
  this.User.register(this.register, function(response) {
    console.log(response);
  });
}

angular.module('admin', [
  'config',
  'userService',
  'ngResource',
  'ngRoute'
])
.controller('AdminController', AdminController)
.config(function($locationProvider, $routeProvider, config) {
  $locationProvider.html5Mode(true);
  $routeProvider
    .otherwise({
      templateUrl: config.basePath + 'admin/admin.html',
    });
})
;