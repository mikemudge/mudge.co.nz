var MainController = function($interval, $location) {
  this.time = new Date();
  this.$location = $location;
  // 0 based month, so January.
  this.dob = new Date(1988, 0, 8, 10, 55, 0);
  var params = $location.search();
  if (params.dob) {
    d = new Date(params.dob * 1000);
    if (d) {
      this.dob = d;
    }
  }

  $interval(function() {
    this.time = new Date();
    if (this.dob) {
      var billion = this.dob.valueOf() + 1000000000 * 1000
      this.billionSecondsOld = new Date(billion);
      this.increasingSecondsOld = new Date(this.dob.valueOf() + 1234567890 * 1000);
      this.twoBillionSecondsOld = new Date(this.dob.valueOf() + 2000000000 * 1000);
      this.ageSeconds = ((this.time - this.dob).valueOf() / 1000).toFixed(0);
    }
  }.bind(this), 50);
}

MainController.prototype.updateDob = function() {
  this.$location.search('dob', this.dob.getTime() / 1000);
  this.dob;
}

angular.module('seconds', [
  'config',
  'ngRoute',
])
.controller('MainController', MainController)
.config(function($locationProvider, $routeProvider) {
  $routeProvider.when('/', {
    templateUrl: '/static/seconds/seconds.tpl.html'
  })
})