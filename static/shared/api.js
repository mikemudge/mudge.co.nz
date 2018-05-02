
var AuthInterceptor = function ($injector, $q, $templateCache) {
  return {
    response: function(response) {
      console.debug('request', response.config.url);

      // Templates should only be requested from /static/...
      // Otherwise they can load the full page recursively and freeze the browser.
      if (response.config.url.endsWith('.tpl.html') && !response.config.url.startsWith('/static/')) {
        console.error('Loading template from non static location.');
        throw Error('Loading template from non static location.');
      }

      if (!response) {
        throw Error('No response');
      }
      if (response.data && response.data.data) {
        // Handle API's which always return json with a data object.
        return $q.resolve({
          data: response.data.data
        });
      }
      return $q.resolve(response);
    },
    responseError: function (response) {
      if (response.status == 0) {
        console.error('Weird 0 error', response);
        return;
      } else if (response.status == 403 || response.status == 401) {
        // Need to lazy inject this to avoid a dependency cycle.
        var loginService = $injector.get('loginService');
        loginService.badResponse();
        return $q.reject(response);
      } else {
        console.error('Error for response', response.status, response);
        // TODO show human friendly message in alert.
        var message = "Unknown error"
        if (response.data) {
          message = response.data;
        }
        if (response.data.message) {
          message = response.data.message;
        }
        alert("Something went wrong: " + message);
        console.error(message)
        console.log('response', response);
        return $q.reject(response);
      }
      // Fail the request.
      // return $q.reject(response);
    }
  }
};

angular.module('api', [
])
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