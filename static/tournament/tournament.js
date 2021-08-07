function TournamentService($resource, loginService) {
  this.Tournament = $resource('/api/tournament/tournament/:id', {
    id: '@id'
  }, {
    'generate_rounds': {
      'method': 'POST',
      'url': '/api/tournament/tournament/:id/generate_rounds'
    }
  });
  this.Match = $resource('/api/tournament/match/:id', {
    id: '@id'
  });

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

TournamentService.prototype.save = function(tournament) {
  var created = !tournament.id;
  // TODO make sure the tournament is the same as the cached one?
  return tournament.$save().then(function() {
    if (created) {
      // Add the tournament to the list if it is a newly created one.
      this.tournaments.push(tournament);
    }
  }.bind(this));
}

TournamentService.prototype.createNew = function() {
  var t = new this.Tournament();
  t.teams = [];
  return t;
}

var TournamentListController = function(loginService, tournamentService) {
  this.currentUser = loginService.user;
  this.ctrl = this;
  this.tournaments = tournamentService.tournaments;
}

var TournamentController = function(
    $routeParams, $location, $timeout, loginService, tournamentService) {
  if (!$routeParams.tournament_id) {
    throw Error('No tournament selected');
  }

  this.currentUser = loginService.user;
  this.$location = $location;
  this.$timeout = $timeout;
  this.tournamentService = tournamentService;
  this.ctrl = this;
  if ($routeParams.tournament_id == 'new') {
    this.tournament = tournamentService.createNew();
    this.newTeam = {};
  } else {
    this.tournament = tournamentService
        .loadTournament($routeParams.tournament_id);
    this.tournament.$promise.then(this.countMatches.bind(this));
  }
}

TournamentController.prototype.newTournamentTeam = function() {
  if (!this.newTeam.name || this.newTeam.name.length == 0) {
    // TODO show an error?
    return;
  }
  this.tournament.teams.push(this.newTeam);
  this.newTeam = {}
}

// TODO Saving an existing tournament is failing due to team ordering.
TournamentController.prototype.save = function() {
  var created = !this.tournament.id;
  this.tournamentService.save(this.tournament).then(function() {
    if (created) {
      // Generate the rounds for the tournament.
      this.tournament.$generate_rounds().then(function() {
        // Redirect to the tournament page.
        this.$location.path('tournament/' + this.tournament.id);
      }.bind(this));
    }
  }.bind(this));
}

TournamentController.prototype.countMatches = function() {
  var total = 0;
  var completed = 0;
  var currentRound = null;
  // Calculate the number of matches and results?
  this.tournament.rounds.forEach(function(r) {
    r.matches.forEach(function(m) {
      total++;
      if (m.result) {
        completed++;
      } else {
        if (!currentRound) {
          // This will be set to the first round with a match to play.
          currentRound = r;
        }
      }
    });
  });

  this.currentRound = currentRound;
  this.totalMatches = total;
  this.completedMatches = completed;
  this.percent = (100 * completed / total).toFixed(1);
}

TournamentController.prototype.generate_rounds = function() {
  this.tournament.$generate_rounds().then(function() {
    console.log("Rounds generated");
    // Display a notification to show that rounds are generated?
    this.notify = "Rounds generated";
    this.$timeout(function() {
      this.notify = null;
      // Go back to the tournament page.
      this.$location.path('tournament/' + this.tournament.id);
    }.bind(this), 2000);
  }.bind(this));
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
      if (match.result) {
        var hTeam = teamMap[match.homeTeam.id];
        var aTeam = teamMap[match.awayTeam.id];
        if (!hTeam) {
          throw new Error('No team for match.homeTeam');
        }
        if (!aTeam) {
          throw new Error('No team for match.awayTeam');
        }
        var result = match.result;
        hTeam.played++;
        aTeam.played++;
        hTeam.gf += result.homeScore;
        hTeam.ga += result.awayScore;
        aTeam.gf += result.awayScore;
        aTeam.ga += result.homeScore;
        if (result.homeScore > result.awayScore) {
          hTeam.wins++;
          aTeam.losses++;
          hTeam.pnts+=3;
        } else if (result.homeScore == result.awayScore) {
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

  this.teamMap = teamMap;
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
.controller('TournamentListController', TournamentListController)
.run(function(loginService, $rootScope) {
  // You must be logged in to use this app.
  loginService.ensureLoggedIn();
  $rootScope.title = "Tournament";
})
.config(function($locationProvider, $routeProvider) {
  $locationProvider.html5Mode(true);
  $routeProvider.when('/', {
    templateUrl: '/static/tournament/tournaments.tpl.html'
  })
  .when('/tournament/:tournament_id', {
    templateUrl: '/static/tournament/tournament.tpl.html'
  })
  .when('/tournament/:tournament_id/settings', {
    templateUrl: '/static/tournament/tournament_edit.tpl.html'
  })
  .when('/tournament/:tournament_id/table', {
    templateUrl: '/static/tournament/table.tpl.html'
  })
  .when('/tournament/:tournament_id/rounds', {
    reloadOnSearch: false,
    templateUrl: '/static/tournament/rounds.tpl.html'
  })
  .when('/tournament/:tournament_id/match/:match_id', {
    templateUrl: '/static/tournament/match.tpl.html'
  })
})
.service('tournamentService', TournamentService)
;