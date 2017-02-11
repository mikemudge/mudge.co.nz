var TournamentController = function($resource) {
  window.ctrl = this;
  this.Tournament = $resource('/api/tournament/tournament/:id', {
    'id': '@id'
  });

  this.tournaments = this.Tournament.query();
}

var CreateTournamentController = function($resource) {
  this.Settings = $resource('/api/tournament/settings/:id');
  this.Team = $resource('/api/tournament/team/:id');
  this.Tournament = $resource('/api/tournament/tournament/:id');

  this.teams = this.Team.query();
  this.newTournament = new this.Tournament();
}

CreateTournamentController.prototype.createSettings = function() {
  this.newSettings = new this.Settings();
}

CreateTournamentController.prototype.createTournament = function() {
  // Add teams?
  this.newTournament.teams = this.teams.filter(function(team) {
    return team.selected;
  });

  // TODO add to tournaments and go to next page?
  this.newTournament.$save();
}

angular.module('tournament', [
  'ngMaterial',
  'ngResource',
  'ngRoute'
])
.controller('CreateTournamentController', CreateTournamentController)
.controller('TournamentController', TournamentController)
.config(function($routeProvider, $locationProvider) {
  $locationProvider.html5Mode(true);
  $routeProvider
    .when('/new', {
      templateUrl: '/static/tournament/create_tournament.html'
    })
    .when('/', {
      templateUrl: '/static/tournament/tournament.html'
    })
    .otherwise({
      'templateUrl': '/static/tournament/tournament.html'
    });
})
.config(function($httpProvider) {
  $httpProvider.interceptors.push('myHttpInterceptor');
})
.factory('myHttpInterceptor', function($q) {
  return {
    response: function(response) {
      // do something on success
      if (response.data.data) {
        console.log(response.data.data);
        return response.data;
      }
      return response;
    },
    responseError: function(rejection) {
      // TODO handle responses with errors better than this.
      alert('Error happened, see console for more');
      console.log(rejection);
      return $q.reject(rejection);
    }
  };
});

