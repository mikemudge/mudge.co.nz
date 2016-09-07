var MyController = function($resource) {
  this.Rock1500 = $resource('/api/rock1500');
  this.Rock1500Song = $resource('/api/rock1500song');

  this.me = this.Rock1500.get({}, function(me) {
    console.log(me);
    if (!me.picks) {
      me.picks = [];
    }
  });
  this.me.picks = [];

  this.newsong = new this.Rock1500Song();
  this.songs = this.Rock1500Song.query();
}

MyController.prototype.addSong = function(song) {
  song.$save(function() {
    console.log('song saved');
    this.songs.push(song);
  }.bind(this));
}

MyController.prototype.addPick = function(song) {
  number = this.me.picks.indexOf(song)
  if (number === -1) {
    this.me.picks.push(song);
  } else {
    alert('You have already picked ' + song.name + ' at number ' + (number + 1));
  }
}

MyController.prototype.savePicks = function() {
  this.me.$save(function() {
    console.log('saved picks');
  }.bind(this));
}

angular.module("rock1500", [
  'ngResource'
])
.controller('MyController', MyController)
