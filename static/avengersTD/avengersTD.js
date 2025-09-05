
if (window.mudgemi && window.mudgemi.init) {
  app = window.mudgemi.init.app;
  app.loadTags(['p5']);
}

class TowerBuilder {
  constructor(buildables) {
    this.buildables = buildables;
    this.size = 100;
    this.x = 0;
    this.y = height - this.size;

    this.building = null;
    this.money = 100;
    this.towers = [];
  }

  update() {
    for (let i = 0; i < this.towers.length; i++) {
      let tower = this.towers[i];
      tower.update();
    }

    if (this.building) {
      this.building.pos.x = mouseX;
      this.building.pos.y = mouseY;
    }

    if (mouseY > this.y && mouseY < this.y + this.size) {
      this.highlightIndex = int((mouseX - this.x) / this.size);
    } else {
      this.highlightIndex = null;
    }
  }

  click() {
    // Map click
    if (mouseY < this.y) {
      if (this.building) {
        let canBuild = this.building.cost <= towerBuilder.money;

        if (canBuild) {
          // Already have a tower selected so place it if we can afford.
          // console.log("Place a " + this.building.constructor.name + " tower");
          this.towers.push(this.building);
          towerBuilder.money -= this.building.cost;
          this.building = null;
        }
        return;
      }
    }

    // Button clicks.
    if (mouseY > this.y && mouseY < this.y + this.size) {
      let index = int((mouseX - this.x) / this.size);
      if (index >= 0 && index < this.buildables.length) {
        let build = this.buildables[index];
        // console.log("Create a " + build.name + " tower");
        this.building = build.createTower();
        this.building.pos = createVector(mouseX, mouseY);
      }
    }
  }

  show() {
    for (let i = 0; i < this.towers.length; i++) {
      let tower = this.towers[i];
      tower.show();
    }

    if (this.building && mouseY < this.y) { 
      // Only render the building when its on screen.
      // TODO check cost and location to make sure building is acceptable.
      let canBuild = this.building.cost < towerBuilder.money;
      this.building.showGhost(canBuild);
    }

    for (let i = 0; i < this.buildables.length; i++) {
      let c = color(255, 255, 255);
      if (i == this.highlightIndex) {
        c = color(200, 200, 200);
      }
      let y = this.y;
      let x = this.x + this.size * i;
      let b = this.buildables[i];

      strokeWeight(1);
      stroke(255);
      fill(50);
      rect(x, y, this.size, this.size);

      let w = (this.size - 20) * b.image.width / b.image.height;
      let h = (this.size - 20)
      image(b.image, x + (this.size - w), y + 19, w, h)

      noStroke();
      fill(c);
      textSize(12);
      text(b.name, x + 5, y + 15);
      text("$" + b.cost, x + 5, y + 32);
    }
  }

  showShots() {
    for (let i = 0; i < this.towers.length; i++) {
      let tower = this.towers[i];
      tower.showShots();
    }
  }
}

class Arrow {
  constructor(tower, target) {
    this.tower = tower;
    this.pos = tower.pos.copy();
    this.maxSpeed = 12
    this.target = target;
    this.done = false;
  }

  update() {
    if (this.done) {
      return;
    }
    let eta = this.target.vel.copy().add(this.target.pos);
    this.vel = eta.sub(this.pos).limit(this.maxSpeed);
    this.pos.add(this.vel);

    if (this.pos.dist(this.target.pos) < this.maxSpeed) {
      this.target.health -= this.tower.damage;
      this.done = true;
    }
  }

  finished() {
    return this.done;
  }

  show() {
    noFill();
    strokeWeight(2);
    stroke(color(100, 100, 100));

    if (this.vel) {
      let next = this.vel.copy().setMag(10).add(this.pos);

      line(this.pos.x, this.pos.y, next.x, next.y);
    }
  }
}

class Shield {
  constructor(tower, target) {
    this.tower = tower;
    this.pos = tower.pos.copy();
    this.maxSpeed = 20
    this.target = target;
    this.template = new CapAmericaShield();
    this.bounces = 3;
    this.done = false;
  }

  update() {
    if (this.done) {
      return;
    }
    let eta = this.target.pos.copy().add(this.target.vel);
    let vel = eta.sub(this.pos).limit(this.maxSpeed);
    this.pos.add(vel);

    let reachedTarget = this.pos.dist(this.target.pos) < this.maxSpeed;
    if (reachedTarget) {
      // Retarget if you can.
      if (this.bounces > 0) {
        this.target.health -= this.tower.damage;
        this.bounces--;
        let mobs = waveSpawn.getMobs(this.pos, 100);
        let oldtarget = this.target;
        mobs = mobs.filter(function(m) { return m != oldtarget; });
        if (mobs.length > 0) {
          this.target = random(mobs);
        } else {
          this.done = true;
        }
      } else {
        this.done = true;
      }
    }
  }

  finished() {
    return this.done;
  }

  show() {
    if (this.finished()) {
      return;
    }
    this.template.show(this.pos, 10);
  }
}

class Web {
  constructor(tower, target) {
    this.pos = tower.pos.copy();
    this.tower = tower;
    this.target = target;
    this.maxSpeed = 20;
    this.done = false;
  }

  update() {
    if (this.done) {
      return;
    }
    let eta = this.target.pos.copy().add(this.target.vel);
    let vel = eta.sub(this.pos).limit(this.maxSpeed);
    this.pos.add(vel);

    let reachedTarget = this.pos.dist(this.target.pos) < this.maxSpeed;
    if (reachedTarget) {
      this.target.frozenCount = 137;
      this.tower.target = null;
      this.done = true;
    }
  }

  finished() {
    return this.done;
  }

  show() {
    if (this.finished()) {
      return;
    }
    stroke(255);
    strokeWeight(1);
    noFill();
    star(this.pos.x, this.pos.y, 10, 7, 8);
    star(this.pos.x, this.pos.y, 6, 3, 8);
  }
}

class Hammer {
  constructor(tower, target) {
    this.pos = tower.pos.copy();
    this.tower = tower;
    this.target = target;
    this.maxSpeed = 15;
    this.angle = 0;
    this.done = false;
    this.splashRange = 50;
    this.splashDamageRatio = .5;
    this.spashTime = 15;
    this.splashTimer = 0;
  }

  update() {
    if (this.done) {
      return;
    }
    if (this.splashTimer > 0) {
      // No more moving.
      this.splashTimer--;
      if (this.splashTimer == 0) {
        this.done = true;
      }
      return;
    }

    let timeToTarget = this.pos.dist(this.target.pos) / this.maxSpeed;
    let eta = this.target.vel.copy().mult(timeToTarget).add(this.target.pos);
    let vel = eta.sub(this.pos).limit(this.maxSpeed);
    this.pos.add(vel);
    this.angle += 0.5;

    let reachedTarget = this.pos.dist(this.target.pos) < this.maxSpeed;
    if (reachedTarget) {
      this.target.health -= this.tower.damage;
      // Also splash damage nearby
      let mobs = waveSpawn.getMobs(this.pos, this.splashRange);
      for (let m of mobs) {
        // No splash on the main target.
        if (m != this.target) {
          m.health -= int(this.splashDamageRatio * this.tower.damage);
        }
      }
      this.splashTimer = this.spashTime;
    }
  }

  finished() {
    return this.done;
  }

  show() {
    if (this.finished()) {
      return;
    }
    if (this.splashTimer > 0) {
      noStroke();
      fill(200, 200, 0);
      ellipse(this.pos.x, this.pos.y, this.splashRange * Math.sin(this.splashTimer * Math.PI / this.spashTime));
      return;
    }
    // TODO draw a hammer
    stroke(128);
    strokeWeight(1);
    push();
    translate(this.pos.x, this.pos.y);
    rotate(this.angle);
    fill(200);
    rect(-8, -5, 15, 9);
    fill(180, 70, 30);
    rect(-1, 4, 2, 9);
    pop();
  }
}

class Plasma {
  constructor(tower, target) {
    this.pos = tower.pos.copy();
    this.tower = tower;
    this.target = target;
    this.done = false;
    this.time = 17;
  }

  update() {
    if (this.done) {
      return;
    }
    this.time--;
    this.target.health -= this.tower.damage;
    if (this.target.health <= 0) {
      this.done = true;
    }
    if (this.time <= 0) {
      this.done = true;
    }
  }

  finished() {
    return this.done;
  }

  show() {
    if (this.finished()) {
      return;
    }
    strokeWeight(4);
    stroke(255, 0, 0);
    line(this.pos.x, this.pos.y, this.target.pos.x, this.target.pos.y);
    strokeWeight(3);
    stroke(255, 255, 0);
    line(this.pos.x, this.pos.y, this.target.pos.x, this.target.pos.y);
    strokeWeight(2);
    stroke(255, 255, 200);
    line(this.pos.x, this.pos.y, this.target.pos.x, this.target.pos.y);
  }
}

class Tower {
  constructor(path) {
    this.pos = createVector(0, 0);
    this.size = 35;
    this.shots = [];
    this.reloadTime = 27;
    this.shotFactory = {
      'createShot': function(tower, target) { 
        return new Arrow(tower, target);
      }
    }
    this.damage = 100;
    this.range = 200;
    this.rangeColor = color(0, 200, 0);
    this.rangeColor.setAlpha(100);
    this.ghostColor = color(100);
    this.ghostColor.setAlpha(100);
    this.invalidColor = color(150, 0, 0);
    this.invalidColor.setAlpha(100);
  }

  update() {
    for (let i = this.shots.length - 1; i >= 0; i--) {
      let s = this.shots[i];
      if (s.finished()) {
        this.shots.splice(i, 1);
        continue;
      }
      s.update();
    }

    if (this.reloadTimer > 0) {
      this.reloadTimer--;
      // While reloading we don't need to do any other checks.
      return;
    }

    // Deselect targets if they are finished.
    if (this.target && this.target.finished()) {
      this.target = null;
    }
    // Deselect targets which go out of range.
    if (this.target && this.target.pos.dist(this.pos) > this.range) {
      this.target = null;
    }

    // Pick a new target if you don't have one.
    if (!this.target) {
      this.target = this.findTarget();
    }


    if (this.target) {
      this.reloadTimer = this.reloadTime;
      // TODO allow different shot type.
      let shot = this.shotFactory.createShot(this, this.target);
      this.shots.push(shot);
    }
  }

  findTarget() {
    let mobs = waveSpawn.getMobs(this.pos, this.range);

    // TODO selection critera?
    // E.g first, last, nearest etc?
    // Non frozen targets?

    let movingMobs = mobs.filter(function(m) { 
      return m.frozenCount <= 0;
    });

    // Target moving mobs first.
    if (movingMobs.length > 0) {
      return random(movingMobs);
    }
    if (mobs.length > 0) {
      return random(mobs);
    }
    return null;
  }

  showGhost(canBuild) {
    if (canBuild) {
      this.showRange();
      fill(this.ghostColor);
    } else {
      fill(this.invalidColor);
    }
    noStroke();
    rect(this.pos.x - this.size, this.pos.y - this.size, this.size * 2, this.size * 2, this.size / 4);
  }

  showRange() {
    strokeWeight(1);
    fill(this.rangeColor);
    ellipse(this.pos.x, this.pos.y, this.range * 2, this.range * 2);
  }

  show() {
    if (this.template) {
      this.template.show(this.pos, this.size);
    } else if (this.image) {
      let h = this.size
      let w = this.size * this.image.width / this.image.height;
      image(this.image, this.pos.x - w, this.pos.y - h, w * 2, h * 2);
    } else {
      // tower placeholder
      strokeWeight(1);
      stroke(200);
      fill(150);
      rect(this.pos.x - this.size, this.pos.y - this.size, this.size * 2, this.size * 2, this.size / 4);
    }
  }

  showShots() {
    for (let s of this.shots) {
      s.show();
    }
  }
}

class CapAmericaShield {
  show(pos, size) {
    strokeWeight(size / 4);
    stroke(200, 0, 0);
    fill(0, 0, 200);
    ellipse(pos.x, pos.y, size * 2);
    ellipse(pos.x, pos.y, size);
    noStroke();
    fill(255);
    star(pos.x, pos.y, size / 6, size / 3, 5);
  }
}

function star(x, y, radius1, radius2, npoints) {
  let angle = TWO_PI / npoints;
  let halfAngle = angle / 2.0;
  beginShape();
  // Starting at 3/4 of 2 pi means we have start pointing north.
  for (let a = TWO_PI * 3 / 4; a < TWO_PI * 7 / 4; a += angle) {
    let sx = x + cos(a) * radius2;
    let sy = y + sin(a) * radius2;
    vertex(sx, sy);
    sx = x + cos(a + halfAngle) * radius1;
    sy = y + sin(a + halfAngle) * radius1;
    vertex(sx, sy);
  }
  endShape(CLOSE);
}

class WaveSpawn {
  constructor(path, waves) {
    this.path = path;
    this.lives = 100;
    this.mobs = [];
    this.waves = waves;
    this.waveCount = 1;
    this.waveParams = this.waves[this.waveCount];
    this.frameRate = 30;
    // The time for initial and additional waves.
    this.timer = 20 * this.frameRate;
    this.resetTimer = 10 * this.frameRate;
    this.state = "waiting";
  }

  update() {
    if (this.spawnCount > 0) {
      // Spawning wave now.
      this.timer += 1;
      if (this.timer % this.waveParams.spawnRate == 1) {
        let mob = new Mob();
        mob.pos = this.path[0].copy().add(p5.Vector.random2D().mult(5));
        mob.pathIndex = 1;
        mob.target = this.path[mob.pathIndex];
        mob.maxSpeed = this.waveParams.speed;
        mob.maxForce = mob.maxSpeed * 0.5;
        mob.setMaxHealth(this.waveParams.health);
        this.mobs.push(mob);
        this.spawnCount--;
        if (this.spawnCount == 0) {
          // Reset timer and increment wave counter.
          this.state = "inprogress";
        }
      }
    }

    if (this.mobs.length > 0) {
      // Wave in progress, update mobs.
      let stillRunning = false;
      for (let i = 0; i < this.mobs.length; i++) {
        let m = this.mobs[i];
        if (m.finished()) {
          if (!m.reachedEnd && !m.paid) {
            towerBuilder.money += 5;
            m.paid = true;
          }
          continue;
        }
        m.update();
        if (m.pos.dist(m.target) < 5) {
          // Reached checkpoint in path;
          m.pathIndex += 1;
          if (m.pathIndex >= this.path.length) {
            m.reachedEnd = true;
            this.lives--;
          } else {
            m.target = this.path[m.pathIndex];
          }
        }
        stillRunning = true;
      }
      if (!stillRunning) {
        this.mobs = [];
        if (this.state == "inprogress") {
          this.state = "waiting";
          this.timer = this.resetTimer;
          if (this.waveCount < this.waves.length - 1) {
            this.waveCount += 1;
            this.waveParams = this.waves[this.waveCount];
          } else {
            // TODO End game, spawn Thanos's?
          }
        }
      }

      return;
    }

    if (this.state == "waiting") {
      // Countdown to next wave once no mobs remain.
      this.timer -= 1;
      if (this.timer <= 0) {
        this.spawnCount = this.waveParams.count;
        this.state = "spawning";
      }
    }
  }

  getMobs(location, range) {
    return this.mobs.filter(function (m) {
      if (m.finished()) {
        return false;
      }
      return m.pos.dist(location) < range;
    });
  }

  show() {
    this.showPath();


    let end = this.path[this.path.length - 1];
    let w = 100 * this.home.width / this.home.height;
    let h = 100
    image(this.home, end.x - w / 2, end.y - h / 2, w, h);

    // Draw mobs after path, so they appear on top of it.
    for (let i = 0; i < this.mobs.length; i++) {
      let m = this.mobs[i];
      m.show();
    }
  }

  showPath() {
    strokeWeight(3);
    stroke(color(200, 0, 0));

    var lastp = this.path[0];
    for (let p of this.path) {
      line(lastp.x, lastp.y, p.x, p.y);
      lastp = p;
    }
  }
}

class Mob {
  constructor() {
    this.size = 10;
    this.pos = createVector(random(width), random(height));
    this.vel = createVector(0, 0);
    this.acc = createVector(0, 0);
    this.maxForce = 0.8;
    this.maxSpeed = 5;
    this.maxHealth = 100;
    this.health = 100;
    this.frozenCount = 0;
    this.reachedEnd = false;
    this.paid = false;
    this.color = color(22, 100, 22);
  }

  border() {
    if (this.pos.x > width - this.size) {
      this.pos.x = width - this.size;
      this.vel.x *= -1;
    } else if (this.pos.x < this.size) {
      this.pos.x = this.size;
      this.vel.x *= -1;
    } else if (this.pos.y > height - this.size) {
      this.pos.y = height - this.size;
      this.vel.y *= -1;
    } else if (this.pos.y < this.size) {
      this.pos.y = this.size;
      this.vel.y *= -1;
    }
  }

  finished() {
    return this.reachedEnd || this.health <= 0;
  }

  setMaxHealth(h) {
    this.health = h;
    this.maxHealth = h;
  }

  update() {
    let speedMulti = 1;
    if (this.frozenCount) {
      speedMulti = 0.4;
      this.frozenCount--;
    }
    this.pos.add(this.vel);
    this.vel.add(this.acc);

    if (this.target) {
      // When you have a target update your speed towards it.
      let desired = p5.Vector.sub(this.target, this.pos);
      desired.limit(this.maxSpeed * speedMulti);
      let force = p5.Vector.sub(desired, this.vel);
      force.limit(this.maxForce);
      this.acc = force;
    }
  }

  show() {
    if (this.finished()) {
      return;
    }
    noStroke();
    this.color.setAlpha(105 + max(0, this.health * 150 / this.maxHealth));
    fill(this.color);

    ellipse(this.pos.x, this.pos.y, this.size * 2);
  }
}

class TowerBuildButton {
  constructor(name, image) {
    this.name = name;
    this.image = image;
    this.cost = 50;
    this.range = 200;
    this.upgradeLevelMult = 1.1;
  }

  createTower() {
    let t = new Tower();
    t.image = this.image;
    t.cost = this.cost;
    t.damage = this.damage;
    if (this.reloadTime) {
      t.reloadTime = this.reloadTime;
    }
    t.range = this.range;
    switch (this.name) {
      case "Captain America":
        t.shotFactory = {
          'createShot': function(tower, target) { 
            return new Shield(tower, target);
          }
        }
        break;
      case "Spiderman":
        t.shotFactory = {
          'createShot': function(tower, target) {
            return new Web(tower, target);
          }
        }
        break;
      case "Iron Man":
        t.shotFactory = {
          'createShot': function(tower, target) {
            return new Plasma(tower, target);
          }
        }
        break;
      case "Thor":
        t.shotFactory = {
          'createShot': function(tower, target) {
            return new Hammer(tower, target);
          }
        }
        break;
      case "Hawkeye":
        break;
    }
  return t;
  }
}

function preload() {
  spiderman = loadImage('/static/avengersTD/assets/spiderman.jpeg');
  hawkeye = loadImage('/static/avengersTD/assets/hawkeye.jpeg');
  captain = loadImage('/static/avengersTD/assets/captain america.jpeg')
  thor = loadImage('/static/avengersTD/assets/thor.jpeg');
  ironman = loadImage('/static/avengersTD/assets/ironman.jpeg');
  avengers = loadImage('/static/avengersTD/assets/avengers facility.jpeg');
}

function windowResized() {
   resizeCanvas(windowWidth, windowHeight);
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  frameRate(30);

  let params = new URLSearchParams(window.location.search);

  let times = 5;

  let path = [];
  for (let i = 0; i <= times; i++) {
    let x = 100 + (width - 200) * i / times;
    if (i % 2 == 0) {
      path.push(createVector(x, 100));
      path.push(createVector(x, height - 200));
    } else {
      path.push(createVector(x, height - 200));
      path.push(createVector(x, 100));
    }
  }

  let waves = [];
  for (let i =0; i <= 50; i++) {
    wave = {
      count: i + 5,
      spawnRate: 4,
      speed: int(5 + 5 * i / 50),
      health: int(100 + 50 * i),
      tags: [],
    };
    if (i % 3 == 0 || i == 50) {
      // Healthy wave.
      wave.health *= 2;
      wave.tags.push("healthy")
    }
    if (i % 5 == 0 || i == 50) {
      // Spread out wave.
      wave.spawnRate = 2;
      wave.tags.push("close")
    }
    if (i % 7 == 0 || i == 50) {
      // Fast wave.
      wave.speed = 10;
      wave.tags.push("fast")
    }
    if (i % 11 == 0 || i == 50) {
      // Double wave.
      wave.count *= 2;
      wave.tags.push("double")
    }
    waves.push(wave);
  }

  waveSpawn = new WaveSpawn(path, waves);
  waveSpawn.home = avengers;

  towerBuilder = new TowerBuilder([
    h = new TowerBuildButton('Hawkeye', hawkeye),
    s = new TowerBuildButton('Spiderman', spiderman),
    ca = new TowerBuildButton('Captain America', captain),
    t = new TowerBuildButton('Thor', thor),
    im = new TowerBuildButton('Iron Man', ironman),
  ]);

  // Damage per frame = 120 / 23
  h.cost = 30;
  h.damage = 120;
  h.range = 300;
  h.reloadTime = 23;

  // Damage per frame = 3 * 50 / 29
  ca.cost = 70;
  ca.damage = 50;
  ca.reloadTime = 29;

  // Damage per frame = 10 / 31 (slows)
  s.cost = 50;
  s.damage = 10;
  s.reloadTime = 31;

  // Damage per frame = 100 * X / 42
  t.cost = 100;
  t.damage = 100;
  t.range = 250;
  t.reloadTime = 42;

  // Damage per frame = 15 * 17 / 19
  im.cost = 150;
  im.damage = 15;
  im.reloadTime = 2;


  if (params.get('money')) {
    towerBuilder.money = params.get('money');
  }
  if (params.get('fast')) {
    waveSpawn.timer = params.get('fast');
    waveSpawn.resetTimer = params.get('fast'); 
  }
}

function mouseClicked() {
  towerBuilder.click();
  return false;
}

function draw() {
  background(0);

  waveSpawn.update();
  towerBuilder.update();

  waveSpawn.show();
  towerBuilder.show();
  towerBuilder.showShots();


  noStroke();
  fill(255);
  let message = "Wave " + waveSpawn.waveCount + " in progress " + waveSpawn.waveParams.tags.join(", ");
  if (waveSpawn.state == "waiting") {
    message = "Wave " + waveSpawn.waveCount + " in " + int(waveSpawn.timer / waveSpawn.frameRate);
  }
  text(message, 5, 15);

  text("Lives: " + waveSpawn.lives, width - 70, 15);
  text("Money: " + towerBuilder.money, width - 70, 35);

  // TODO skip button?
}

// Angular trys to load this modules.
angular.module('avengersTD', [
  'config',
  'ngRoute'
])