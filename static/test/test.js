var MainController = function() {
  this.tab = 'Common';
  this.tabs = ['Common', 'Style1'];
}

angular.module('test', [
  'ngRoute',
])
.config(function($locationProvider, $routeProvider) {
  $locationProvider.html5Mode(true).hashPrefix('!');
  $routeProvider.otherwise({
    templateUrl: '/static/test/AllThings.tpl.html'
  });
})
.controller('MainController', MainController)