var cube = function(size, color) {
  var geometry = new THREE.BoxGeometry( size, size, size );
  var material = new THREE.MeshPhongMaterial( {color: color} );
  var cube = new THREE.Mesh( geometry, material );
  return cube;
}

var cylinder = function(size, color) {
  // How many sections make the circle.
  var detail = 20;
  var geometry = new THREE.CylinderGeometry( size, size *.75, size, detail );
  var material = new THREE.MeshPhongMaterial( {color: color} );
  var cylinder = new THREE.Mesh( geometry, material );
  return cylinder;
}

var units = window.mmRts.units;
var colors = window.mmRts.colors;
var Spawner = function(team, x, z) {
  this.game = team.game;
  this.team = team;
  this.health = 10000;
  this.attackPower = 500;
  this.buildTime = 50;
  this.mesh = cube(10, team.color);
  this.mesh.position.x = x;
  this.mesh.position.y = 5;
  this.mesh.position.z = z;
}
units.Spawner = Spawner;
Spawner.prototype.update = function() {
  this.buildTime--;
  if (this.buildTime <= 0) {
    // Complete a unit.
    // TODO generate a position next to this spawner.
    this.generate();
    // 60fps * seconds.
    this.buildTime = 60 * 10;
  }

  var nearbyUnits = this.game.getNearby(this.mesh.position, this.sight);
  angular.forEach(nearbyUnits, angular.bind(this, function(unit) {
    if (unit.team != this.team) {
      // console.log('Found target', this.team, unit.team);
      this.target = unit;
    }
  }));

  if (this.target) {
    Unit.prototype.attack.bind(this)();
  }
}

// Generate a new vector nearby to a source vector.
Spawner.prototype.nearByLocation = function(vec) {
  var loc = new THREE.Vector3(
      Math.random() * 10 - 5,
      0,
      Math.random() * 10 - 5);
  loc.add(vec);
  return loc;
}

Spawner.prototype.generate = function() {
  // go to the opposite position on the map.
  var targetPos = new THREE.Vector3();
  targetPos.copy(this.mesh.position).negate();

  for (var i = 0; i < 3; i++) {
    var position = this.nearByLocation(this.mesh.position)
    var unit = new Unit(this.team, position, targetPos);
    // High health but low range.
    unit.health = 500;
    unit.range = 5;
    this.game.addObject(unit);
  }
  for (var i = 0; i < 3; i++) {
    var position = this.nearByLocation(this.mesh.position)
    position.y = 10;
    var unit = new Unit(this.team, position, targetPos);
    unit.canAttackMove = true;
    this.game.addObject(unit);
  }

  var spawn_location = this.nearByLocation(this.mesh.position);
  this.game.addObject(new Carrier(this.team, spawn_location));
}

var Carrier = function(team, position) {
  this.dockedUnits = 8;
  this.game = team.game;
  this.team = team;
  this.health = 100;
  this.sight = 30;
  this.mesh = cube(6, team.color);
  this.mesh = cylinder(6, team.color);
  this.mesh.scale.z = 2;
  this.mesh.position.copy(position);

  var pos = new THREE.Vector3();
  pos.copy(position).negate();
  this.move = new MoveAction(this, pos);
}
Carrier.prototype.update = function() {
  var colorScale = 1 - this.health / 100;
  this.mesh.material.color.copy(this.team.color);
  this.mesh.material.color.lerp(colors.BLACK, colorScale);
  this.mesh.material.needsUpdate = true;

  if (!this.target) {
    // Look for enemy.
    var nearbyUnits = this.game.getNearby(this.mesh.position, this.sight);
    angular.forEach(nearbyUnits, angular.bind(this, function(unit) {
      if (unit.team != this.team) {
        // console.log('Found target', this.team, unit.team);
        this.target = unit;
      }
    }))
  }

  if (this.target) {
    if (this.dockedUnits > 0) {
      // Deploy units.
      this.dockedUnits--;
      var unit = new Unit(this.team, this.mesh.position, this.move.targetPosition);
      unit.canAttackMove = true;
      // TODO some randomness to units?
      this.game.addObject(unit);
    }
    if (this.target.health <= 0) {
      this.target = null;
    }
  } else {
    this.move.update();
  }
}

var MoveAction = function(unit, position) {
  this.targetPosition = position;
  this.mesh = unit.mesh;

  this.velocity = new THREE.Vector3();
  this.acceleration = new THREE.Vector3();
  var x = Math.random() * 2 - 1;
  var z = Math.random() * 2 - 1;
  // Initialize with a random speed/direction.
  this.velocity.set(x, 0, z).setLength(.2);
  this.friction = 0.98;
  // Acceleration length.
  this.power = 0.008;
}

MoveAction.prototype.updateTarget = function(pos) {
  this.targetPosition = pos;
}

var next = new THREE.Vector3();
MoveAction.prototype.update = function() {
  // TODO restrict acceleration more than this?
  // Only foward/back and turn?
  this.acceleration.subVectors(this.targetPosition, this.mesh.position).setLength(this.power);
  this.acceleration.y = 0;

  this.velocity.add(this.acceleration);
  // Apply friction.
  this.velocity.multiplyScalar(this.friction);
  this.velocity.y = 0;

  // This makes the unit look at the direction it wants to go.
  // That is also the direction of acceleration.
  // this.mesh.lookAt(this.targetPosition);

  // Calculate where the mesh will be next and use that to derive direction.
  next.addVectors(this.mesh.position, this.velocity);
  this.mesh.lookAt(next);
  this.mesh.position.add(this.velocity);
}

var Unit = function(team, position, targetPosition) {
  this.game = team.game;
  this.mesh = cube(1, team.color);
  this.team = team;
  this.health = 100;
  this.attackPower = 1;
  // How far the unit can see.
  this.sight = 25;
  this.range = 20;
  this.mesh.position.copy(position);

  this.speed = 1;
  targetPosition = targetPosition || this.mesh.position;
  this.goal = targetPosition;
  this.move = new MoveAction(this, targetPosition);
}
Unit.prototype.update = function() {
  var colorScale = 1 - this.health / 100;
  this.mesh.material.color.copy(this.team.color);
  this.mesh.material.color.lerp(colors.BLACK, colorScale);
  this.mesh.material.needsUpdate = true;

  if (!this.target) {
    // Look for enemy.
    var nearbyUnits = this.game.getNearby(this.mesh.position, this.sight);
    angular.forEach(nearbyUnits, angular.bind(this, function(unit) {
      if (unit.team != this.team) {
        // console.log('Found target', this.team, unit.team);
        this.target = unit;
      }
    }));
  }
  var move = true;
  if (this.target) {
    // If the target has moved we need to keep up with it.
    this.move.updateTarget(this.target.mesh.position);

    // Fight the target, chasing it down.
    var range = this.target.mesh.position.distanceTo(this.mesh.position);
    if (range < this.range) {
      this.attack();
      move = this.canAttackMove;
    }
  }

  if (move) {
    this.move.update();
  }
}

Unit.prototype.attack = function() {
  this.target.health -= this.attackPower;
  if (this.target.health <= 0) {
    this.target = null;
  }
  if (!this.target) {
    // If the target is gone, go back to the goal.
    this.move.updateTarget(this.goal);
  }
}
