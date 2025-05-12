
// Angular trys to load this modules.
// TODO make angular optional?
if (typeof angular !== 'undefined') {
  angular.module('p5', [
    'config',
    'ngRoute'
  ])
      .config(function ($routeProvider, config) {
        $routeProvider
            .otherwise({
              templateUrl: '/static/p5/p5.tpl.html',
            });
      });
}
