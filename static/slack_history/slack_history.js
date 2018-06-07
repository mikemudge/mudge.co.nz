var MainController = function($resource, $location) {
  var params = $location.search();
  var name = params.name;

  var SlackUser = $resource('/static/slack_history/metadata.json')
  this.metadata = SlackUser.get(function(metadata) {
    this.users = [];
    this.userMap = {};
    Object.keys(metadata.users).forEach(function(k) {
      var user = {
        'id': k,
        'username': metadata.users[k],
        // This was alenni's color in slack.
        // TODO should use random for everyone else?
        'color': '#C938EB'
      };
      if (k == 'U0C90MHEH') {
        // Set my color to what it was in slack.
        user['color'] = '#9092D4'
      }
      this.users.push(user);
      this.userMap[user.id] = user;
    }.bind(this));
  }.bind(this));

  if (!name) {
    this.error = "No name specified"
    // TODO could load metadata and list names?
    return;
  }

  var SlackHistory = $resource('/static/slack_history/direct_messages/' + name + '.json')
  this.history = SlackHistory.get();

  this.history.$promise.then(function(history) {
    console.log(history);
    this.history.messages.forEach(function(message) {
      message.date = new Date(parseInt(message.ts.split('.')[0], 10) * 1000);
    }.bind(this));
  }.bind(this));
}

/**
 * The angular module
 */
angular.module('slack_history', [
  'config',
  'ngResource',
  'ngRoute',
])
.config(function($locationProvider, $routeProvider, config) {
  $locationProvider.html5Mode(true).hashPrefix('!');
  $routeProvider.otherwise({
    templateUrl: '/static/slack_history/slack_history.tpl.html'
  });
})
.controller('MainController', MainController)
.filter('reverse', function() {
  return function(items) {
    if (items) {
      return items.slice().reverse();
    }
    return items;
  };
})
;