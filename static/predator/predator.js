class QuadTree {
  constructor(level) {
    this.xMid = 0;
    this.yMid = 0;
    this.creatures = [];
    // if (level < 4) {
    //   this.nodes = [
    //     [new QuadTree(level + 1), new QuadTree(level + 1)],
    //     [new QuadTree(level + 1), new QuadTree(level + 1)]
    //   ];
    // }
  }

  add(creature, pos) {
    if (!this.nodes) {
      this.creatures.push(creature);
      return;
    }
    let x = pos.x < this.xMid ? 0 : 1;
    let y = pos.y < this.yMid ? 0 : 1;
    this.nodes[x][y].add(creature, pos);
  }

  getMany(pos, range, lists) {
    if (!this.nodes) {
      lists.push(this.creatures);
      return;
    }
    let x1 = pos.x - range < this.xMid ? 0 : 1;
    let x2 = pos.x + range < this.xMid ? 0 : 1;
    let y1 = pos.y - range < this.yMid ? 0 : 1;
    let y2 = pos.y + range < this.yMid ? 0 : 1;
    for (let x=x1;x<=x2;x++) {
      for (let y=y1;y<=y2;y++) {
        // TODO make this more more efficient than concat?
        this.nodes[x][y].getMany(pos, range, lists);
      }
    }
  }
}

class World {
  constructor(pos, size) {
    this.lineColor = '#FFFFFF';
    this.pos = pos;
    this.size = size;
    this.width = size.x;
    this.height = size.y;
    this.quadTree = new QuadTree(0);
  }

  draw() {
    // Draw Arena
    stroke(this.lineColor);
    strokeWeight(1);
    noFill();
    rect(this.pos.x, this.pos.y, this.width, this.height);
  }

  add(creature) {
    this.quadTree.add(creature, creature.pos);
  }

  closeTo(pos, range, lists) {
    return this.quadTree.getMany(pos, range, lists);
  }
}

class Creature {
  constructor(world, pos, params) {
    this.world = world;
    this.pos = pos;
    this.health = 100;
    this.colors = [
      color(255,0,0),
      color(0,0,255),
      color(0,255,0),
    ];
    this.color = Math.floor(random(this.colors.length));
    this.vel = createVector(0, 0);
    this.radius = 5;
    this.maxSpeed = 6;
    this.maxForce = 0.2;
  }

  beats(other) {
    if (this.color !== other.color) {
      if ((this.color + 1) % this.colors.length === other.color) {
        return true;
      }
    }
  }

  bounceBorder() {
    if (this.pos.x - this.radius < this.world.pos.x && this.vel.x < 0) {
      this.vel.x *= -1;
    }
    if (this.pos.x + this.radius > this.world.pos.x + this.world.width && this.vel.x > 0) {
      this.vel.x *= -1;
    }
    if (this.pos.y - this.radius < this.world.pos.y && this.vel.y < 0) {
      this.vel.y *= -1;
    }
    if (this.pos.y + this.radius > this.world.pos.y + this.world.height && this.vel.y > 0) {
      this.vel.y *= -1;
    }
  }

  wrapBorder() {
    let x = (this.pos.x - this.world.pos.x + this.world.size.x) % this.world.size.x + this.world.pos.x;
    let y = (this.pos.y - this.world.pos.y + this.world.size.y) % this.world.size.y + this.world.pos.y;

    this.pos.set(x, y);
  }

  update() {
    this.pos.add(this.vel);

    // crash?
    // this.bounceBorder();
    this.wrapBorder();

    let force = createVector(0, 0);
    for (let c of this.world.allCreatures) {
      if (c === this) {
        // Skip interactions with yourself.
        continue;
      }
      let diff = p5.Vector.sub(c.pos, this.pos);
      let dis = diff.mag();

      if (dis < 2 * this.radius) {
        // In range, apply color changes.
        if (this.beats(c)) {
          c.color = this.color;
        } else if (this.beats(c)) {
          this.color = c.color;
        }
        // Also bounce away?
        this.vel.set(diff.x, diff.y);
        this.vel.setMag(-1);
      }

      if (dis > 200) {
        // ignore things far away.
        continue;
      }
      // scale inversely to distance.
      diff.setMag(100.0 / dis);
      if (c.beats(this)) {
        // avoid.
        force.sub(diff);
      } else if (this.beats(c)) {
        // chase
        force.add(diff)
      }
    }

    // random movement.
    force.add(p5.Vector.random2D().mult(this.maxForce));
    force.limit(this.maxSpeed);
    force.sub(this.vel);

    force.limit(this.maxForce);
    this.vel.add(force);

    // Slow down;
    this.vel.mult(0.98);

    if (this.vel.mag() < 0.01) {
      this.vel.set(0, 0);
    }

  }

  draw() {
    fill(this.colors[this.color]);
    noStroke();
    arc(this.pos.x, this.pos.y, this.radius * 2, this.radius * 2, 0, 2 * Math.PI);
  }
}
Creature.BOUNCE_BACK = 0.5;
Creature.FRICTION = 0.1;

var SoccerGame = function(width, height) {
  this.stopped = false;
  this.pause = false;

  this.creatures = [];
  this.world = new World(
      createVector(width / 20,  height / 20),
      createVector(width * 18 / 20, height * 18 / 20)
  );
  this.world.allCreatures = this.creatures;

  // 1000 works ok.
  // 5000 is slow (1fps)
  let howMany = 1000;
  for (var i = 0; i < howMany; i++) {
    let loc = this.world.size.copy();
    loc.mult(random(), random())
    loc.add(this.world.pos);
    let creature = new Creature(this.world, loc, {});
    this.world.add(creature);
    this.creatures.push(creature);
  }
};

SoccerGame.prototype.update = function() {
  // Update the game.
  this.creatures.forEach(function (c) {
    c.update();
  });
  // Remove dead creatures.
  // this.creatures = this.creatures.filter(function(c) {
  //   return c.health > 0;
  // });
  this.world.allCreatures = this.creatures;
}


SoccerGame.prototype.draw = function() {
  this.world.draw();

  this.creatures.forEach(function(c) {
    c.draw();
  });

  textSize(16);
  noStroke();
  fill('white');
  text("Num players: " + this.creatures.length, 5, 15);
}

var game;
function setup() {
  createCanvas(windowWidth, windowHeight);
  game = new SoccerGame(windowWidth, windowHeight);
}

function draw() {
  background(0);

  game.update();

  game.draw();
}

angular.module('predator', [
  'config',
  'ngRoute'
]);
