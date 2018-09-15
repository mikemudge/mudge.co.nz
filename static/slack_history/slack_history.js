var MainController = function($resource, $location) {
  this.$location = $location;
  this.SlackHistory = $resource('/static/slack_history/direct_messages/:name.json')

  var SlackUser = $resource('/static/slack_history/metadata.json')

  this.metadata = SlackUser.get(function(metadata) {
    this.users = [];
    this.userMap = {};
    console.log(metadata);
    Object.keys(metadata.users).forEach(function(k) {
      var user = {
        'id': k,
        'username': metadata.users[k],
        'color': this.randomColor()
      }
      if (k == 'U0489AHLU') {
        user['color'] = '#C938EB'
      };
      if (k == 'U0C90MHEH') {
        // Set my color to what it was in slack.
        user['color'] = '#9092D4'
      }
      this.users.push(user);
      this.userMap[user.id] = user;
    }.bind(this));
  }.bind(this));

  var params = $location.search();
  if (params.name) {
    this.loadMessages(params.name);
  } else {
    console.log("Not loading anyone");
  }
}
MainController.prototype.loadMessages = function(name) {
  if (!name) {
    this.error = "No name specified"
    // TODO could load metadata and list names?
    return;
  }

  console.log("Loading " + name + ".json");
  this.history = this.SlackHistory.get({
    name: name
  });

  this.history.$promise.then(function(history) {
    console.log(history);
    this.history.messages.forEach(function(message) {
      message.date = new Date(parseInt(message.ts.split('.')[0], 10) * 1000);
    }.bind(this));
  }.bind(this));
}

MainController.prototype.selectUser = function(user) {
  this.$location.search('name', user.username);
}

MainController.prototype.randomColor = function() {
  // Pick a random hex in the color range.
  var val = (Math.random() * 16777216).toString(16);
  // Now pad it with 0's
  val = ("000000" + val).slice(-6);
  // And add a # to make it css friendly.
  return '#' + val;
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