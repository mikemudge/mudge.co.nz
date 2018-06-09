var MainController = function(loginService, $resource) {
  this.Friend = $resource('/auth/friends', {}, {});
  window.ctrl = this;

  this.user = loginService.user;
  this.friends = this.Friend.query();

  // TODO show apps this user uses?
  // And maybe apps their friends use.
}
MainController.prototype.handleSearch = function() {
  this.search_results = this.Friend.query({
    all: true,
    search: this.friend.search
  });
}

MainController.prototype.addFriend = function(user) {
  // Update the friends list with the response.
  this.Friend.save({'friend_id': user.id}).$promise.then(function(response) {
    this.friends = response.friends;
  }.bind(this));
}

MainController.prototype.removeFriend = function(user) {
  // Update the friends list with the response.
  this.Friend.remove({'friend_id': user.id}).$promise.then(function(response) {
    this.friends = response.friends;
  }.bind(this));
}

/**
 * The angular module
 */
angular.module('user', [
  'api',
  'config',
  'mmLogin',
  'ngResource',
  'ngRoute',
])
.run(function(loginService) {
  // You must be logged in to use this app.
  loginService.ensureLoggedIn();
})
.config(function($locationProvider, $routeProvider, config) {
  $locationProvider.html5Mode(true).hashPrefix('!');
  $routeProvider.otherwise({
    templateUrl: '/static/user/User.tpl.html'
  });
})
.controller('MainController', MainController)
;