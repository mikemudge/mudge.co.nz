export class Team {
  constructor(game, color) {
    this.game = game;
    this.map = game.map;
    this.color = color;
    this.headQuarters = null;
    // TODO starting with high resources for testing.
    this.resourceCount = 2000;
  }

  getGame() {
    return this.game;
  }
  getMap() {
    return this.map;
  }

  setHq(hq) {
    this.headQuarters = hq;
  }
}

export class Resource {

}

export class GameMap {
  constructor(width, height) {
    this.bounds = createVector(width, height);
    // Units and buildings (attackable targets).
    this.units = [];
    // resource gathering objects.
    this.features = [];
    // short lived attack visuals.
    this.projectiles = [];
    // Human and non-human controllers.
    this.controls = [];
  }

  getBounds() {
    return this.bounds
  }

  addControls(controls) {
    this.controls.push(controls);
  }

  addFeature(feature) {
    this.features.push(feature);
  }

  addUnit(unit) {
    this.units.push(unit);
  }

  getNearby(pos, range) {
    var result = this.units.filter(function(unit) {
      return unit.pos.dist(pos) < range;
    });
    return result;
  }

  getNearbyFeatures(pos, range) {
    var result = this.features.filter(function(feature) {
      return feature.pos.dist(pos) < range;
    });
    return result;
  }

  getInArea(x, y, w, h) {
    var result = this.units.filter(function(unit) {
      return unit.pos.x > x && unit.pos.x < x + w && unit.pos.y > y && unit.pos.y < y + h;
    });
    return result;
  }

  update() {
    // Update everything
    for (let control of this.controls) {
      control.update();
    }

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      this.projectiles[i].update();
      if (this.projectiles[i].finished()) {
        this.projectiles.splice(i, 1);
      }
    }

    for (let unit of this.units) {
      unit.update();
    }
    // Remove units which are finished.
    for (let i = this.units.length - 1; i >= 0; i--) {
      if (this.units[i].finished()) {
        this.units.splice(i, 1);
      }
    }
  }

  show(view) {
    view.update();

    // Render the game, units, health bars, and control/overlays.
    for (let unit of this.features) {
      view.show(unit);
    }
    for (let unit of this.units) {
      view.show(unit);
    }

    for (let projectile of this.projectiles) {
      view.show(projectile);
    }

    // Then health bars on top.
    for (let unit of this.units) {
      let health = unit.getHealth();
      if (health.isDamaged()) {
        view.showMethodAtPos(health.showHealth.bind(health), unit.pos);
      }
    }
    for (let control of this.controls) {
      control.draw();
    }
  }
}