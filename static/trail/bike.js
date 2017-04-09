var MainController = function($resource, config, $scope) {

  this.Biker = $resource(config.baseUrl + 'api/biker');
  this.Ride = $resource(config.baseUrl + 'api/ride');

  // this.Biker = $resource(config.baseUrl + 'api/trail/v1/biker');
  // this.Ride = $resource(config.baseUrl + 'api/trail/v1/ride');

  // default center and zoom shows all of nz.
  this.map = new google.maps.Map(document.getElementById('map'), {
    center: {lat: -40.827947614929464, lng: 175.30749883440649},
    zoom: 5
  });
  // A place to store biker map info.
  this.bikerMaps = {};

  this.colors = [
    'FF0000',
    '00FF00',
    '0000FF',
    'FF00FF',
    'FFFF00',
    '00FFFF',
  ]

  this.bikers = this.Biker.query(function(bikers) {
    bikers.forEach(this.convertBiker.bind(this));
  }.bind(this));

  this.trail = $resource(config.basePath + 'tour_aotearoa.json')
      .query(this.parseTrail.bind(this));
}

/**
 * Parses the tour_aotearoa.json into a google maps Polyline.
 * And adds it to this.map
 */
MainController.prototype.parseTrail = function(data) {
  var totalLength = 0;
  var lastPoint = null;
  var biketracks = [];
  angular.forEach(data, angular.bind(this, function(path) {
    var trackLength = 0;
    var flightPath = [];
    angular.forEach(path.points, function(point) {
      flightPath.push(new google.maps.LatLng(point.lng, point.lat));

      if (flightPath.length > 1) {
        // computeDistanceBetween should return the distance in meters.
        trackLength += google.maps.geometry.spherical.computeDistanceBetween(
            flightPath[flightPath.length-1], flightPath[flightPath.length-2]);
      }
    });
    path.trackLength = trackLength;
    totalLength += trackLength;
    // console.log(path.name, trackLength);

    biketracks.push(new google.maps.Polyline({
      path: flightPath,
      strokeColor: '#FFFF00',
      strokeOpacity: 1.0,
      strokeWeight: 2,
      map: this.map
    }));
  }));
  console.log('Tour Aotearoa', (totalLength / 1000).toFixed(2) + 'km');

  // Update all biker locations.
  this.bikers.forEach(this.updateBiker.bind(this));
};

MainController.prototype.createBiker = function(biker) {
  this.Biker.save(biker, function(result) {
    console.log('new biker', result);
    this.convertBiker(result);
    this.bikers.push(result);
  }.bind(this));
  this.addBiker = false;
}

/**
 * Creates the marker and other things for a biker.
 */
MainController.prototype.convertBiker = function(biker) {
  if (!biker.rides) {
    biker.rides = [];
  }
  if (!biker.color) {
    biker.color = this.colors[Math.floor((Math.random() * this.colors.length))];
  }

  biker.rides.forEach(function(ride) {
    var date = ride.date;
    ride.date = new Date(date);
  });

  chld = biker.name.charAt(0) + "|" + ("000000" + biker.color.toString(16)).slice(-6)

  var marker = new google.maps.Marker({
    icon: new google.maps.MarkerImage(
        "https://chart.apis.google.com/chart?chst=d_map_pin_letter&chld=" + chld),
    map: this.map,
    title: biker.name
  });
  var infowindow = new google.maps.InfoWindow({
    content: biker.name
  });
  marker.addListener('click', angular.bind(this, function() {
    infowindow.open(this.map, marker);
  }));
  this.bikerMaps[biker.id] = {
    infowindow: infowindow,
    marker: marker
  }

  // Now calculate where biker should be.
  this.updateBiker(biker);
}

MainController.prototype.deleteRide = function(who, ride) {
  idx = who.rides.indexOf(ride);
  if (idx < 0) {
    alert("can't find that ride in rides of", who.name)
    return;
  }
  this.Ride.delete(ride, function(result) {
    console.log(result);
    idx = who.rides.indexOf(ride);
    who.rides.splice(idx, 1);
    this.updateBiker(who);
  }.bind(this));
}

MainController.prototype.createRide = function(selectedBiker, newride) {
  var biker = this.bikers.find(function(b) {
    return b.id == selectedBiker.id;
  });
  if (!biker) {
    console.log('biker not found in bikers', biker, this.bikers);
    return;
  }
  newride.date = new Date();
  newride.name = biker.name;
  newride.biker_id = biker.id;
  this.Ride.save(newride, angular.bind(this, function(ride) {
    var date = ride.date;
    ride.date = new Date(date);
    biker.rides.push(ride);
    this.updateBiker(biker);
    console.log('Saved a ride for', biker.name);
  }), function(error) {
    console.log(error);
    alert("something went wrong while adding ride");
  });
  this.addRide = false;
}

MainController.prototype.saveRide = function(ride) {
  delete ride.editDate;
  this.Ride.save(ride, function() {
    // success
  }, function(error) {
    console.log(error);
    alert("something went wrong while adding ride");
  });
}

MainController.prototype.updateBiker = function(biker) {
  if (!this.trail.$resolved) {
    return;
  }
  var totalDistance = 0;
  biker.rides.forEach(function(ride) {
    dis = parseFloat(ride.distance);
    if (!dis) {
      alert('Bad ride found with distance ' + ride.distance);
    } else {
      totalDistance += dis;
    }
  });

  console.log(biker.name, 'totalDistance', totalDistance, 'km')
  biker.total = totalDistance.toFixed(2);

  // Convert to meters for the next step.
  totalDistance *= 1000;

  var track = this.trail[0];
  for (i = 0; i < this.trail.length; i++) {
    track = this.trail[i];
    if (totalDistance < track.trackLength) {
      break; // Riding this track.
    }
    totalDistance -= track.trackLength;
  }

  console.log(totalDistance, 'm through track', track.name);

  var point = track.points[0];
  var lastPoint = new google.maps.LatLng(point['lng'], point['lat']);
  for (i = 1; i < track.points.length; i++) {
    point = track.points[i];
    var curPoint = new google.maps.LatLng(point['lng'], point['lat']);

    // computeDistanceBetween should return the distance in meters.
    var pointDiff = google.maps.geometry.spherical.computeDistanceBetween(curPoint, lastPoint);

    if (totalDistance < pointDiff) {
      break;
    }
    totalDistance -= pointDiff;
    lastPoint = curPoint;
  }
  if (totalDistance > pointDiff) {
    console.log(totalDistance, pointDiff);
    alert('You win, you reached the end.')
    // TODO update something here so it doesn't keep happening.
    return;
  }

  var where = google.maps.geometry.spherical.interpolate(lastPoint, curPoint, totalDistance / pointDiff)
  this.bikerMaps[biker.id].marker.setPosition(where);
}
/**
 * The angular module
 */
angular.module('bike', [
  'config',
  'ngResource',
  'ngRoute',
])
.config(function($locationProvider, $routeProvider, config) {
  $locationProvider.html5Mode(true).hashPrefix('!');
  $routeProvider.otherwise({
    templateUrl: config.basePath + 'Biking.html'
  });
})
.controller('MainController', MainController)
.config(function($httpProvider) {
  $httpProvider.interceptors.push('authInterceptor');
})
.factory('authInterceptor', function ($injector, $q, $templateCache) {
  return {
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
        console.warn('Should attempt relogin here?');
        // var loginService = $injector.get('loginService');
        // loginService.badResponse();
      }
      alert('Error occurred')
      // Fail the request.
      return $q.reject(response);
    }
  }
});