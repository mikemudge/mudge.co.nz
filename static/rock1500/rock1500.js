var auth2 = {
  auth2: null,
  cbs: [],
  addCallback: function(cb) {
    if (this.auth2) {
      cb.apply(null, [this.auth2]);
    }
    this.cbs.push(cb)
  },
  load: function() {
    this.auth2 = gapi.auth2.init({
      client_id: '872711897303-6rkqgedhsq6rni9ikt6j6v8rbhkkkd7a.apps.googleusercontent.com'
    });
    var i = 0;
    for (;i < this.cbs.length;i++) {
      this.cbs[i].apply(null, [this.auth2]);
    }
  }
}

// Called when the google auth script is downloaded.
function initGoogle() {
  gapi.load('auth2', auth2.load.bind(auth2));
}
(function() {
  var js = document.createElement('script');
  js.src = 'https://apis.google.com/js/api:client.js?onload=initGoogle'
  var fjs = document.getElementsByTagName('script')[0];
  fjs.parentNode.insertBefore(js, fjs);
})();

var MyController = function($resource, $scope) {
  this.$scope = $scope;
  this.Rock1500 = $resource('/api/rock1500');
  this.Rock1500Song = $resource('/api/rock1500song');

  this.newsong = new this.Rock1500Song();
  this.songs = this.Rock1500Song.query(function() {
    this.songs.sort(function(song1, song2) {
      return song1.name.localeCompare(song2.name);
    });
  }.bind(this));

  this.googleUser = null;
  auth2.addCallback(this.setAuth.bind(this));
}

MyController.prototype.setAuth = function(auth2) {
  this.auth2 = auth2;
  auth2.currentUser.listen(this.googleUserChanged.bind(this));
}

MyController.prototype.googleUserChanged = function(user) {
  this.loginComplete = true;
  if (!user.isSignedIn()) {
    // No google account is logged in, clear google data.
    this.googleUser = null;
    this.$scope.$apply();
    console.log('Not Logged in:', this.googleUser);
    return;
  }

  // If signup we need to create the user in the 8i DB.
  var parts = user.getAuthResponse().id_token.split('.');
  var data = JSON.parse(atob(parts[1]))
  this.googleUser = {
    id_token: user.getAuthResponse().id_token,
    data: data,
    name: data.name,
    email: data.email
  };
  this.$scope.$apply();

  this.me = this.Rock1500.get({id_token: this.googleUser.id_token}, function(me) {
    console.log(me);
    if (!me.picks) {
      me.picks = [];
    }
  });
  this.me.picks = [];

  console.log('Logged in:', this.googleUser);
};

MyController.prototype.logout = function() {
  this.prompt = 'select_account';
  this.auth2.signOut();
}

MyController.prototype.loginToGoogle = function() {
  if (!this.auth2) {
    alert('auth2 not ready');
    return;
  }
  // 'prompt': 'none' will login without showing a popup if it can.
  this.auth2.signIn({
    'scope': 'profile email',
    'prompt': this.prompt
  });
}
MyController.prototype.addSong = function(song) {
  if (!song.name) {
    alert('You need to enter a song name.');
    return;
  }
  if (!song.band) {
    alert('You need to enter a band name.');
    return;
  }
  var match = this.songs.find(function(song2) {
    return song.name.toLowerCase() == song2.name.toLowerCase() &&
        song.band.toLowerCase() == song2.band.toLowerCase()
  });
  if (match) {
    alert('That song already exists. Displaying it now.');
    this.$scope.filter = match.name;
    return;
  }

  song.$save(function() {
    console.log('song saved');
    this.songs.push(song);
  }.bind(this));
}

MyController.prototype.deleteSong = function(song) {
  song.$remove(function() {
    idx = this.songs.indexOf(song)
    this.songs.splice(idx, 1);
    console.log('song removed');
  }.bind(this));
}

MyController.prototype.addPick = function(song) {
  if (this.me.picks.length >= 10) {
    alert('Already have 10 picks, you need to remove some first.');
    return;
  }
  number = this.me.picks.findIndex(function(pick) {
    return pick.id == song.id;
  });
  if (number !== -1) {
    alert('You have already picked ' + song.name + ' at number ' + (number + 1));
    return;
  }

  this.me.picks.push(song);
}

MyController.prototype.removePick = function(song) {
  number = this.me.picks.indexOf(song);
  this.me.picks.splice(number, 1);
}

MyController.prototype.savePicks = function() {
  this.me.id_token = this.googleUser.id_token;
  this.me.$save(function() {
    console.log('saved picks');
  }.bind(this));
}

var ShowPicksController = function($resource) {
  this.Rock1500 = $resource('/api/rock1500picks');

  this.picks = this.Rock1500.query(function(picks) {
    picks.forEach(function(rock1500) {
      rock1500.picks = JSON.parse(rock1500.picks);
    })
  });
}

angular.module("rock1500", [
  'ngResource',
  'ngRoute'
])
.controller('MyController', MyController)
.controller('ShowPicksController', ShowPicksController)
.config(function($routeProvider, $locationProvider) {
  $locationProvider.html5Mode(true);
  $routeProvider
    .when('/picks', {
      templateUrl: '/static/rock1500/viewPicks.html'
    })
    .otherwise({
      templateUrl: '/static/rock1500/makePicks.html'
    });
})
.run([
  '$rootScope',
  function($rootScope) {
    // see what's going on when the route tries to change
    $rootScope.$on('$routeChangeStart', function(event, next, current) {
      // next is an object that is the route that we are starting to go to
      // current is an object that is the route where we are currently
      console.log('Starting to leave', current, next);
    });
  }
]);
