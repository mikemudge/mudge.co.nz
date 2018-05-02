var WalkerService = function(config, $resource) {
  this.Trail = $resource('/api/trail/v1/trail/:id', {
    'id': '@id'
  });
  this.TrailProfile = $resource('/api/trail/v1/profile/:id', {
    'id': '@id'
  });
  this.TrailProgress = $resource('/api/trail/v1/progress/:id', {
    'id': '@id'
  });
}

WalkerService.prototype.convertDate = function(walk) {
  var date = walk.date;
  walk.date = new Date(date);
  if (isNaN(walk.date.getTime())) {
    // unset invalid dates like 0000-00-00
    console.log("don't understand " + date);
    walk.date = undefined;
  }
};

WalkerService.prototype.loadPerson = function(map, person) {
  // Convert all walks to $resources.
  if (!person.name) {
    console.error('No name for person', person);
    return;
  }
  var progress = [];
  angular.forEach(person.progress, function(walk) {
    progress.push(new this.TrailProgress(walk));
  }.bind(this));
  person.progress = progress;

  angular.forEach(person.progress, this.convertDate.bind(this));

  var chld = person.name.charAt(0) + "|" + ("000000" + person.color.toString(16)).slice(-6)

  person.marker = new google.maps.Marker({
    icon: new google.maps.MarkerImage(
        "https://chart.apis.google.com/chart?chst=d_map_pin_letter&chld=" + chld),
    map: map,
    title: person.name
  });
  person.infowindow = new google.maps.InfoWindow({
    content: person.name
  });
  person.marker.addListener('click', angular.bind(this, function(person) {
    person.infowindow.open(map, person.marker);
  }, person));
};

var TrailService = function(config, $resource) {
  this.Trail = $resource(config.basePath + ':trail_url');
}

TrailService.prototype.loadTrail = function(trail_url, map) {
  this.map = map;
  var trail = this.Trail.query({trail_url: trail_url});
  trail.$promise.then(this.parseTrail.bind(this));
  return trail;
}

/**
 * Parses a json trail into a google maps Polyline.
 * And adds it to this.map
 */
TrailService.prototype.parseTrail = function(data) {
  var totalLength = 0;
  var biketracks = [];
  data.forEach(function(path) {
    var trackLength = 0;
    var flightPath = [];
    path.points.forEach(function(point) {
      flightPath.push(new google.maps.LatLng(point.lat, point.lng));

      if (flightPath.length > 1) {
        // computeDistanceBetween should return the distance in meters.
        trackLength += google.maps.geometry.spherical.computeDistanceBetween(
            flightPath[flightPath.length-1], flightPath[flightPath.length-2]);
      }
    }.bind(this));
    totalLength += trackLength;
    // console.log(path.name, trackLength);

    var polyLine = new google.maps.Polyline({
      path: flightPath,
      strokeColor: '#FF8800',
      strokeOpacity: 1.0,
      strokeWeight: 2,
      map: this.map
    });
    polyLine.length = trackLength;
    biketracks.push(polyLine);
  }.bind(this));
  data.tracks = biketracks;
  // Default map location to start of trail.
  this.map.setCenter(data.tracks[0].getPath().getArray()[0]);

  // TODO would be nice to have the filename here?
  console.log("Trail parsed", (totalLength / 1000).toFixed(2) + 'km');
};

// TODO may need to remove the last segment of te araroa trail??
// Removes Cook Strait from the end of this trail as it is out of order.
// response.gpx.trk.splice(-1, 1);

var MainController = function(loginService, trailService, walkerService, config, $scope, $routeParams, $rootScope) {
  window.ctrl = this;
  this.$rootScope = $rootScope;
  this.trailService = trailService;
  // TODO load profiles more scalably.
  // Currently loading all profiles and all progress.
  this.walkerService = walkerService;
  this.user = loginService.user;
  this.currentUser = this.user;
  this.person = {};

  var trail_id = $routeParams['trail_id'];
  if (!trail_id) {
    this.error = 'No Trail selected';
    return;
  }
  this.newProfile = new this.walkerService.TrailProfile({
    trail_id: trail_id,
    color: this.randomColor()
  });

  // default center and zoom shows all of nz.
  // TODO trail should indicate a good center point???
  this.map = new google.maps.Map(document.getElementById('map'), {
    center: {lat: -40.827947614929464, lng: 175.30749883440649},
    zoom: 5
  });

  this.trail_data = this.walkerService.Trail.get({id: trail_id});

  this.trail_data.$promise.then(this.trailLoaded.bind(this));

  this.addProgress = new walkerService.TrailProgress();
}

MainController.prototype.randomColor = function() {
  // Pick a random hex in the color range.
  var val = (Math.random() * 16777216).toString(16);
  // Now pad it with 0's
  val = ("000000" + val).slice(-6);
  // And add a # to make it css friendly.
  return '#' + val;
}

MainController.prototype.changeProfile = function(profile) {
  // TODO should only be able to select profiles you own.
  this.currentProfile = profile;
  // update the selected walker to this profile as well.
  this.selectedWalker = this.currentProfile;

  // Hide the choose profile UI.
  this.showChangeProfile = false;
  // Recenter the map on the profile.
  this.showPerson(this.currentProfile);
}

MainController.prototype.selectWalker = function(person) {
  this.selectedWalker = person;
  this.showPerson(this.selectedWalker);
}

MainController.prototype.trailLoaded = function(response) {
  this.$rootScope.title = response.name;
  // Load the trail data.
  this.trail = this.trailService.loadTrail(response.trail_url, this.map);

  // Map people by id, and load their map features.
  this.people = {};
  response.trail_profiles.forEach(function(person) {
    this.people[person.id] = person;
    this.walkerService.loadPerson(this.map, person)
  }.bind(this));

  console.log('finding your profile.')
  this.profiles = response.trail_profiles.filter(function(tp) {
    return tp.user_id == this.user.id;
  }.bind(this));
  if (this.profiles.length > 0) {
    // TODO should cache which profile was selected?
    this.currentProfile = this.profiles[0];
  }
  this.selectedWalker = this.currentProfile;
  this.profiles.$resolved = true;

  // Once the trail data is loaded, we need to update everyone's
  // current location based on distance along the trail.
  this.trail.$promise.then(function() {
    this.updateEveryone();
    // Then update the map to be looking at the current profile.
    if (this.currentProfile) {
      this.showPerson(this.currentProfile);
    }
  }.bind(this));

};

// TODO
// Show walks based on a calendar style view?
// Means they don't all need to be loaded at the same time.

MainController.prototype.addWalk = function() {
  if (!this.currentProfile) {
    alert('You need to select a walker');
    return;
  }
  if (!this.addProgress.distance) {
    alert('Distance walked is required');
    return;
  }
  this.addProgress.date = new Date();
  this.addProgress.trail_profile_id = this.currentProfile.id;

  this.addProgress.$save().then(function(walk) {
    console.log('added progress for ', this.currentProfile.name, walk);
    walk.date = new Date(walk.date);
    this.currentProfile.progress.push(walk);
    this.showProgressPopup = false;
    // Updates local UI.
    this.updatePerson(this.currentProfile);
    // Move the map to follow the person.
    this.showPerson(this.currentProfile);
  }.bind(this));
  // clear the model which is used to create a new walk.
  this.addProgress = new this.walkerService.TrailProgress();
}

MainController.prototype.saveWalk = function(walk) {
  // Only the date can change so we don't need to updatePerson.
  walk.$save().then(function(walk) {
    this.walkerService.convertDate(walk);
  }.bind(this));
}

MainController.prototype.deleteWalk = function(person, walk) {
  walk.$remove().then(function() {
    // Remove walk from the person.
    var idx = person.progress.indexOf(walk);
    if (idx == -1) {
      alert('Deleted walk, but failed to update walker. Please refresh the page to re sync data.');
      throw Error('Deleted item but failed to remove it from list');
    }
    person.progress.splice(idx, 1);
    this.updatePerson(person);
    // Move the map to follow the person.
    this.showPerson(this.currentProfile);
  }.bind(this));
}

MainController.prototype.showPerson = function(person) {
  console.info('Viewing profile', person);
  if (person.marker && person.marker.getPosition()) {
    // If close enough this will animate but other times it just jumps.
    this.map.setZoom(10);
    this.map.panTo(person.marker.getPosition());
  } else {
    console.warn('showPerson called before marker had a position');
  }
}

MainController.prototype.updateEveryone = function() {
  // Only update if the trial has loaded.
  if (!this.trail.$resolved) {
    console.warn('updateEveryone requested when trail isn\'t ready');
  } else {
    angular.forEach(this.people, function(p) {
      this.updatePerson(p);
    }.bind(this));
  }
}

MainController.prototype.updatePerson = function(person) {
  if (!this.trail.tracks) {
    // The trail hasn't loaded yet
    return;
  }
  person.dis = 0;
  angular.forEach(person.progress, angular.bind(this, function(walk) {
    person.dis += parseFloat(walk.distance);
  }));
  person.progress.sort(function(a, b) {
    return a.date - b.date;
  });
  // Pretty rounding, angulars number filter will use 15.100 for 15.09999999999 which is easy to
  // get when summing floats.
  person.dis = Math.round(person.dis * 1000) / 1000;

  var walkedMeters = parseFloat(person.dis) * 1000;
  // Figure out which track the person is on.
  var onTrack = this.trail.tracks.find(function(track) {
    if (walkedMeters < track.length) {
      return true
    }
    // Otherwise walk the length of this track and try the next.
    walkedMeters -= track.length;
  });

  if (!onTrack) {
    // Finished this trail.
    // Set location to last point of the trail.
    var lastTrack = this.trail.tracks[this.trail.tracks.length - 1]
    var lastPoint = lastTrack.getPath().getArray()[lastTrack.getPath().getArray().length - 1]
    person.marker.setPosition(lastPoint);
    return;
  }
  person.track = onTrack;
  person.trackWalkedMeters = walkedMeters;

  // Now follow the track to find a gps position for the profile.
  var lastPoint = null;
  var curPoint = null;
  var pointDiff = 0;
  onTrack.getPath().getArray().find(function(point) {
    if (!lastPoint) {
      lastPoint = point;
      return false;
    }
    pointDiff = google.maps.geometry.spherical.computeDistanceBetween(
        point, lastPoint);

    if (walkedMeters < pointDiff) {
      curPoint = point;
      return true;
    }
    walkedMeters -= pointDiff;
    lastPoint = point;
  });

  person.marker.setPosition(
      google.maps.geometry.spherical.interpolate(lastPoint, curPoint, walkedMeters / pointDiff));
}

MainController.prototype.beginTrail = function() {
  // Create a profile on this trail.
  this.newProfile.$save().then(function(response) {
    console.log('new profile', response);
    this.profiles.push(response);
    // Make sure the person get rendered
    this.walkerService.loadPerson(this.map, response);
    this.people[response.id] = response;
    this.updatePerson(response);
    // Will select the new profile as currentProfile
    this.changeProfile(response);

    // Reset the UI for this.
    this.showBeginTrail = false;
    this.newProfile = new this.walkerService.TrailProfile({
      trail_id: this.trail_data.id,
      color: this.randomColor()
    });
  }.bind(this));
}

var ListTrailController = function(walkerService, $rootScope, loginService, $location) {
  $rootScope.title = "Trails";
  window.ctrl = this;
  // Allows for custom header for home page.
  this.home = true;
  this.currentUser = loginService.user;
  this.$location = $location;
  this.walkerService = walkerService;
  this.trails = walkerService.Trail.query();
  this.profiles = walkerService.TrailProfile.query();
}

ListTrailController.prototype.saveProfile = function(profile) {
  console.log('save', this.editProfile);
  this.editProfile.$save().then(function(person) {
    // Hide the UI.
    this.editProfile = null;
  }.bind(this));
}

ListTrailController.prototype.beginTrail = function(trail_id) {
  // Create a profile on this trail.
  var newProfile = new this.walkerService.TrailProfile({
    trail_id: trail_id
  });
  newProfile.$save().then(function(response) {
    console.log('new profile', response);
    // Load the trail?
    this.$location.path('t/' + response.trail_id)
  }.bind(this));
}

ListTrailController.prototype.deleteProfile = function(profile) {
  // TODO delete should update walkerService?
  // So the number of walkers on each trail can be updated as well???
  profile.$remove().then(function() {
    var idx = this.profiles.indexOf(profile);
    if (idx != -1) {
      this.profiles.splice(idx, 1);
    }
  }.bind(this));
}

/**
 * The angular module
 */
angular.module('trail', [
  'api',
  'config',
  'mmLogin',
  'ngRaven',
  'ngResource',
  'ngRoute',
])
.run(function(loginService) {
  // You must be logged in to use this app.
  loginService.ensureLoggedIn();
})
.config(function($locationProvider, $routeProvider, config) {
  $locationProvider.html5Mode(true).hashPrefix('!');
  $routeProvider.when('/t/:trail_id/', {
    templateUrl: '/static/trail/Trail.tpl.html'
  }).otherwise({
    templateUrl: '/static/trail/ListTrail.tpl.html'
  });
})
.controller('ListTrailController', ListTrailController)
.controller('MainController', MainController)
.service('trailService', TrailService)
.service('walkerService', WalkerService)
;