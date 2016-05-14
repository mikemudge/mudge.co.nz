
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

