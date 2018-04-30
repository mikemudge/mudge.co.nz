function TournamentService($resource, loginService) {
  this.Tournament = $resource('http://localhost:5000/api/tournament/tournament/:id', {
    id: '@id'
  }, {
    'generate_rounds': {
      'method': 'POST',
      'url': 'http://localhost:5000/api/tournament/tournament/:id/generate_rounds'
    }
  });
  this.Match = $resource('http://localhost:5000/api/tournament/match/:id', {
    id: '@id'
  });

  loginService.ensureLoggedIn();
  // TODO paginate?
  this.tournaments = this.Tournament.query();
  this.cache = {};
}

TournamentService.prototype.loadTournament = function(id) {
  if (!this.cache[id]) {
    this.cache[id] = this.Tournament.get({
      id: id
    });
  }
  return this.cache[id]
}
var TournamentListController = function($scope, tournamentService) {
  this.tournaments = tournamentService.tournaments;
}

var TournamentCreateController = function(tournamentService) {
  var Tournament = tournamentService.Tournament;
  this.tournamentService = tournamentService;
  this.newTournament = new Tournament();
  this.newTournament.teams = [];
}

TournamentCreateController.prototype.newTournamentTeam = function() {
  this.newTournament.teams.push(this.newTeam);
  this.newTeam = {}
}

TournamentCreateController.prototype.save = function(tournament) {
  if (!tournament.id) {
    // Add the tournament to the list if it is a newly created one.
    this.tournamentService.tournaments.push(tournament);
  }
  tournament.$save();
}

var TournamentController = function($routeParams, $scope, tournamentService) {
  if (!$routeParams.tournament_id) {
    throw Error('No tournament selected');
  }

  this.tournament = tournamentService
      .loadTournament($routeParams.tournament_id);
}

TournamentController.prototype.generate_rounds = function() {
  this.tournament.$generate_rounds();
}

var TableController = function($routeParams, tournamentService) {
  if (!$routeParams.tournament_id) {
    console.error('No tournament id available');
    return;
  }
  this.tournament = tournamentService.loadTournament($routeParams.tournament_id);
  this.tournament.$promise.then(this.prepTable.bind(this))
}

TableController.prototype.prepTable = function(tournament) {
  console.log(tournament);
  // Iterate teams/matches and calculate wins.
  var teamMap = {}
  tournament.teams.forEach(function(team) {
    teamMap[team.id] = {
      name: team.name,
      gf: 0,
      ga: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      pnts: 0,
      played: 0,
      pnts: 0,
    };
  });

  tournament.rounds.forEach(function(round) {
    round.matches.forEach(function(match) {
      if (match.played) {
        var hTeam = teamMap[match.homeTeam.id];
        var aTeam = teamMap[match.awayTeam.id];
        hTeam.played++;
        aTeam.played++;
        hTeam.gf += match.homeScore;
        hTeam.ga += match.awayScore;
        aTeam.gf += match.awayScore;
        aTeam.ga += match.homeScore;
        if (match.homeScore > match.awayScore) {
          hTeam.wins++;
          aTeam.losses++;
          hTeam.pnts+=3;
        } else if (match.homeScore == match.awayScore) {
          hTeam.draws++;
          aTeam.draws++;
          hTeam.pnts+=1;
          aTeam.pnts+=1;
        } else {
          hTeam.losses++;
          aTeam.wins++;
          aTeam.pnts+=3;
        }
      }
    })
  });

  this.teamMap = teamMap
}

var RoundController = function($location, $routeParams, $scope, tournamentService) {
  this.$location = $location;
  if (!$routeParams.tournament_id) {
    throw new Error('No tournament_id')
  }

  this.tournament = tournamentService.Tournament.get({
    id: $routeParams.tournament_id
  });
  var params = $location.search();
  var roundIdx = params.round || 0;

  this.tournament.$promise.then(function() {
    this.currentRound = this.tournament.rounds[roundIdx];
  }.bind(this));
}

RoundController.prototype.selectRound = function(round) {
  this.currentRound = round;
  var idx = this.tournament.rounds.indexOf(round);
  this.$location.search('round', idx)
}

var MatchController = function($location, $routeParams, tournamentService) {
  this.$location = $location;
  this.tournament_id = $routeParams.tournament_id;

  // TODO should get a cached version of this.
  // As all matches of a round should be loaded by the previous page
  this.match = tournamentService.Match.get({
    id: $routeParams.match_id
  });

  this.match.$promise.then(function() {
    // this.match.result = {};
  })
}

MatchController.prototype.submit = function() {
  this.match.$save().then(function(response) {
    console.log(response);
    // Return to the rounds page???
    if (this.tournament_id) {
      this.$location.path('tournament/' + this.tournament_id + '/rounds');
    } else {
      console.log('No tournament to return to?')
    }
  }.bind(this));
}

var HeaderController = function($routeParams, tournamentService) {
  this.tournament = tournamentService.Tournament.get({
    id: $routeParams.tournament_id
  });
}

angular.module('tournament', [
  'api',
  'config',
  'mmLogin',
  'ngResource',
  'ngRoute',
])
.controller('HeaderController', HeaderController)
.controller('MatchController', MatchController)
.controller('RoundController', RoundController)
.controller('TableController', TableController)
.controller('TournamentController', TournamentController)
.controller('TournamentCreateController', TournamentCreateController)
.controller('TournamentListController', TournamentListController)
.config(function($locationProvider, $routeProvider) {
  $locationProvider.html5Mode(true);
  $routeProvider.when('/', {
    templateUrl: '/static/tournament/tournaments.tpl.html'
  })
  .when('/tournament/:tournament_id', {
    templateUrl: '/static/tournament/tournament.tpl.html'
  })
  .when('/tournament/:tournament_id/table', {
    templateUrl: '/static/tournament/table.tpl.html'
  })
  .when('/tournament/:tournament_id/rounds', {
    templateUrl: '/static/tournament/rounds.tpl.html'
  })
  .when('/tournament/:tournament_id/match/:match_id', {
    templateUrl: '/static/tournament/match.tpl.html'
  })
})
.service('tournamentService', TournamentService)
;