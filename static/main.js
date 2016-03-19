var MainController = function($resource, $scope, $route, $location) {
  this.$scope = $scope
  console.log($route);
  console.log($location.path());
  this.User = $resource('/api/user', {}, {
    'befriend': {
      method: "POST",
      url: '/api/friends'
    }
  });
  this.$scope.users = this.User.query({'extras': 'all_friends'});
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

// TODO make this a service so it persists between pages?
var LoginControl = function($resource) {
  User = $resource('/api/user', {}, {
    'login': {
      method: 'POST',
      url: '/api/login'
    },
    'register': {
      method: 'POST',
      url: '/api/register'
    }
  });
};

LoginControl.prototype.createUser = function(user) {
  User.register(user, angular.bind(this, function(result) {
    this.result = result;
  }));
};

LoginControl.prototype.login = function(user) {
  User.login(user, angular.bind(this, function(result) {
    this.result = result;
  }));
};

angular.module('main', [
  'ngResource',
  'ngRoute'
])
.controller('MainController', MainController)
.controller('LoginControl', LoginControl)
.config(function($routeProvider, $locationProvider) {
  $locationProvider.html5Mode(true);
  $routeProvider
    .when('/', {
      templateUrl: '/static/main.html'
    })
    .when('/login', {
      templateUrl: '/static/login.html'
    })
    .otherwise({
      'templateUrl': '/static/main.html'
    });
});