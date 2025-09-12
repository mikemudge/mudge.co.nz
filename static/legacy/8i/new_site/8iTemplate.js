// Little hack to return to the top of the page before leaving.
// This prevents refresh from trying to auto scroll to the last location.
$(window).on('beforeunload', function() {
    $(window).scrollTop(0);
});
var NotFoundController = function($location, $route, $scope) {
  var routes = [];
  for (r in $route.routes) {
    var route = $route.routes[r];
    if (route.originalPath && !route.redirectTo) {
      var path = route.originalPath.substr(1)
      if (route.originalPath === '/') {
        path = '.'
      }
      routes.push({
        'path': path,
        'template': route.templateUrl.substr(route.templateUrl.lastIndexOf('/'))
      });
    }
  }
  $scope.routes = routes;
  $scope.path = $location.path();
}

var FooterController = function() {}

FooterController.prototype.click = function(page) {
  ga('send', 'event', 'Click', 'footer', page);
}

var SocialController = function() {}

SocialController.prototype.clickHome = function(which, url) {
  ga('send', 'event', 'Click', 'social-home', which, {
    'transport': 'beacon',
    'hitCallback': function() {
      document.location = url;
    }
  });
}

SocialController.prototype.click = function(which, url) {
  ga('send', 'event', 'Click', 'social', which, {
    'transport': 'beacon',
    'hitCallback': function() {
      document.location = url;
    }
  });
}

var HeaderController = function($scope) {
  this.$scope = $scope;
  this.$scope.scrollPos = 0;
  var scroll = angular.bind(this, function() {
    this.$scope.scrollPos = window.scrollY;
    this.$scope.$apply();
  });
  window.addEventListener('scroll', scroll);
  $scope.$on('$destroy', function () {
    window.removeEventListener('scroll', scroll)
  });
}

HeaderController.prototype.click = function(page) {
  ga('send', 'event', 'Click', 'header', page);
}

angular.module("8iTemplate", [])
.controller('FooterController', FooterController)
.controller('HeaderController', HeaderController)
.controller('NotFoundController', NotFoundController)
.controller('SocialController', SocialController);

