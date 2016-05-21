var MainController = function($resource, config, $scope) {

  this.Biker = $resource(config.baseUrl + 'api/biker');
  this.Ride = $resource(config.baseUrl + 'api/ride');

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

  this.bikers = this.Biker.query(angular.bind(this, function(bikers) {
    angular.forEach(this.bikers, angular.bind(this, this.convertBiker));
  }));

  this.trail = $resource(config.basePath + 'tour_aotearoa.json')
      .query(angular.bind(this, this.parseTrail));
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
  angular.forEach(this.bikers, angular.bind(this, this.updateBiker));
};

MainController.prototype.createBiker = function(biker) {
  this.Biker.save(biker, angular.bind(this, function(result) {
    console.log('new biker', result);
    this.convertBiker(result);
    this.bikers.push(result);
  }));
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

  angular.forEach(biker.rides, angular.bind(this, function(ride) {
    var date = ride.date;
    ride.date = new Date(date);
    // if (isNaN(walk.date.getTime())) {
    //   // unset invalid dates like 0000-00-00
    //   console.log("don't understand " + date);
    //   walk.date = undefined;
    // }
  }));

  var marker = new google.maps.Marker({
    icon: new google.maps.MarkerImage(
        "https://chart.apis.google.com/chart?chst=d_map_pin_letter&chld=" + biker.name.charAt(0) + "|" + biker.color),
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
  this.Ride.delete(ride, angular.bind(this, function(result) {
    console.log(result);
    who.rides.splice(idx, 1);
    this.updateBiker(who)
  }));
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
  angular.forEach(biker.rides, angular.bind(this, function(ride) {
    totalDistance += parseFloat(ride.distance);
  }));

  console.log('totalDistance', totalDistance, 'km')

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

  console.log('riding on track', track);

  console.log('totalDistance into', track.name, totalDistance, 'm')
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
    throw new Error('You win, you reached the end');
    // TODO update something here so it doesn't keep happening.
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
