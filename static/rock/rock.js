function RockController($resource, loginService, config, $rootScope, $timeout) {
  window.ctrl = this;
  this.$timeout = $timeout;
  this.Songs = $resource(config.API_URL + 'api/rock1500/song', {}, {
    import: {
      url: '/rock1500/import',
      isArray: true
    }
  });

  this.Picks = $resource(config.API_URL + 'api/rock1500/picks');

  this.currentUser = loginService.user;
  console.log(this);
  $rootScope.title = "Rock"

  this.picks = this.Picks.query(function(response) {
    response.sort(function(a, b) {
      return a.position - b.position;
    });
  });
}

RockController.prototype.getTitle = function(song) {
  result = song.title + " by " + song.artist.name;
  if (Number.isInteger(song.rank2017)) {
    result += "\npreviously ranked " + song.rank2017;
  } else {
    result += "\npreviously ranked " + song.rank2016;
  }
  return result;
}

RockController.prototype.addPick = function(song) {
  var match = this.picks.find(function(p) {
    return p.song.id == song.id;
  });
  if (match) {
    alert('song already picked');
    return;
  }
  this.picks.push({
    'song': song
  });

  // Clear the suggestions after a pick is made.
  this.add_pick = null
  this.suggests = [];
}

RockController.prototype.removePick = function(pick) {
  var idx = this.picks.indexOf(pick);
  if (idx === -1) {
    alert('Not in list');
    return;
  }
  this.picks.splice(idx, 1);
}

RockController.prototype.savePicks = function() {
  // This saves as an in order array to preserve position of the picks.
  this.Picks.save({
    'picks': this.picks
  });
}

RockController.prototype.importSongs = function() {
  this.Songs.import().$promise.then(function() {
    console.log('Import complete');
    window.location.reload();
  });
}

RockController.prototype.updateSuggestions = function() {

  if (this.suggest_timer) {
    // Cancel the last timer and reset.
    this.$timeout.cancel(this.suggest_timer);
  }

  // Only load suggestions after 300 millis without a change to the search.
  this.suggest_timer = this.$timeout(this.loadSuggestions.bind(this), 300);
}

RockController.prototype.loadSuggestions = function() {
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
  // TODO newly added "picks" don't have an id and can be easily confused if there are multiple added.
  // They all will have an effective id of '' which makes them all equal.
  var moved_id = $event.dataTransfer.getData('Text');
  var match = this.picks.findIndex(function(p) {
    return moved_id == p.id;
  });
  var to_idx = this.picks.findIndex(function(p) {
    return pick.id == p.id;
  });
  // TODO can we splice this at pick up time?
  var moved = this.picks.splice(match, 1)[0];
  this.picks.splice(to_idx, 0, moved);
}

var ArtistController = function($resource, config, $routeParams) {
  this.Album = $resource(config.API_URL + 'api/rock1500/album/:id');
  this.Artist = $resource(config.API_URL + 'api/rock1500/artist/:id');
  this.Songs = $resource(config.API_URL + 'api/rock1500/song');

  this.artist_id = $routeParams.artist_id;
  this.artist = this.Artist.get({id: this.artist_id});
  this.songs = this.Songs.query({
    artist_id: this.artist_id
  });
  this.albums = this.Album.query({
    artist_id: this.artist_id
  });
}

var AlbumController = function($resource, config, $routeParams) {
  this.Album = $resource(config.API_URL + 'api/rock1500/album/:id');
  this.Songs = $resource(config.API_URL + 'api/rock1500/song');

  this.album_id = $routeParams.album_id;
  this.album = this.Album.get({id: this.album_id});
  this.songs = this.Songs.query({
    album_id: this.album_id
  });
}

var SongsController = function($resource, config, $rootScope, $timeout, $location, loginService) {
  window.ctrl = this;
  this.$location = $location;
  this.Songs = $resource(config.API_URL + 'api/rock1500/song');
  this.currentUser = loginService.user;

  $rootScope.title = "Rock"

  this.limit = 100;
  this.start = 0;
  var params = $location.search();
  if (params.limit) {
    this.limit = parseInt(params.limit);
  }
  if (params.start) {
    this.start = parseInt(params.start);
  }
  this.reload();
}

SongsController.prototype.load = function(start) {
  this.start = start;
  if (this.start < 0) {
    this.start = 0;
  } else if (this.start > 1500) {
    // TODO this should look at total results in the DB
    this.start = 1480;
  }
  this.reload();
}

SongsController.prototype.reload = function() {
  this.$location.search({limit: this.limit, start: this.start});
  this.songsLoading = true;
  this.songs = this.Songs.query({limit: this.limit, start: this.start});
}

var HeaderController = function($location, $route) {
  this.path = $location.path();
}

angular.module('rock', [
  'api',
  'config',
  'mmLogin',
  'ngResource',
  'ngRoute',
  'rockDash'
])
.controller('SongsController', SongsController)
.controller('AlbumController', AlbumController)
.controller('ArtistController', ArtistController)
.controller('HeaderController', HeaderController)
.controller('RockController', RockController)
.run(function(loginService) {
  // You must be logged in to use this app.
  loginService.ensureLoggedIn();
})
.config(function($locationProvider, $routeProvider, config) {
  $locationProvider.html5Mode(true);
  $routeProvider.when('/songs', {
    templateUrl: '/static/rock/songs.tpl.html?v=' + config.version,
    reloadOnSearch: false,
  }).when('/picks', {
    templateUrl: '/static/rock/picks.tpl.html?v=' + config.version
  }).when('/artist/:artist_id', {
    templateUrl: '/static/rock/artist.tpl.html?v=' + config.version
  }).when('/album/:album_id', {
    templateUrl: '/static/rock/album.tpl.html?v=' + config.version
  }).otherwise({
    templateUrl: '/static/rock/dashboard.tpl.html?v=' + config.version
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
