
class BuildCommand {
  constructor(building) {
    this.building = building;
  }

  update(unit) {
    let range = this.building.getSize() * 1.4 + unit.getSize();
    if (unit.pos.dist(this.building.pos) < range) {
      this.building.build();
      unit.stop();
    } else {
      // Make the unit move to the pos.
      unit.applyForce(unit.seek(this.building.pos));
    }
  }

  getPos() {
    return this.building.pos;
  }

  isComplete(unit) {
    return this.building.isBuilt();
  }
}

class GatherCommand {
  constructor(resource) {
    this.resource = resource;
    this.phase = 0;
    this.time = 0;
    // TODO these could update after each iteration?
    // Handle new buildings, closer/more available resources etc?
    this.gotoResource = new MoveCommand(resource.pos);
    this.dropOff = null;
  }

  getPos() {
    if (this.phase < 2) {
      return this.gotoResource.getPos();
    }
    return this.dropOff.pos;
  }

  update(unit) {
    if (this.phase === 0) {
      // TODO resource radius (currently hard coded as 10)?
      if (unit.pos.dist(this.resource.pos) < 10 + unit.getSize()) {
        unit.stop();
        // unit.game.view.overlayMenu.addMessage("Unit gathering resource at " + Util.vectorString(unit.pos));
        this.phase = 1;
      } else {
        this.gotoResource.update(unit);
      }
    } else if (this.phase === 1) {
      // timed wait "gathering"
      this.time++;
      if (this.time >= 200) {
        // unit.game.view.overlayMenu.addMessage("Unit collected resource at " + Util.vectorString(unit.pos));
        this.phase = 2;
        this.dropOff = this.calculateDropOff(unit);
      }
    } else if (this.phase === 2) {
      // Make the unit move to the pos.
      unit.applyForce(unit.seek(this.dropOff.pos));
      if (unit.pos.dist(this.dropOff.pos) < this.dropOff.getSize() + unit.getSize() + 10) {
        // TODO which resource type?
        unit.team.resourceCount += 5;
        this.time = 0;
        this.phase = 0;
      }
    }
  }

  calculateDropOff(unit) {
    // TODO should find the closest building which can be dropped off at?
    return unit.team.headQuarters;
  }

  isComplete(unit) {
    // Gathering is never done?
    return false
  }
}

class AttackCommand {
  constructor(target) {
    this.target = target;
  }

  update(unit) {
    // If the target has a size we only need to get within range of that to attack it.
    let range = unit.unitClass.attackRange + this.target.getSize();
    if (this.target.pos.dist(unit.pos) < range) {
      unit.stop();
      this.target.damage(unit.unitClass.attackPower);
      return;
    }
    // Make the unit move to the pos.
    unit.applyForce(unit.seek(this.target.pos));
  }

  getPos() {
    return this.target.pos;
  }

  isComplete(unit) {
    return !this.target.getHealth().isAlive();
  }
}

class AttackMoveCommand {
  constructor(destination) {
    // destination is a position to move to, target is a unit to attack on the way.
    this.destination = destination;
    this.target = null;
  }

  update(unit) {
    if (this.target) {
      if (this.target.finished()) {
        // TODO attempt to find another target?
        this.target = null;
      }
    }
    // TODO can we make target acquisition less frequent?
    if (!this.target) {
      // Assume a sight of 200 for all?
      let nearby = unit.team.map.getNearby(unit.pos, unit.unitClass.sightRange);
      nearby = nearby.filter(function(target) {
        return target.team !== unit.team
      });
      if (nearby.length > 0) {
        this.target = random(nearby);
      }
    }

    if (this.target) {
      let dis = this.target.pos.dist(unit.pos);
      if (dis < this.target.getSize() + unit.unitClass.attackRange) {
        this.target.damage(unit.unitClass.attackPower);
        unit.stop();
      } else if (dis > unit.unitClass.sightRange) {
        // Give up, lost sight of it.
        this.target = null;
      } else {
        // Chase the unit.
        unit.applyForce(unit.seek(this.target.pos));
      }
    } else {
      // Make the unit move towards the destination.
      unit.applyForce(unit.seek(this.destination));
    }
  }

  getPos() {
    if (this.target) {
      return this.target.pos;
    }
    return this.destination;
  }

  isComplete(unit) {
    return this.destination.dist(unit.pos) < unit.unitClass.maxSpeed;
  }
}

class MoveCommand {
  constructor(pos) {
    this.pos = pos;
  }

  update(unit) {
    // Make the unit move to the pos.
    unit.applyForce(unit.seek(this.pos));
  }

  getPos() {
    return this.pos;
  }

  isComplete(unit) {
    let range = 1;
    if (unit.unitClass.maxSpeed) {
      range = unit.unitClass.maxSpeed / 2;
    }
    return unit.pos.dist(this.pos) < range;
  }
}

class PathCommand {
  constructor(path) {
    this.goalIndex = 0;
    this.pathActions = [];
    for (let p of path) {
      this.pathActions.push(new AttackMoveCommand(p));
    }
  }

  update(unit) {
    if (this.isComplete(unit)) {
      unit.stop();
      return;
    }
    this.pathActions[this.goalIndex].update(unit);

    // If the unit completes the attack move action, move to the next one.
    if (this.pathActions[this.goalIndex].isComplete(unit)) {
      this.goalIndex++;
    }
  }

  isComplete(unit) {
    return this.goalIndex >= this.pathActions.length;
  }
}

class SpawnCommand {
  constructor(unit, paths) {
    this.paths = paths;
    this.time = -1;
    this.respawnTime = 200;

    this.unit = unit;
  }

  update(building) {
    this.time++;
    if (this.time % this.respawnTime === 0) {
      for (let i = 0; i < 4; i++) {
        for (let path of this.paths) {
          let pos = p5.Vector.random2D().mult(building.getSize() / 10).add(building.pos);
          let unit = this.unit.create(pos, building.team);
          unit.setAction(new PathCommand(path));
          building.map.addUnit(unit);
        }
      }
    }
  }

  isComplete(unit) {
    return false;
  }
}