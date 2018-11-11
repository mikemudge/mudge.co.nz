var MainController = function($interval) {
  this.time = new Date();
  // 0 based month, so January.
  this.dob = new Date(1988, 0, 8, 10, 55, 0);

  $interval(function() {
    this.time = new Date();
    if (this.dob) {
      var billion = this.dob.valueOf() + 1000000000 * 1000
      this.billionSecondsOld = new Date(billion);
      this.twoBillionSecondsOld = new Date(this.dob.valueOf() + 2000000000 * 1000);
      this.ageSeconds = ((this.time - this.dob).valueOf() / 1000).toFixed(0);
    }
  }.bind(this), 50);
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