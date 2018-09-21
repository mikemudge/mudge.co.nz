function DashboardController($resource, loginService, config, $interval) {
  window.ctrl = this;
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
      this.loadSongs();
      this.seconds = 60;
    }
  }.bind(this), 1000);
  this.loadSongs();
}

DashboardController.prototype.loadSongs = function(response) {
  // Just update the songs, in the background.
  this.Songs.import().$promise.then(this.importComplete.bind(this));
}

DashboardController.prototype.importComplete = function(response) {
  this.songs = this.Songs.query({
    'count': 50,
    'worst_rank': 100,
  });

  this.recent = this.Songs.recent({
    'count': 10
  });

  this.highest_rank = 1500;
  this.recent.$promise.then(function(response) {
    this.highest_rank = response[0].rankThisYear;
    console.log('recent', response.length);
    if (this.songs) {
      this.songs.splice(this.highest_rank - 1)
    }
  }.bind(this));

  this.songs.$promise.then(function(response) {
    console.log('coming', response.length);
    this.songs.splice(this.highest_rank - 1)
  }.bind(this));
}

DashboardController.prototype.importSongs = function() {
  this.Songs.import().$promise.then(function() {
    console.log('Import complete');
    window.location.reload();
  });
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
