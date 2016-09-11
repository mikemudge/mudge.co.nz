var MyController = function($resource, $route, userService) {
  this.AuthedModel = $resource('/api/authedModel');
  this.userService = userService;
  this.$route = $route;
  this.myThings = this.AuthedModel.query();
  this.newThing = new this.AuthedModel();
}

MyController.prototype.login = function() {
  this.userService.loginToGoogle(function() {
    this.$route.reload();
  }.bind(this));
}

MyController.prototype.create = function(newThing) {
  this.newThing.$save(function() {
    this.newThing = new this.AuthedModel();
  });
}
angular.module('test', [
  'ngResource',
  'ngRoute',
  'userService'
])
.controller('MyController', MyController)
.config(function($locationProvider, $routeProvider) {
  $locationProvider.html5Mode(true);
  $routeProvider
    .when('/', {
      templateUrl: '/static/test/test.html'
    })
    .when('/login', {
      templateUrl: '/static/common/login.html'
    })
});
