var MainController = function($resource, config, $scope) {

  this.person = {};

  this.people = {};

  // default center and zoom shows all of nz.
  this.map = new google.maps.Map(document.getElementById('map'), {
    center: {lat: -40.827947614929464, lng: 175.30749883440649},
    zoom: 5
  });

  $scope.currentTime = Date.now();

  this.Walker = $resource(config.baseUrl + 'api/walker');
  this.Walk = $resource(config.baseUrl + 'api/walk');

  // this.Walker = $resource(config.baseUrl + 'api/trail/v1/walker');
  // this.Walk = $resource(config.baseUrl + 'api/trail/v1/walk');

  this.Walker.query({}, angular.bind(this, function(response) {
    angular.forEach(response, angular.bind(this, function(person, x) {
      angular.forEach(person.walks, angular.bind(this, function(walk, i) {
        var date = walk.date;
        walk.date = new Date(date);
        if (isNaN(walk.date.getTime())) {
          // unset invalid dates like 0000-00-00
          console.log("don't understand " + date);
          walk.date = undefined;
        }
      }));

      chld = person.name.charAt(0) + "|" + ("000000" + person.color.toString(16)).slice(-6)

      person.marker = new google.maps.Marker({
        icon: new google.maps.MarkerImage(
            "https://chart.apis.google.com/chart?chst=d_map_pin_letter&chld=" + chld),
        map: this.map,
        title: person.name
      });
      person.infowindow = new google.maps.InfoWindow({
        content: person.name
      });
      person.marker.addListener('click', angular.bind(this, function(person) {
        person.infowindow.open(this.map, person.marker);
      }, person));

      this.people[person.name] = person;
    }));

    // This will move everyone's markers to the right location.
    this.updateEveryone();
  }));


  this.addingWalk = {};

  this.trail = $resource(config.basePath + 'trail.json')
      .get({}, angular.bind(this, function(response) {
        var totalLength = 0;
        // Removes Cook Strait from the end of this trail as it is out of order.
        response.gpx.trk.splice(-1, 1);
        var lastPoint = null;
        angular.forEach(response.gpx.trk, angular.bind(this, function(track) {
          var trackLength = 0;
          var flightPath = [];
          angular.forEach(track.trkseg.trkpt, function(point) {
            flightPath.push(new google.maps.LatLng(point['-lat'], point['-lon']));

            if (flightPath.length > 1) {
              // computeDistanceBetween should return the distance in meters.
              trackLength += google.maps.geometry.spherical.computeDistanceBetween(
                  flightPath[flightPath.length-1], flightPath[flightPath.length-2]);
            }
          });
          track.length = trackLength;
          totalLength += trackLength;

          if (lastPoint) {
            var point = track.trkseg.trkpt[0];
            temp = new google.maps.Polyline({
              path: [
                new google.maps.LatLng(lastPoint['-lat'], lastPoint['-lon']),
                new google.maps.LatLng(point['-lat'], point['-lon'])
              ],
              strokeColor: '#00FF00',
              strokeOpacity: 1.0,
              strokeWeight: 2,
              map: this.map
            });
          }
          lastPoint = track.trkseg.trkpt[track.trkseg.trkpt.length - 1]

          track.polyLine = new google.maps.Polyline({
            path: flightPath,
            strokeColor: '#FF0000',
            strokeOpacity: 1.0,
            strokeWeight: 2,
          });
        }));

        // in meters
        $scope.totalLength = totalLength;

        this.updateEveryone();

        angular.forEach(response.gpx.trk, angular.bind(this, function(track) {
          if (track.polyLine) {
            track.polyLine.setMap(this.map);
          }
        }));
      }));
}

MainController.prototype.addWalk = function(person) {
  if (!person) {
    alert('You need to select a walker');
    return;
  }
  if (!this.addingWalk.distance) {
    alert('Distance walked doesn\'t appear to be a number');
    return;
  }
  this.addingWalk.name = person.name;
  this.addingWalk.date = new Date();
  this.addingWalk.walker_id = person.id;

  this.Walk.save(this.addingWalk, angular.bind(this, function(walk) {
    console.log('added walk for ', person.name, walk);
    var date = walk.date;
    walk.date = new Date(date);

    person.walks.push(walk);
    // Updates local UI.
    this.updatePerson(person);
  }), function() {
    console.log(error);
    alert("something went wrong while adding walk");
  });
  // clear the model which is used to create a new walk.
  this.addingWalk = {};
}

MainController.prototype.saveWalk = function(walk) {
  // updates only the date of a walk.
  this.Walk.save(walk, angular.bind(this, function(response) {
    console.log(response);
  }), angular.bind(this, function(error) {
    console.log(error);
    alert("something went wrong, your walk was not updated");
  }));
}

MainController.prototype.deleteWalk = function(person, walk) {
  this.Walk.remove({id: walk.id}, angular.bind(this, function(response) {
    // local remove.
    var idx = person.walks.indexOf(walk);
    person.walks.splice(idx, 1);
    this.updatePerson(person);
  }), angular.bind(this, function(error) {
    console.log(error);
    alert("something went wrong, your walk was not deleted");
  }));
}

MainController.prototype.savePerson = function(person, success, failure) {
  // TODO should have generated code for this?
  // can't use person directly as it gets an error "Converting circular structure to JSON"
  // That is due to the marker/maps stuff?
  this.Walker.save({
    name: person.name,
    id: person.id,
    // Don't send walks to the server everytime a walker is saved.
    // They should be edited and saved individually.
    // walks: person.walks,
    color: person.color
  }, success, failure);
};

MainController.prototype.showPerson = function(person) {
  this.map.setZoom(10);
  // If close enough this will animate but other times it just jumps.
  this.map.panTo(person.marker.getPosition());
}

MainController.prototype.updateEveryone = function() {
  // Only update if the trial has loaded.
  if (this.trail.$resolved) {
    angular.forEach(this.people, angular.bind(this, this.updatePerson));
  }
}

MainController.prototype.updatePerson = function(person) {
  person.dis = 0;
  angular.forEach(person.walks, angular.bind(this, function(walk) {
    person.dis += parseFloat(walk.distance);
  }));
  person.walks.sort(function(a, b) {
    return a.date - b.date;
  });
  // Pretty rounding, angulars number filter will use 15.100 for 15.09999999999 which is easy to
  // get when summing floats.
  person.dis = Math.round(person.dis * 1000) / 1000;

  var walkedMeters = parseFloat(person.dis) * 1000;
  // Figure out which track the person is on.
  for (i = 0; i < this.trail.gpx.trk.length; i++) {
    var track = this.trail.gpx.trk[i];
    if (walkedMeters < track.length) {
      break; // walking on this track.
    }
    walkedMeters -= track.length;
  }

  person.track = track;
  person.trackWalkedMeters = walkedMeters;

  var point = track.trkseg.trkpt[0];
  var lastPoint = new google.maps.LatLng(point['-lat'], point['-lon']);
  for (i = 1; i < track.trkseg.trkpt.length; i++) {
    point = track.trkseg.trkpt[i];

    var curPoint = new google.maps.LatLng(point['-lat'], point['-lon']);

    // computeDistanceBetween should return the distance in meters.
    var pointDiff = google.maps.geometry.spherical.computeDistanceBetween(curPoint, lastPoint);

    if (walkedMeters < pointDiff) {
      break;
    }
    walkedMeters -= pointDiff;
    lastPoint = curPoint;
  }
  if (walkedMeters > pointDiff) {
    throw new Error("distance is longer than the track length");
  }
  person.marker.setPosition(
      google.maps.geometry.spherical.interpolate(lastPoint, curPoint, walkedMeters / pointDiff));
}
/**
 * The angular module
 */
angular.module('trail', [
  'config',
  'ngResource',
  'ngRoute',
])
.config(function($locationProvider, $routeProvider, config) {
  $locationProvider.html5Mode(true).hashPrefix('!');
  $routeProvider.otherwise({
    templateUrl: config.basePath + 'Trail.html'
  });
})
.controller('MainController', MainController)
.filter('toColor', function () {
  return function(input) {
    return ("000000" + input.toString(16)).slice(-6);
  };
})
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
