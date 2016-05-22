var MainController = function($resource, config, $scope) {
  // default center and zoom shows all of nz.
  this.map = new google.maps.Map(document.getElementById('map'), {
    center: {lat: -40.827947614929464, lng: 175.30749883440649},
    zoom: 5
  });

  this.Geohash = $resource('/api/geohash');
  this.known = this.Geohash.query(angular.bind(this, function(response) {
    angular.forEach(response, angular.bind(this, function(loc) {

      var marker = new google.maps.Marker({
        position: {lat: parseFloat(loc.lat), lng: parseFloat(loc.lon)},
        // position: {lat: -25.363, lng: 131.044},
        map: this.map,
        title: loc.date
      });
      var infowindow = new google.maps.InfoWindow({
        content: loc.date
      });
      marker.addListener('click', angular.bind(this, function() {
        // Why does this pass in marker?
        infowindow.open(this.map, marker);
      }));
    }));
  }));
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(angular.bind(this, function(position) {
      $scope.$apply();
      this.position = {
        lat: position.coords.latitude,
        lon: position.coords.longitude
      };
    }));
  } else {
    // Enter a location manually?
    console.log('No geolocation available.');
  }

}
/**
 * The angular module
 */
angular.module('geohash', [
  'config',
  'ngResource',
  'ngRoute',
])
.config(function($locationProvider, $routeProvider, config) {
  $locationProvider.html5Mode(true).hashPrefix('!');
  $routeProvider.otherwise({
    templateUrl: config.basePath + 'geohash.html'
  });
})
.controller('MainController', MainController)
