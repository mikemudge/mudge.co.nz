var DBService = function($q) {
  this.$q = $q;
  // Resolved on this.db ready.
  var defer = $q.defer();
  this.promise = defer.promise;
  var request = indexedDB.open("eighti_holo", 2);

  request.onupgradeneeded = this.upgrade.bind(this);
  request.onerror = function(event) {
    alert('something went wrong with the DB');
  };
  request.onsuccess = function(ev) {
    this.db = request.result;

    defer.resolve(this.db);

    this.db.onerror = this.dbError.bind(this);
  }.bind(this);
}

// A generic error handler for all DB errors.
DBService.prototype.dbError = function(ev) {
  if (ev.target.error) {
    console.error("db error", ev.target.error);
  } else {
    console.error("db error", ev);
  }
};

DBService.prototype.getPoses = function() {
  var p = this.$q.defer();
  this.promise.then(function(db) {
    var poseStore = db.transaction(['poses'])
        .objectStore('poses');

    poseStore.count().onsuccess = function(ev) {
      console.log('Loading', ev.target.result, 'poses from local DB');
    };

    // That should use stores to inflate caches?
    var poses = [];
    poseStore.openCursor().onsuccess = function(event) {
      var cursor = event.target.result;
      if (cursor) {
        poses.push(cursor.value);
        cursor.continue();
      } else {
        p.resolve(poses);
      }
    }
  });
  // TODO need to sync removed, private etc.

  // TODO reject promise on error?
  return p.promise;
}

DBService.prototype.addPose = function(pose) {
  var request = this.db.transaction(['poses'], 'readwrite')
        .objectStore('poses');

  request.add(pose);
}

DBService.prototype.putPose = function(pose) {
  // Remove the missingData flag of this pose before it is saved.
  delete pose.missingData;

  var request = this.db.transaction(['poses'], 'readwrite')
        .objectStore('poses');

  request.put(pose);
}

DBService.prototype.upgrade = function(filter) {
  // TODO Cached based system. Just recreate everything if the version changes?

  var db = event.target.result;
  db.createObjectStore("poses", { keyPath: "id" });
}

DBService.prototype.clearDB = function() {
  this.promise.then(function(db) {
    var poseStore = db.transaction(['poses'], 'readwrite')
        .objectStore('poses');

    poseStore.clear();
  });
}

var PoseService = function(config, $resource, db) {
  this.db = db;
  this.Pose = $resource(config.API_URL + '/api/v1/holo-poses/:id', {
    id: '@id'
  });
}

PoseService.prototype.loadPoses = function() {
  // TODO handle the pagination of pose loading?
  this.poseMap = {};
  this.db.getPoses().then(function(poses) {
    var latestChange = 0;
    var latestPose = null;
    poses.forEach(function(pose) {
      var d = new Date(pose.release_version_datetime);
      if (d > latestChange) {
        latestChange = d;
        latestPose = pose;
      }
      this.updatePose(pose);
    }.bind(this));
    console.log('Requesting poses changed after', latestChange, 'from server');
    var params = {};
    if (latestPose) {
      params.start = latestPose.release_version_datetime;
    }
    this.Pose.query(params).$promise.then(this.posesLoaded.bind(this));
  }.bind(this));
}

PoseService.prototype.posesLoaded = function(poses) {
  // If poses is empty that indicates that there is no more changes to update.
  console.log('Loaded/Updated', poses.length, 'new poses from server');
  poses.forEach(function(pose) {
    if (this.poseMap[pose.id]) {
      // Remove the missingData flag of this pose before it is saved.
      delete pose.missingData;
      // update DB
      this.db.putPose(pose);
    } else {
      // Only add to db if the pose doesn't already exist.
      this.db.addPose(pose);
    }
    // Ensure pose is in map for future loads.
    this.updatePose(pose);
  }.bind(this));
  if (poses.length == 30) {
    // 30 is the current pagination length.
    // TODO we shouldn't rely on knowing that here.
    this.loadPoses();
  }
}

// Update pose is called once a full pose is loaded from the server or local DB.
PoseService.prototype.updatePose = function(pose) {
  if (this.poseMap[pose.id]) {
    // Update pose in poseMap.
    angular.copy(pose, this.poseMap[pose.id]);
  } else {
    // Set pose.
    this.poseMap[pose.id] = pose;
  }
  // At this point there should be no missingData.
  delete this.poseMap[pose.id].missingData;
  return this.poseMap[pose.id];
}

PoseService.prototype.loadIds = function(poses) {
  result = [];
  poses.forEach(function(p) {
    var pose = this.poseMap[p.id];
    if (!pose) {
      // Not loaded yet, will need to wait for pose loading.
      pose = new this.Pose(p);
      console.log('creating placeholder pose', p.id);
      pose.missingData = true;
      this.poseMap[p.id] = pose
    }
    result.push(pose);
  }.bind(this));
  return result;
}

PoseService.prototype.loadTag = function(tag) {
  if (!tag.id) {
    throw Error('tag has no id: ' + tag)
  }
  var result = [];
  // Assumes poses is ready.
  // TODO This seems inefficient?
  // Probably could cache this or something?
  angular.forEach(this.poseMap, function(p) {
    if (!p.tags) {
      // Skip poses with no tags.
      return;
    }
    match = p.tags.find(function(t) { return t.id == tag.id});
    if (match) {
      result.push(p);
    }
  }.bind(this));
  return result;
}

angular.module('holo_pose', [
  'config',
  'ngRoute',
  'ngResource'
])
.service('poseService', PoseService)
.service('db', DBService)
