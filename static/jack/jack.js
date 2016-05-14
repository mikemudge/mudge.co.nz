jack = {};
/**
 * The angular module for Project Manager.
 */
jack.App = angular.module('jack', [
  'MainController',
  'TrackController',
  'ngResource',
  'ngRoute'
]).config(['$routeProvider', 'config',
    function($routeProvider, config) {
      $routeProvider.when('/track/:track', {
        controller: 'TrackController as ctrl',
        templateUrl: config.basePath + 'Tracks.html'
      }).when('/', {
        controller: 'MainController as ctrl',
        templateUrl: config.basePath + 'Home.html'
      });
    }
]).directive('ngEnter', function () {
  return function (scope, element, attrs) {
    element.bind("keydown keypress", function (event) {
      if(event.which === 13) {
        scope.$apply(function (){
            scope.$eval(attrs.ngEnter);
        });
        event.preventDefault();
      }
    });
  };
});

/**
 * The main controller for Jacks Gatherer
 * @constructor
 */
jack.MainController = function($location, $resource, $routeParams, $scope, config) {
  this.$location = $location;
  this.$scope = $scope;
  $scope.basePath = config.basePath;
  $scope.baseUrl = config.basePath;
  this.tracks = [];

  // Start loading data.
  this.myFirebaseRef = new Firebase("https://boiling-heat-371.firebaseio.com/JacksGatherer");
  var tracks = this.myFirebaseRef.child("tracks");
  var childAdded = angular.bind(this, this.childAdded);
  tracks.on("child_added", childAdded);
  tracks.once("value", angular.bind(this, this.allExistingLoaded));

  $scope.$on("$destroy", function() {
    tracks.off("child_added", childAdded);
  });
};

// TODO use reverse Geo to name tracks if they don't have a name?
// https://developers.google.com/maps/documentation/geocoding/intro#ReverseGeocoding
// https://maps.googleapis.com/maps/api/geocode/json?latlng=-41.33963007,174.76913076

jack.MainController.prototype.allExistingLoaded = function(snapshot) {
  // At this stage we know all existing points are ready.
  // We can export them to the scope and render the map etc.
  console.log(Object.keys(snapshot.val()).length + ' tracks loaded');
  this.existingLoaded = true;
  this.$scope.$digest();
}

jack.MainController.prototype.showTrack = function(trackKey) {
  this.$location.path('/track/' + trackKey);
}

jack.MainController.prototype.deleteTrack = function($index) {
  var track = this.tracks[$index];
  if (track.name=="mike.mudge@gmail.com") {
    // Can only delete my test tracks.
    console.log(track.key);
    this.tracks.splice($index, 1);
    this.myFirebaseRef.child("data").child(track.data_key).remove();
    this.myFirebaseRef.child("tracks").child(track.key).remove();
  }
}

jack.MainController.prototype.childAdded = function(snapshot) {
  this.tracks.push(angular.extend({key: snapshot.key()}, snapshot.val()));
  if (!this.existingLoaded) {
    // Ignore child adds until all existing data is loaded.
    return
  }
  // Now we know this is a newly started track.
  this.$scope.$digest();
}

jack.MainController.module = angular
    .module('MainController', ['config', 'ngResource', 'ngRoute'])
    .controller('MainController', [
      '$location', '$resource', '$routeParams', '$scope', 'config', jack.MainController
    ]);


/**
 * The main controller for Jacks Gatherer
 * @constructor
 */
jack.TrackController = function($location, $resource, $routeParams, $scope, config) {
  this.$location = $location;
  this.$scope = $scope;
  $scope.basePath = config.basePath;
  $scope.baseUrl = config.basePath;
  if (!$routeParams.track) {
    throw new Error("No data_key in path, shouldn't use this controller")
  }
  this.alreadyDigested = false;
  this.values = [];
  $scope.track = {};

  // default center and zoom shows all of nz.
  this.map = new google.maps.Map(document.getElementById('map-canvas'), {
    center: {lat: -40.827947614929464, lng: 175.30749883440649},
    zoom: 5
  });

  // Start loading the data
  // TODO display loading symbol?
  var myFirebaseRef = new Firebase("https://boiling-heat-371.firebaseio.com/JacksGatherer");
  this.trackMeta = myFirebaseRef.child('tracks').child($routeParams.track);
  this.trackMeta.once("value", angular.bind(this, function(track) {
    angular.extend($scope.track, track.val());
    var otherDataRef = myFirebaseRef.child('data').child(track.val().data_key);
    var childAdded = angular.bind(this, this.childAdded);
    otherDataRef.on("child_added", childAdded);
    otherDataRef.on("child_changed", childAdded);
    otherDataRef.once("value", angular.bind(this, this.allExistingLoaded));

    $scope.$on("$destroy", function() {
      otherDataRef.off("child_added", childAdded);
      otherDataRef.off("child_changed", childAdded);
    });
  }));
};


jack.TrackController.prototype.listOfLength = function(length, value) {
  var array = new Array(length);
  array.fill('');
  return array;
}

jack.TrackController.prototype.saveName = function() {
  // TODO no reason this name needs to be on track?
  this.trackMeta.child("trackName").set(this.$scope.track.trackName);
}

jack.TrackController.prototype.allExistingLoaded = function(snapshot) {
  try {
    this.allExistingLoaded_(snapshot);
  } catch (e) {
    console.error(e.stack);
  }
}

jack.TrackController.prototype.allExistingLoaded_ = function(snapshot) {
  console.log('existing finished loading');
  console.log(snapshot);

  console.log(this.values.length + ' data points');
  this.speeds = [];
  // At this stage we know all existing points are ready.
  // We can export them to the scope and render the map etc.

  // Map stuff
  this.$scope.color = '000000';
  var poly = new google.maps.Polyline({
    strokeColor: '#' + this.$scope.color,
    strokeOpacity: 1.0,
    strokeWeight: 3
  });
  var bounds = new google.maps.LatLngBounds();

  var trackLength = 0;
  var lastLoc = null;
  angular.forEach(this.values, angular.bind(this, function(loc, i) {
    loc.accelTotal = loc.accel.z * loc.accel.z + loc.accel.y * loc.accel.y + loc.accel.x * loc.accel.x;
    loc.originalIndex = i;
    var myLatlng = new google.maps.LatLng(loc.pos.lat, loc.pos.lng);
    bounds.extend(myLatlng);
    var path = poly.getPath();
    path.push(myLatlng);

    if (lastLoc) {
      segLength = google.maps.geometry.spherical.computeDistanceBetween(
          lastLoc, myLatlng);
      this.speeds.push(segLength);
      trackLength += segLength;
    }
    lastLoc = myLatlng;
  }));
  console.log(trackLength);

  var expectedSize = 1000;
  var currentSize = this.speeds.length;
  var newSpeeds = [];
  var numSpeeds = parseInt(currentSize / expectedSize, 10);
  var numSamples = numSpeeds * 5;
  console.log(numSpeeds + " per sample");
  for (i = 0; i < expectedSize; i++) {
    var avgSpeed = 0;
    for (ii = 0; ii < numSamples; ii++) {
      avgSpeed += this.speeds[numSpeeds * i + ii];
    }
    // Convert into Km/h and round to get a nice value.
    newSpeeds.push((3.6 * (avgSpeed / (numSamples))).toFixed(1));
  }

  // Plot the speed graph into myChart.
  var ctx = document.getElementById("myChart").getContext("2d");
  var myNewChart = new Chart(ctx).Line({
    labels: this.listOfLength(expectedSize, ''),
    datasets: [{
      label: "Speed",
      fillColor: "rgba(220,220,220,0.2)",
      strokeColor: "rgba(220,220,220,1)",
      pointColor: "rgba(220,220,220,1)",
      pointStrokeColor: "#fff",
      pointHighlightFill: "#fff",
      pointHighlightStroke: "rgba(220,220,220,1)",
      data: newSpeeds
    }]
  }, {
    bezierCurve: false,
    scaleShowVerticalLines: false,
    maintainAspectRatio: false,
    pointDot : false,
    pointDotRadius : 1,
    pointHitDetectionRadius: 0
  });

  this.$scope.speeds = this.speeds;
  this.$scope.trackLength = trackLength;

  var biggestAccel = this.values.slice(0);
  biggestAccel.sort(function(a, b) {
    return b.accelTotal - a.accelTotal;
  });

  if (biggestAccel.length > 0) {
    this.$scope.maxAccelIndex = biggestAccel[0].originalIndex;
  }

  this.existingLoaded = true;
  poly.setMap(this.map);
  for (i = 0; i< Math.min(10, biggestAccel.length); i++) {
    var loc = biggestAccel[i];
    var myLatlng = new google.maps.LatLng(loc.pos.lat, loc.pos.lng);
    var marker = new google.maps.Marker({
      position: myLatlng,
      map: this.map,
      title: 'Max acceleration ' + Math.sqrt(biggestAccel[i].accelTotal)
    });
  }
  this.poly = poly;
  this.bounds = bounds;
  this.map.fitBounds(this.bounds);
  this.$scope.$digest();
}

jack.TrackController.prototype.childAdded = function(snapshot) {
  var loc = snapshot.val();
  if (!loc.accel || !loc.accel.z) {
    console.log('loc without accel added');
    return; // The child is still updating.
  }
  if (!loc.pos) {
    console.log("bad loc, no pos");
    console.log(loc);
    return;
  }
  if (!loc.pos.lat) {
    // TODO fix this in the next app version.
    // Fixed in V4 but still here for backwards compat.
    var poses = [];
    snapshot.child('pos').forEach(function(v) {
      poses.push(v.val());
    });
    loc.pos = {
      'lat': poses[0],
      'lng': poses[1]
    }
  }
  this.values.push(loc);
  if (!this.$scope.startTime) {
    this.$scope.startTime = loc.time;
  }
  this.$scope.lastTime = loc.time;

  if (!this.existingLoaded) {
    // Still loading existing children
    return;
  }
  // TODO is there a possibility that map wasn't set?
  // Completely new track?
  var myLatlng = new google.maps.LatLng(loc.pos.lat, loc.pos.lng);
  this.bounds.extend(myLatlng);
  var path = this.poly.getPath();
  path.push(myLatlng);

  // Loading new children
  this.$scope.$digest();
}

jack.TrackController.module = angular
    .module('TrackController', ['config', 'ngRoute'])
    .controller('TrackController', [
      '$location', '$resource', '$routeParams', '$scope', 'config', jack.TrackController
    ]);

