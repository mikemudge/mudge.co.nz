var MainController = function($resource, $scope, $route, $location) {
  this.$scope = $scope
  this.User = $resource('/api/user', {}, {
    'befriend': {
      method: "POST",
      url: '/api/friends'
    }
  });
  this.$scope.users = this.User.query({'extras': 'all_friends'});
  this.$scope.allUsers = this.User.query();
};

MainController.prototype.saveUser = function(user) {
  this.User.save(user, function(response) {
    if (response.error) {
      alert(response.error);
    }
    // User was successfully updated.
  });
};

MainController.prototype.befriend = function(user, friend) {
  this.User.befriend({}, {
    initiator_id: user.id,
    'recipient_id': friend.id
  }, function(response) {
    if (response.error) {
      alert(response.error);
    }
    // update user and friend with the change?
  })
};

angular.module('main', [
  'ngResource',
  'ngRoute',
  'user'
])
.controller('MainController', MainController)
.config(function($routeProvider, $locationProvider) {
  $locationProvider.html5Mode(true);
  $routeProvider
    .when('/', {
      templateUrl: '/static/main.html'
    })
    .otherwise({
      'templateUrl': '/static/main.html'
    });
});