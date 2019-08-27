function DashboardController($resource, loginService, config, $interval) {
  window.ctrl = this;
  this.currentUser = loginService.user;
  this.Songs = $resource(config.API_URL + 'api/rock1500/next', {}, {
    recent: {
      url: config.API_URL + 'api/rock1500/recent',
      isArray: true
    },
    import: {
      url: '/rock1500/import',
      isArray: true
    }
  });

  // Reload the songs each minute in case there is new ones.
  this.seconds = 60;
  $interval(function() {
    this.seconds--;
    console.log('refresh in ', this.seconds);
    if (this.seconds == 0) {
      this.importSongs();
      this.seconds = 60;
    }
  }.bind(this), 1000);

  // Load the data for the panels.
  this.loadPredictions();
  this.loadRecent();

  // Now make the call to import the latest songs.
  this.importSongs();
}

DashboardController.prototype.loadRecent = function(response) {
  // Load the recent songs initially as quick as we can.
  this.recent = this.Songs.recent({
    'count': 10
  });
}

DashboardController.prototype.loadPredictions = function(response) {
  // Just update the songs, in the background.
  this.songs = this.Songs.query({
    'count': 50,
    'worst_rank': 100,
  });
}

DashboardController.prototype.importSongs = function(response) {
  // Just update the songs, in the background.
  // We want to get the up to date information, although this can take a while.
  this.Songs.import().$promise.then(this.importComplete.bind(this));
}

DashboardController.prototype.importComplete = function(response) {
  console.log('Import complete');

  // Update the panels.
  this.loadRecent();
  this.loadPredictions();
}

angular.module('rockDash', [
  'config',
  'ngResource',
  'ngRoute',
])
.controller('DashboardController', DashboardController)
.config(function($locationProvider, $routeProvider) {
  $routeProvider.when('/dashboard', {
    templateUrl: '/static/rock/dashboard.tpl.html'
  });
})
;
