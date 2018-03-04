var cube = function(size, color) {
  var geometry = new THREE.BoxGeometry( size, size, size );
  var material = new THREE.MeshBasicMaterial( {color: color} );
  var cube = new THREE.Mesh( geometry, material );
  return cube;
}

var units = window.mmRts.units;
var colors = window.mmRts.colors;
var Spawner = function(team, x, z) {
  this.game = team.game;
  this.team = team;
  this.buildTime = 50;
  this.mesh = cube(10, team.color);
  this.mesh.position.x = x;
  this.mesh.position.z = z;
}
units.Spawner = Spawner;
Spawner.prototype.update = function() {
  this.buildTime--;
  if (this.buildTime <= 0) {
    // Complete a unit.
    // TODO generate a position next to this spawner.
    this.game.addObject(new Carrier(this.team, this.mesh.position));
    // 60fps * seconds.
    this.buildTime = 60 * 10;
  }
}

var Carrier = function(team, position) {
  this.dockedUnits = 8;
  this.game = team.game;
  this.team = team;
  this.health = 100;
  this.mesh = cube(6, team.color);
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
    // TODO use sight for range.
    var nearbyUnits = this.game.getNearby(this.mesh.position, 30);
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

  this.velocity.add(this.acceleration);
  // Apply friction.
  this.velocity.multiplyScalar(this.friction);

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
  this.mesh.position.copy(position);

  this.speed = 1;
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
    // TODO use sight for range.
    var nearbyUnits = this.game.getNearby(this.mesh.position, 20);
    angular.forEach(nearbyUnits, angular.bind(this, function(unit) {
      if (unit.team != this.team) {
        // console.log('Found target', this.team, unit.team);
        this.target = unit;
      }
    }))
  }
  var move = true;
  if (this.target) {
    // Fight the target, chasing it down.
    this.target.health--;
    if (this.target.health <= 0) {
      this.target = null;
    }
    if (this.target) {
      this.move.updateTarget(this.target.mesh.position);
    } else {
      this.move.updateTarget(this.goal);
    }
    move = this.canAttackMove || false;
  }

  if (move) {
    this.move.update();
  }
}

