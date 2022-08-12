
// Angular trys to load this modules.
// TODO make angular optional?
angular.module('p5_test', [
  'config',
  'ngRoute'
])
.config(function($routeProvider, config) {
  $routeProvider
    .otherwise({
      templateUrl: '/static/p5_test/p5_test.tpl.html',
    });
});
