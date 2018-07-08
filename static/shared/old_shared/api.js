var AuthInterceptor = function ($injector, $q, $templateCache) {
  return {
    request: function(req) {
      if (req.url.substr(-9) == '.tpl.html') {
        if (!$templateCache.get(req.url)) {
          // Template missing;
          // No templates are available through http requests.
          console.warn($templateCache);
          console.warn('Template not in templateCache ' + req.url)
          throw new Error('stop looping');
        } else {
          // This seems to happen even though no http request actually gets made.
        }
      }
      return req;
    },
    response: function(response) {
      if (response.data.data) {
        // Handle API's which always return json with a data object.
        return $q.resolve({
          data: response.data.data
        })
      }
      return $q.resolve(response);
    },
    responseError: function (response) {
      if (response.status == 403 || response.status == 401) {
        // Need to lazy inject this to avoid a dependency cycle.
        var loginService = $injector.get('loginService');
        loginService.badResponse();
      } else {
        console.error('Error for response', response.status, response);
        // TODO show human friendly message in alert.
        var message = "Unknown error"
        if (response.data.message) {
          message = response.data.message;
        }
        alert("Something went wrong: " + message);
        // throw new Error('broken');
      }
      // Fail the request.
      return $q.reject(response);
    }
  }
};

var NotFoundController = function($location, $scope) {
  $scope.route = $location.path();
}

var AdminController = function(adminConfig) {
  this.config = adminConfig;
}

var ListController = function(adminConfig, $routeParams, $resource) {
  // Figure out what the model is?
  var model = $routeParams.model;
  var modelConfig = adminConfig.models[model];
  if (model) {
    this.Model = $resource(adminConfig.api_url + modelConfig.endpoint);
    this.items = this.Model.query();
  } else {
    this.welcome = true
  }
}

require('./templates/404.tpl.html')
require('./templates/admin.tpl.html')
require('./templates/table.tpl.html')

require('./login/login.js')

angular.module('api', [
  'login/login.tpl.html',
  'mmLogin',
  'ngRoute',
  'templates/404.tpl.html',
  'templates/admin.tpl.html',
  'templates/table.tpl.html'
])
.constant('adminConfig', {
  // get a config from somewhere
  // TODO support dynamically loading these for each app.
  'name': 'Tournament',
  'api_url': 'http://localhost:5000/api/tournament/',
  'models': {
    'tournament': {
      'endpoint': 'tournament'
    },
    'team': {
      'endpoint': 'team'
    },
    'round': {
      'endpoint': 'round'
    },
    'match': {
      'endpoint': 'match'
    }
  }
})
.controller('AdminController', AdminController)
.controller('ListController', ListController)
.controller('NotFoundController', NotFoundController)
.config(function($locationProvider, $routeProvider) {
  $routeProvider.when('/admin', {
    templateUrl: 'templates/admin.tpl.html',
  })
  .when('/admin/:model', {
    templateUrl: 'templates/table.tpl.html',
  })
  .otherwise({
    templateUrl: 'templates/404.tpl.html'
  })
})
.run(function($rootScope, config) {
  // variables on $rootScope will be available for reading from all $scopes
  // through scope inheritance.
  $rootScope.config = config;
})
.config(function($httpProvider) {
  $httpProvider.interceptors.push('authInterceptor');
})
.factory('authInterceptor', AuthInterceptor)
;