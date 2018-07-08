angular.module('cv', [
  'config',
  'ngRoute',
])
.run(function($rootScope, config) {
    $rootScope.config = config;
})
.config(function($locationProvider, $routeProvider) {
  $locationProvider.html5Mode(true);
  $routeProvider.otherwise({
    templateUrl: '/static/cv/cv.tpl.html'
  })
})
;
