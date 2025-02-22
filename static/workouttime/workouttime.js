var MainController = function($interval, $location, $scope) {
  this.$location = $location;
  this.$interval = $interval;
  this.$scope = $scope;

  this.times = [{value: 5}, {value: 2}];
  // Init these values so the default display looks ok.
  this.timeIndex = 0;
  this.loops = 0;
  this.time = 0;

  var x = document.createElement("AUDIO");
  x.type = 'audio/wav';
  x.addEventListener('canplaythrough', function (audio) {
    // Loaded but we can't play it until a user interaction has happened.
    this.beepAudio = audio.target;
  }.bind(this));
  x.src = '/static/workouttime/beep.wav';
}

MainController.prototype.start = function() {
  // reset loop counter, time and timeIndex to support restart.
  this.loops = 0;
  this.time = 0;
  this.timeIndex = 0;
  this.lastChange = new Date().getTime();

  if (this.alreadyRunning) {
    // we don't need to rerun.
    return;
  }
  this.alreadyRunning = this.$interval(function() {
    now = new Date().getTime();
    this.time = now - this.lastChange;
    if (this.time >= this.times[this.timeIndex].value * 1000) {
      // Increment the last change so that any excess is counted towards the next period.
      this.lastChange += this.times[this.timeIndex].value * 1000;
      this.timeIndex++;
      this.beepAudio.currentTime = 0;
      if (this.beepAudio.paused) {
        this.beepAudio.play();
      }
    }
    if (this.timeIndex >= this.times.length) {
      this.timeIndex = 0;
      this.loops++;
      if (this.loops % 10 === 0) {
        this.beepAudio.currentTime = 0;
        if (this.beepAudio.paused) {
          this.beepAudio.play();
        }
      }
    }
    // this.$scope.$apply();
  }.bind(this), 50);
}

angular.module('workouttime', [
  'config',
  'ngRoute',
])
.controller('MainController', MainController)
.config(function($locationProvider, $routeProvider, config) {
  $routeProvider.when('/', {
    templateUrl: '/static/workouttime/workouttime.tpl.html?v=' + config.version
  })
})