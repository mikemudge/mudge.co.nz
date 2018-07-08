var MainController = function($resource, config) {
  var Project = $resource(config.API_URL + 'api/project/project');

  this.projects = Project.query();
}

angular.module('projects', [
  'api',
  'config',
  'ngResource',
  'ngRoute',
])
.controller('MainController', MainController)
.config(function($routeProvider, config) {
  $routeProvider
    .otherwise({
      templateUrl: '/static/projects/projects.tpl.html',
    });
});
