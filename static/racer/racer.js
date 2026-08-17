
var Player = function() {
  // TODO should have a mesh
  this.x = (Math.random() * 18 + 1) * 100;
  this.y = (Math.random() * 18 + 1) * 100;
  this.ang = 0;
  this.vx = 0;
  this.vy = 0;
};
// All forces below are in units/second (or /second^2), applied scaled by
// delta time, so the physics feels the same regardless of frame rate.
// Peak engine force, available at low speed (like 1st/2nd gear torque).
Player.ENGINE_FORCE = 42;
// Total engine power: how the force above tapers off as speed climbs (a
// crude torque curve, force = min(ENGINE_FORCE, ENGINE_POWER / speed)).
// Without this, top speed is just wherever a *constant* engine force is
// cancelled out by resistance - which means resistance at top speed, and
// so the deceleration the instant you lift off, is always exactly equal
// to that same peak force. Tapering the force means the engine is barely
// working by the time you're at top speed, so coasting/braking there
// feels gentle, without blunting the initial punch off the line.
Player.ENGINE_POWER = 420;
// Braking is stronger than the engine's cruising force, but nowhere near
// its full low-speed torque - a firm pedal, not a wall.
Player.BRAKE_FORCE = 45;
// Reversing is weaker than driving forward, and doesn't taper with speed.
Player.REVERSE_FORCE = 11.1;
// Aerodynamic drag (scales with speed^2) and rolling resistance (constant),
// which is what actually slows the car when you let off the throttle. Top
// speed isn't a separate setting - it's just wherever engine/reverse force
// stops winning against these. Rolling resistance is higher off the track
// (loose surface); drag is aerodynamic so the track surface doesn't affect
// it.
Player.DRAG = 0.004;
Player.ROLLING_RESISTANCE = 3;
Player.ROLLING_RESISTANCE_OFF_TRACK = 9;
// Max angular velocity (radians/second) while turning at speed. This is a
// kinematic steering rate (how fast the wheels themselves turn) - it isn't
// limited by grip. Whether the car's actual path can follow it is down to
// the friction circle below.
Player.MAX_TURN_RATE = 4.8;
// How strongly the tyres push back against sideways slip, in force per
// unit of slip speed (a cornering stiffness). This is a property of the
// tyre, not the surface - it doesn't vary with track/off-track.
Player.CORNERING_STIFFNESS = 10;
// The tyres have ONE shared traction budget for accelerating, braking and
// cornering combined (a friction circle) - demanding more than this from
// any combination of them doesn't work, it just runs out of grip. This is
// the budget on the track surface, at grip coefficient 1.
Player.MAX_TRACTION = 55;
// 0-1 fraction of MAX_TRACTION available off the track surface (a grip
// coefficient, like a lower coefficient of friction on grass/gravel vs
// tarmac). Below this, wheelspin eats into forward force, braking eats
// into cornering grip, and hard cornering alone can outrun the budget -
// all from the one shared circle, not separate rules per axis.
Player.GRIP_COEFFICIENT_OFF_TRACK = 0.35;

// Top speed for a simple constant driving force (used for reverse, which
// doesn't have a power taper) - the equilibrium of that force against drag
// + rolling resistance.
Player.topSpeedFor = function(force) {
  var net = force - Player.ROLLING_RESISTANCE;
  if (net <= 0 || Player.DRAG <= 0) {
    return 0;
  }
  return Math.sqrt(net / Player.DRAG);
};

// Top speed going forward, where the power-tapered engine force (see
// ENGINE_POWER above) is cancelled out by drag + rolling resistance:
// ENGINE_POWER / v = ROLLING_RESISTANCE + DRAG * v^2
// Solved with Newton's method since there's no closed form once the power
// taper is in the mix (it's cubic in v).
Player.topSpeedForward = function() {
  var power = Player.ENGINE_POWER;
  var v = power / Math.max(Player.ENGINE_FORCE, 1);
  for (var i = 0; i < 12; i++) {
    var f = power - Player.ROLLING_RESISTANCE * v - Player.DRAG * v * v * v;
    var slope = -Player.ROLLING_RESISTANCE - 3 * Player.DRAG * v * v;
    if (slope === 0) {
      break;
    }
    v -= f / slope;
  }
  return Math.max(v, 0);
};

var MainController = function($scope) {
  this.$scope = $scope;
  this.Player = Player;
  var canvas = document.getElementById('canvas');

  this.renderer = new THREE.WebGLRenderer({'canvas': canvas, antialias: true});
  this.renderer.setSize( window.innerWidth, window.innerHeight );

  // TODO enable left + right axes, but not up+down?
  this.humanControls = new GameControls({
    // 'debug': true
  });
  this.humanControls.init();

  this.scene = new THREE.Scene();

  var ambient = new THREE.AmbientLight( 0xFFFFFF );
  this.scene.add( ambient );

  this.camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );
  this.camera.position.x = 5;
  this.camera.position.y = 2;

  this.raycaster = new THREE.Raycaster();
  this.mouse = new THREE.Vector2();

  this.vx = 0;
  this.vz = 0;

  this.scene.add(this.track());
  // this.scene.add(this.testtrack());
  this.loadTrackSurface();

  // this.scene.add(this.fractal());

  this.controls = new THREE.OrbitControls(this.camera, canvas);
  this.controls.maxDistance = 5;
  this.controls.minDistance = 3;
  // We start in close mode.
  this.followMode = 1;
  this.cameraHeight = 2;

  var callback = function(car) {
    car.position.x = MainController.START_POSITION.x;
    car.position.y = 0.207;
    car.position.z = MainController.START_POSITION.z;
    // The car model's nose faces backwards relative to the physics'
    // forward axis at rotation 0, hence the added PI.
    car.rotation.y = Math.PI + MainController.START_HEADING;

    this.cube = car;
    this.scene.add(car);

    this.camera.position.x = MainController.START_POSITION.x;
    this.camera.position.y = this.cameraHeight;
    this.camera.position.z = MainController.START_POSITION.z + 5;

    this.controls.target = this.cube.position;
    this.controls.update();
  }.bind(this);

  loadCar(callback);

  // A second copy of the same model, driven by GhostCar instead of the
  // player - see MainController.prototype.updateGhost.
  var ghostCallback = function(car) {
    // Translucent, so it's clearly not the car you're actually driving.
    car.material.materials.forEach(function(material) {
      material.transparent = true;
      material.opacity = 0.35;
    });

    // Offset sideways from the start line so it doesn't spawn on top of
    // the player's car.
    var normal = { x: Math.cos(MainController.START_HEADING), z: -Math.sin(MainController.START_HEADING) };
    car.position.x = MainController.START_POSITION.x + normal.x * MainController.GHOST_SPAWN_OFFSET;
    car.position.y = 0.207;
    car.position.z = MainController.START_POSITION.z + normal.z * MainController.GHOST_SPAWN_OFFSET;
    car.rotation.y = Math.PI + MainController.START_HEADING;

    this.ghostCar = new GhostCar(car);
    this.scene.add(car);
  }.bind(this);

  loadCar(ghostCallback);

  this.lapRecorder = new LapRecorder();
  this.lastCompletedLap = null;
  this.lapElapsed = 0;
  this.lastLineCrossingAlong = null;
  this.isOnTrackFn = this.isOnTrack.bind(this);
  // The ghost/lap clock don't start until the player first presses
  // forward, rather than the instant the scene loads.
  this.raceStarted = false;

  window.addEventListener('resize', angular.bind(this, this.resize));

  // Pause if the window loses focus
  window.addEventListener('blur', function() {
    this.pause = true;
    this.$scope.$apply();
  }.bind(this), false);

  this.start();
}

MainController.prototype.start = function() {
  // game.start???
  // TODO still want to check gamepad when paused.
  // And allow menu selection etc?

  this.pause = false;
  var render = function(time) {
    if (this.pause) {
      return;
    }
    // Request this function be called again for the next frame.
    requestAnimationFrame(render);
    // Actually render the scene.
    this.render(time);
  }.bind(this);
  requestAnimationFrame(render);
};

MainController.prototype.testtrack = function() {
  var size = 100;
  var divisions = 100;

  var gridHelper = new THREE.GridHelper( size, divisions );
  return gridHelper;
}

// The track plane is TRACK_SIZE units square, centered on the origin.
// TRACK_IMAGE_URL is the pretty texture actually rendered (road, grass,
// curbs); TRACK_MASK_URL is a plain black/white image of the exact same
// shape (white = on track) used only for isOnTrack below. Keeping them
// separate means the physics doesn't have to guess "on track" from
// curb/grass colours - it reads an unambiguous mask instead.
MainController.TRACK_SIZE = 100;
MainController.TRACK_IMAGE_URL = "/static/racer/assets/img/Track.jpg?v=8";
MainController.TRACK_MASK_URL = "/static/racer/assets/img/TrackMask.png?v=1";

// Where the start/finish line is painted on the track (see TRACK_IMAGE_URL
// above) and which way it faces, so the car can start right on it. Same
// coordinate space as everywhere else - see MainController.prototype.track.
MainController.START_POSITION = { x: -35.203, z: 5.804 };
MainController.START_HEADING = 0;

// How far sideways the ghost car spawns from the player's start position.
MainController.GHOST_SPAWN_OFFSET = 3;
// A lap is only considered "crossed" near the start line itself - the line
// extends infinitely as a plain (x, z) projection, and the track loops
// back close to itself elsewhere, so without this a crossing anywhere else
// that happens to line up would falsely trigger it too. The road is ~9.5
// units wide at the start line, and the two nearest other sections of
// track are ~10 units away, so this needs to clear the full road width
// (so it triggers wherever you are across it) while staying well short of
// those other sections (so it doesn't trigger on them instead).
MainController.LAP_LINE_RADIUS = 8;
// localStorage key a completed lap is saved to/loaded from.
MainController.GHOST_STORAGE_KEY = 'racer.ghostLap';

MainController.prototype.track = function() {
  var size = MainController.TRACK_SIZE;
  var geometry = new THREE.PlaneGeometry(size, size, 100, 100);
  var texture = new THREE.TextureLoader().load(MainController.TRACK_IMAGE_URL);
  var material = new THREE.MeshBasicMaterial({
    map: texture,
    side: THREE.DoubleSide,
    // color: 0xD43A65,
    // wireframe: true,
  });
  var plane = new THREE.Mesh(geometry, material);
  plane.rotation.x = Math.PI * 0.50;
  return plane;
}

// Loads the track mask into an offscreen canvas so isOnTrack can read
// pixels straight off it - white is on the track surface, black is not.
MainController.prototype.loadTrackSurface = function() {
  var image = new Image();
  image.onload = function() {
    var canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    var context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    this.trackSurface = {
      width: image.width,
      height: image.height,
      pixels: context.getImageData(0, 0, image.width, image.height).data
    };
  }.bind(this);
  image.src = MainController.TRACK_MASK_URL;
};

// Whether (x, z) is over the track surface, per the mask (see
// TRACK_MASK_URL above). Defaults to true (on track) if the mask hasn't
// finished loading yet, so grip isn't affected before then.
MainController.prototype.isOnTrack = function(x, z) {
  var surface = this.trackSurface;
  if (!surface) {
    return true;
  }
  var size = MainController.TRACK_SIZE;
  // u/v of the point on the track plane - see MainController.prototype.track.
  var u = (x + size / 2) / size;
  var v = (z + size / 2) / size;
  // The image is loaded top-down (row 0 = top), but v runs bottom-up, so
  // the row axis is flipped relative to u's column axis.
  var col = Math.min(surface.width - 1, Math.max(0, Math.floor(u * surface.width)));
  var row = Math.min(surface.height - 1, Math.max(0, Math.floor((1 - v) * surface.height)));
  var brightness = surface.pixels[(row * surface.width + col) * 4];
  return brightness > 127;
};

// Records the player's lap, detects when it's complete (crossing the start
// line again), and drives the ghost car - either replaying the lap you
// just finished, or the autopilot if none has been recorded yet.
MainController.prototype.updateGhost = function(dt) {
  if (!this.ghostCar || dt <= 0 || !this.raceStarted) {
    return;
  }

  this.lapElapsed += dt;
  this.lapRecorder.sample(this.lapElapsed, this.cube.position.x, this.cube.position.z, this.cube.rotation.y);

  // Signed distance along the start line's facing direction, from the
  // start point - crossing from negative to positive means driving over
  // the line the right way round.
  var tangent = { x: Math.sin(MainController.START_HEADING), z: Math.cos(MainController.START_HEADING) };
  var dx = this.cube.position.x - MainController.START_POSITION.x;
  var dz = this.cube.position.z - MainController.START_POSITION.z;
  var along = dx * tangent.x + dz * tangent.z;
  var nearLine = Math.sqrt(dx * dx + dz * dz) < MainController.LAP_LINE_RADIUS;

  if (nearLine && this.lastLineCrossingAlong != null && this.lastLineCrossingAlong < 0 && along >= 0 && this.lapElapsed > 2) {
    var lapTime = this.lapElapsed;
    this.lastCompletedLap = this.lapRecorder.samples;
    this.lapRecorder.reset();
    this.lapElapsed = 0;

    // Only take over as the ghost if it's actually faster than whatever
    // the ghost's currently running - so it tracks your best lap, not
    // just your most recent one. No current recording (still on the
    // autopilot) counts as infinitely slow, so the first completed lap
    // always takes over.
    var ghostRecording = this.ghostCar.recording;
    var ghostLapTime = ghostRecording && ghostRecording.length ? ghostRecording[ghostRecording.length - 1].t : Infinity;
    if (lapTime < ghostLapTime) {
      this.ghostCar.recording = this.lastCompletedLap;
    }
  }
  if (nearLine) {
    this.lastLineCrossingAlong = along;
  }

  this.ghostCar.update(this.lapElapsed, this.isOnTrackFn, dt);
};

MainController.prototype.saveGhostLap = function() {
  if (!this.lastCompletedLap) {
    return;
  }
  localStorage.setItem(MainController.GHOST_STORAGE_KEY, JSON.stringify(this.lastCompletedLap));
};

MainController.prototype.loadGhostLap = function() {
  var saved = localStorage.getItem(MainController.GHOST_STORAGE_KEY);
  if (!saved || !this.ghostCar) {
    return;
  }
  this.ghostCar.recording = JSON.parse(saved);
};

MainController.prototype.resize = function() {
  this.camera.aspect = window.innerWidth / window.innerHeight;
  this.camera.updateProjectionMatrix();
  this.renderer.setSize( window.innerWidth, window.innerHeight );
}

MainController.prototype.render = function(time) {
  if (this.cube) {
    // time is a DOMHighResTimeStamp (ms) from requestAnimationFrame.
    var dt = 0;
    if (this.lastTime != null) {
      // Clamp so a backgrounded tab doesn't cause a huge physics jump
      // when it regains focus.
      dt = Math.min((time - this.lastTime) / 1000, 0.1);
    }
    this.lastTime = time;

    this.updatePhysics(this.humanControls.get(), dt);
    this.updateGhost(dt);

    // Loosely follow the car, but don't change camera height.
    // TODO support follow distance? With variable height too?
    this.camera.lookAt(this.cube.position);
    this.camera.position.y = this.cameraHeight;
  }

  this.controls.update();
  if (this.followMode === 0) {
    // Manually setup in car mode.
    this.camera.rotation.x = this.cube.rotation.x;
    this.camera.rotation.y = this.cube.rotation.y + Math.PI;
    this.camera.rotation.z = this.cube.rotation.z;
    this.camera.position.x = this.cube.position.x + 0.1 * Math.sin(this.cube.rotation.y) + 0.14 * Math.cos(-this.cube.rotation.y);
    this.camera.position.y = this.cube.position.y + .18;
    this.camera.position.z = this.cube.position.z + 0.1 * Math.cos(this.cube.rotation.y) + 0.14 * Math.sin(-this.cube.rotation.y);
  }

  this.renderer.render(this.scene, this.camera);
}

MainController.prototype.updatePhysics = function(keys, dt) {
  if (keys.toggleView) {
    this.followMode++;
    if (this.followMode === 3) {
      this.followMode = 0;
    }
    // followMode ranges from 0-2
    this.controls.minDistance = 3.2 + this.followMode;
    this.controls.maxDistance = 3.8 + this.followMode;
    this.cameraHeight = 2 + this.followMode / 3;
  }

  if (keys.pause) {
    this.pause = true;
    this.$scope.$apply();
  }

  if (keys.up) {
    // The ghost/lap clock waits for this - see updateGhost.
    this.raceStarted = true;
  }

  if (dt <= 0) {
    return;
  }

  // The car's own frame of reference, based on which way it's currently
  // facing. Note this is deliberately *not* recomputed after steering
  // below - the chassis can rotate faster than the momentum of the car
  // turns with it, which is exactly what produces drift: next frame, the
  // (mostly unchanged) world velocity gets re-split against the car's new
  // heading and shows up as sideways slip.
  var heading = this.cube.rotation.y;
  var forward = { x: Math.sin(heading), z: Math.cos(heading) };
  var right = { x: Math.cos(heading), z: -Math.sin(heading) };

  // Split the world-space velocity into how fast the car is travelling
  // along its length, and how much it's sliding sideways (tyre slip).
  var forwardSpeed = this.vx * forward.x + this.vz * forward.z;
  var lateralSpeed = this.vx * right.x + this.vz * right.z;

  var onTrack = this.isOnTrack(this.cube.position.x, this.cube.position.z);

  // Longitudinal force the driver is asking the tyres for: throttle
  // (tapering off with speed - see ENGINE_POWER above) or brake/reverse.
  // Pressing the opposite pedal brakes first rather than instantly
  // thrusting the other way - only once you're stopped does it reverse.
  var throttle = keys.up || 0;
  var brake = keys.down || 0;
  var longDemand = 0;
  if (throttle) {
    var engineForce = Math.min(Player.ENGINE_FORCE, Player.ENGINE_POWER / Math.max(forwardSpeed, 0.01));
    longDemand += throttle * engineForce;
  }
  if (brake) {
    longDemand -= brake * (forwardSpeed > 0 ? Player.BRAKE_FORCE : Player.REVERSE_FORCE);
  }

  // Steering wants to turn the chassis at this rate - you can't turn on
  // the spot, the rate ramps up with speed, and it's reversed relative to
  // the car while reversing, same as a real steering wheel. This is what
  // the driver is ASKING for; whether the car can actually turn that fast
  // is decided by the friction circle below, same as throttle/brake.
  var initialDirection = Math.sign(forwardSpeed);
  var topSpeed = (forwardSpeed >= 0 ? Player.topSpeedForward() : Player.topSpeedFor(Player.REVERSE_FORCE)) || 1;
  var desiredTurnRate = Math.sqrt(Math.min(Math.abs(forwardSpeed), topSpeed) / topSpeed) * Player.MAX_TURN_RATE;
  var steer = (keys.left || 0) - (keys.right || 0);
  var desiredRate = steer * desiredTurnRate * (initialDirection || 1);

  // Force needed to actually turn the chassis at that rate (a centripetal
  // force - roughly speed times turn rate), plus whatever's needed to
  // correct any sideways slip already happening (a cornering stiffness).
  var turnDemand = forwardSpeed * desiredRate;
  var slipCorrection = -Player.CORNERING_STIFFNESS * lateralSpeed;
  var latDemand = turnDemand + slipCorrection;

  // Friction circle: accelerating/braking and cornering draw on the same
  // shared traction budget, scaled by how much grip the surface offers.
  // Asking for more than that from any combination of them doesn't work -
  // it just runs out of grip. Wheelspin cuts the actual forward force,
  // hard braking eats into what's left for cornering (a lock-up skid),
  // and on the track surface, cornering alone can outrun the budget too:
  // the chassis then turns *slower than the driver asked for*, which is
  // understeer, rather than just a slide layered on top of an
  // unconditionally-obeyed turn.
  //
  // Off the track, low grip doesn't work like that - a loose surface makes
  // the back end easier to kick out, not harder to steer, so the chassis
  // keeps turning at the rate asked for (even spinning out entirely at
  // speed) while there's much less grip left to actually correct the slide
  // this creates. Modelling understeer and this oversteer-like breakaway
  // with the same "turn rate itself gets capped" rule would suppress the
  // slide instead of causing it, so only the track surface caps the turn
  // rate; off it, only the slip correction below is grip-limited.
  var maxTraction = Player.MAX_TRACTION * (onTrack ? 1 : Player.GRIP_COEFFICIENT_OFF_TRACK);
  var demand = Math.sqrt(longDemand * longDemand + latDemand * latDemand);
  var scale = demand > maxTraction ? maxTraction / demand : 1;
  forwardSpeed += longDemand * scale * dt;
  lateralSpeed += slipCorrection * scale * dt;
  this.cube.rotation.y = heading + (onTrack ? desiredRate * scale : desiredRate) * dt;

  // Rolling resistance (constant) and aerodynamic drag (grows with the
  // square of speed) aren't a traction thing - they apply regardless of
  // grip, and are what the top speed naturally settles at against
  // engine/reverse force (see Player.topSpeedFor). Rolling resistance is
  // higher off the track (a loose surface); drag is aerodynamic so the
  // surface doesn't affect it.
  var direction = Math.sign(forwardSpeed);
  var rollingResistance = onTrack ? Player.ROLLING_RESISTANCE : Player.ROLLING_RESISTANCE_OFF_TRACK;
  var resistance = rollingResistance * direction + Player.DRAG * forwardSpeed * Math.abs(forwardSpeed);
  forwardSpeed -= resistance * dt;
  if (Math.sign(forwardSpeed) !== direction) {
    // Resistance alone should never push the car backwards.
    forwardSpeed = 0;
  }

  this.vx = forward.x * forwardSpeed + right.x * lateralSpeed;
  this.vz = forward.z * forwardSpeed + right.z * lateralSpeed;

  this.cube.position.x += this.vx * dt;
  this.cube.position.z += this.vz * dt;
}

MainController.prototype.mouseMove = function(event) {
  mouse.x = ( event.clientX / this.renderer.domElement.width ) * 2 - 1;
  mouse.y = - ( event.clientY / this.renderer.domElement.height ) * 2 + 1;
}

angular.module('racer', [
  'ngRoute',
  'config'
])
.controller('MainController', MainController)
.config(function($locationProvider, $routeProvider, config) {
  $locationProvider.html5Mode(true);
  $routeProvider.when('/', {
    templateUrl: '/static/racer/racer.tpl.html?v=' + config.version,
    controller: 'MainController',
    controllerAs: 'ctrl'
  })
})
;
