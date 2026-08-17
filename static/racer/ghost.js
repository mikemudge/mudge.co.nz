// Records the player's lap as a list of {t, x, z, heading} samples, where
// heading is the car mesh's rotation.y itself (not a "physics" heading -
// see GhostCar.apply below), so replaying it is just setting the mesh's
// transform straight from the recording, no offsets to keep track of.
var LapRecorder = function() {
  this.samples = [];
};

LapRecorder.prototype.reset = function() {
  this.samples = [];
};

LapRecorder.prototype.sample = function(t, x, z, heading) {
  this.samples.push({ t: t, x: x, z: z, heading: heading });
};

// Drives a second car mesh: replays a recorded lap if it has one, otherwise
// falls back to a simple autopilot that just tries to stay on the track -
// used before any lap has been recorded yet.
var GhostCar = function(mesh) {
  this.mesh = mesh;
  this.recording = null;
  // Only used by the autopilot (see below) - the mesh's own rotation.y,
  // used directly as a forward-vector angle. Same convention as recorded
  // samples and the player's car use, with no separate offset added on
  // top - mixing the two is what made the autopilot drive backwards while
  // still facing forward.
  this.autopilotHeading = mesh.rotation.y;
};

GhostCar.prototype.update = function(lapTime, isOnTrack, dt) {
  if (this.recording && this.recording.length) {
    this.replay(lapTime);
  } else {
    this.autopilot(isOnTrack, dt);
  }
};

// Moves to wherever the recording says the car was at lap-time t, blending
// between the two samples either side of it.
GhostCar.prototype.replay = function(t) {
  var samples = this.recording;
  var last = samples[samples.length - 1];
  if (t <= samples[0].t) {
    this.apply(samples[0]);
    return;
  }
  if (t >= last.t) {
    this.apply(last);
    return;
  }
  for (var i = 1; i < samples.length; i++) {
    if (samples[i].t >= t) {
      var a = samples[i - 1];
      var b = samples[i];
      var span = b.t - a.t;
      var frac = span > 0 ? (t - a.t) / span : 0;
      this.apply(this.interpolate(a, b, frac));
      return;
    }
  }
};

GhostCar.prototype.interpolate = function(a, b, frac) {
  // Shortest-way-round blend, so it doesn't spin the long way any time
  // heading wraps past +-PI between two samples.
  var deltaHeading = b.heading - a.heading;
  deltaHeading -= Math.round(deltaHeading / (2 * Math.PI)) * 2 * Math.PI;
  return {
    x: a.x + (b.x - a.x) * frac,
    z: a.z + (b.z - a.z) * frac,
    heading: a.heading + deltaHeading * frac
  };
};

GhostCar.prototype.apply = function(sample) {
  this.mesh.position.x = sample.x;
  this.mesh.position.z = sample.z;
  this.mesh.rotation.y = sample.heading;
};

// A placeholder driver for when there's no recorded lap yet: look a short
// distance ahead along a few candidate headings (straight first, then
// increasingly wide corrections either side) and steer towards whichever
// one stays on the track.
GhostCar.AUTOPILOT_SPEED = 14;
GhostCar.AUTOPILOT_LOOKAHEAD = 8;
GhostCar.AUTOPILOT_TURN_RATE = 2;
GhostCar.AUTOPILOT_OFFSETS = [0, -0.3, 0.3, -0.6, 0.6, -1, 1];

GhostCar.prototype.autopilot = function(isOnTrack, dt) {
  var heading = this.autopilotHeading;
  var target = heading;
  for (var i = 0; i < GhostCar.AUTOPILOT_OFFSETS.length; i++) {
    var candidate = heading + GhostCar.AUTOPILOT_OFFSETS[i];
    var x = this.mesh.position.x + Math.sin(candidate) * GhostCar.AUTOPILOT_LOOKAHEAD;
    var z = this.mesh.position.z + Math.cos(candidate) * GhostCar.AUTOPILOT_LOOKAHEAD;
    if (isOnTrack(x, z)) {
      target = candidate;
      break;
    }
  }

  var maxTurn = GhostCar.AUTOPILOT_TURN_RATE * dt;
  heading += Math.max(-maxTurn, Math.min(maxTurn, target - heading));
  this.autopilotHeading = heading;

  this.mesh.position.x += Math.sin(heading) * GhostCar.AUTOPILOT_SPEED * dt;
  this.mesh.position.z += Math.cos(heading) * GhostCar.AUTOPILOT_SPEED * dt;
  this.mesh.rotation.y = heading;
};
