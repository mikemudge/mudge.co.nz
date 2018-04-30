function DashboardController($resource, loginService, config, $timeout) {
  window.ctrl = this;
  this.Songs = $resource(config.API_URL + 'api/rock1500/song');

  loginService.ensureLoggedIn();

  this.highest_rank = 1500;
  this.songs = this.Songs.query({'count': 2000});
  this.songs.$promise.then(this.songsLoaded.bind(this));

  $timeout(function() {
    // Reload the songs each minute in case there is new ones.
    this.songs = this.Songs.query({'count': 2000});
    this.songs.$promise.then(this.songsLoaded.bind(this));
  }.bind(this), 60000);
}

DashboardController.prototype.songsLoaded = function(response) {
  console.log(this.songs.length);
  this.showTop100();
}

DashboardController.prototype.showTop100 = function(response) {
  this.highest_rank = 2000;
  this.songs.forEach(function(song) {
    if (song.rank2017) {
      this.highest_rank = Math.min(song.rank2017, this.highest_rank);
    }
  }.bind(this));

  this.filtered_songs = this.songs.filter(function(song) {
    if (song.title == 'Nookie'){
      return true;
    }
    return !song.rank2017 && parseInt(song.rank2016) < 300;
  });

  this.recent = this.songs.filter(function(song) {
    return song.rank2017 && song.rank2017 < this.highest_rank + 10;
  }.bind(this));

  this.filtered_songs.splice(this.highest_rank);
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
