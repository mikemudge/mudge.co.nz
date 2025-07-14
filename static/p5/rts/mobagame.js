
class HeroUnit extends Unit {
  constructor(pos, team) {
    super(pos, team);
    this.targetPos = null;
    this.vel.mult(0);
    this.r = 12;
    this.maxSpeed = 3;
    this.maxForce = 6;
    this.health = new HealthBar(500, this.r * 1.5);
    this.health.setRecovery(10);
    // TODO experience and leveling up stats?
  }

  update() {
    this.health.update();
    // Move to a target location, or attack a target unit?
    if (this.targetPos) {
      if (this.pos.dist(this.targetPos) < this.maxSpeed) {
        // Set speed/acc to 0;
        this.stop();
        this.targetPos = null;
        return;
      }
      this.applyForce(this.seek(this.targetPos));
    }

    // Now update the speed and position based on what was calculated above.
    this.vel.add(this.acc);
    this.vel.limit(this.maxSpeed);

    this.pos.add(this.vel);
    this.stop();
  }
}

class Path {
  constructor(points) {
    this.points = points;
  }

  show() {
    stroke(255);
    for (let i = 1; i < this.points.length; i++) {
      line(x, y, this.points[i].x, this.points[i].y);
      x = this.points[i].x;
      y = this.points[i].y;
    }
  }
}

class Spawner extends Building {
  constructor(pos, team) {
    super(pos, team);
    this.r = 50;
    this.paths = [];
    this.time = -1;
    this.respawnTime = 200;
    this.color = team.color;
    this.health = new HealthBar(10000, this.r);
  }

  addPath(path) {
    this.paths.push(new Path(path));
  }

  update() {
    this.time++;
    if (this.time % this.respawnTime === 0) {
      for (let i = 0; i < 4; i++) {
        for (let path of this.paths) {
          let pos = p5.Vector.random2D().mult(this.r / 10).add(this.pos);
          let unit = new Unit(pos, this.team);
          unit.setAction(new PathCommand(path));
          this.map.addUnit(unit);
        }
      }
    }
  }

  getHealth() {
    return this.health;
  }

  damage(attack) {
    this.health.damage(attack);
  }

  finished() {
    return !this.health.isAlive();
  }
}

class MobaGame {
  constructor(view, map) {
    this.view = view;
    this.map = map;
    this.mousePos = createVector(0, 0);
  }

  init() {
    let bounds = this.map.getBounds();
    let topLeft = createVector(50, 50);
    let topRight = createVector(bounds.x - 50, 50);
    let bottomLeft = createVector(50, bounds.y - 50);
    let bottomRight = createVector(bounds.x - 50, bounds.y - 50);

    let redTeam = new Team(this, color('#D33430'));
    let spawner = new Spawner(createVector(50, 50), redTeam);
    spawner.addPath([bottomRight]);
    spawner.addPath([bottomLeft, bottomRight]);
    spawner.addPath([topRight, bottomRight]);
    this.map.addUnit(spawner);
    this.map.addUnit(new Tower(createVector(150, 50), redTeam));
    this.map.addUnit(new Tower(createVector(50, 150), redTeam));
    this.map.addUnit(new Tower(createVector(bounds.x / 2, 50), redTeam));
    this.map.addUnit(new Tower(createVector(50, bounds.y / 2), redTeam));

    this.hero = new HeroUnit(createVector(100, 100), redTeam);
    this.addUnit(this.hero);

    let blueTeam = new Team(this, color('#5C16C8'))
    spawner = new Spawner(createVector(bounds.x - 50, bounds.y - 50), blueTeam);
    spawner.addPath([topLeft]);
    spawner.addPath([bottomLeft, topLeft]);
    spawner.addPath([topRight, topLeft]);
    this.map.addUnit(spawner);
    this.map.addUnit(new Tower(createVector(bounds.x - 150, bounds.y - 50), blueTeam));
    this.map.addUnit(new Tower(createVector(bounds.x - 50, bounds.y - 150), blueTeam));
    this.map.addUnit(new Tower(createVector(bounds.x / 2, bounds.y - 50), blueTeam));
    this.map.addUnit(new Tower(createVector(bounds.x - 50, bounds.y / 2), blueTeam));
  }

  getNearby(pos, range) {
    return this.map.getNearby(pos, range);
  }

  addUnit(unit) {
    console.warn("should use map.addUnit directly")
    this.map.addUnit(unit);
  }

  applyControl(unit, force) {
    unit.applyForce(force);
  }

  click() {
    this.mousePos.set(mouseX, mouseY);
    this.hero.targetPos = view.toGame(mousePos);
  }

  show() {
    if (!this.hero.finished()) {
      this.view.setCenter(this.hero.pos);
    }
    this.view.update();

    this.map.update();
    this.map.show(this.view);

    this.view.coverEdges();
  }
}
