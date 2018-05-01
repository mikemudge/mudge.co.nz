function RockController($resource, loginService, config) {
  window.ctrl = this;
  this.Songs = $resource(config.API_URL + 'api/rock1500/song');

  this.Picks = $resource(config.API_URL + 'api/rock1500/picks');

  loginService.ensureLoggedIn();

  this.picks = this.Picks.get(function(response) {
    response.picks.sort(function(a, b) {
      return a.position - b.position;
    });
  });
}

RockController.prototype.addPick = function(song) {
  var match = this.picks.picks.find(function(p) {
    return p.song.id == song.id;
  });
  if (match) {
    alert('song already picked');
    return;
  }
  this.picks.picks.push({
    'song': song
  });

  // Clear the suggestions after a pick is made.
  this.add_pick = null
  this.suggests = [];
}

RockController.prototype.removePick = function(pick) {
  var idx = this.picks.picks.indexOf(pick);
  if (idx === -1) {
    alert('Not in list');
    return;
  }
  this.picks.picks.splice(idx, 1);
}

RockController.prototype.savePicks = function() {
  this.picks.$save();
}

RockController.prototype.updateSuggestions = function() {
  this.suggests = [];
  var value = this.add_pick.toLowerCase();
  if (this.add_pick.length < 2) {
    // Don't auto suggest with 0 letters
    return;
  }

  this.suggests = this.Songs.query({
    'search': value
  });
}

RockController.prototype.handleDrop = function(pick, $event) {
  var moved_id = $event.dataTransfer.getData('Text');
  var match = this.picks.picks.findIndex(function(p) {
    return moved_id == p.id;
  });
  var to_idx = this.picks.picks.findIndex(function(p) {
    return pick.id == p.id;
  });
  // TODO can we splice this at pick up time?
  var moved = this.picks.picks.splice(match, 1)[0];
  this.picks.picks.splice(to_idx, 0, moved);
}

angular.module('rock', [
  'api',
  'config',
  'mmLogin',
  'ngResource',
  'ngRoute',
  'rockDash'
])
.controller('RockController', RockController)
.config(function($locationProvider, $routeProvider) {
  $locationProvider.html5Mode(true);
  $routeProvider.when('/dashboard', {
    templateUrl: '/static/rock/dashboard.tpl.html'
  }).otherwise({
    templateUrl: '/static/rock/home.tpl.html'
  });
})
// https://parkji.co.uk/2013/08/11/native-drag-and-drop-in-angularjs.html
.directive('draggable', function() {
  return function(scope, element) {
    // this gives us the native JS object
    var el = element[0];

    el.draggable = true;

    el.addEventListener(
        'dragstart',
        function(e) {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('Text', this.id);
            this.classList.add('drag');
            return false;
        },
        false
    );

    el.addEventListener(
        'dragend',
        function(e) {
            this.classList.remove('drag');
            return false;
        },
        false
    );
  }
})
.directive('droppable', function() {
  return {
    scope: {
      drop: '&'
    },
    link: function(scope, element) {
      // again we need the native object
      var el = element[0];
      el.addEventListener('dragover', function(e) {
        e.dataTransfer.dropEffect = 'move';
        // allows us to drop
        if (e.preventDefault) e.preventDefault();
        this.classList.add('over');
        return false;
      }, false);

      el.addEventListener('dragenter', function(e) {
        this.classList.add('over');
        return false;
      }, false);

      el.addEventListener('dragleave', function(e) {
        this.classList.remove('over');
        return false;
      }, false);

      el.addEventListener('drop', function(e) {
        // Stops some browsers from redirecting.
        if (e.stopPropagation) e.stopPropagation();

        this.classList.remove('over');

        scope.drop({'$event': e});
        scope.$apply();

        return false;
      }, false);
    }
  }
})
;