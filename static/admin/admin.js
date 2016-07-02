var AdminController = function($resource) {
  this.User = $resource('/api/user', {}, {
    register: {
      method: 'POST',
      url: '/api/register'
    }
  });
  this.users = this.User.query();
}

AdminController.prototype.registerUser = function() {
  console.log(this.register);
  this.User.register(this.register, function(response) {
    console.log(response);
  });
}

angular.module('admin', [
  'config',
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