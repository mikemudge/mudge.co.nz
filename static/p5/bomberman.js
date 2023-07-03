class Player {
  constructor(map, x, y) {
    this.map = map;
    this.pos = createVector(x, y);
    this.template = new Circle();
    this.color = color(255);
    this.bombs = [];
    this.flameRange = 1;
  }

  setVel(vel) {
    this.vel = vel;
    this.pos.add(this.vel);
    let t = this.map.getTile(this.pos);
    if (t.solid) {
      this.pos.sub(this.vel);
    }
  }

  action() {
    let bomb = new Bomb(this);
    this.bombs.push(bomb);
    this.map.getTile(this.pos).template = bomb;
  }

  update() {
    for (let bomb of this.bombs) {
      bomb.update();
    }
    // Remove old bombs?
  }

  show(size) {
    this.template.show(this.color, size);    
  }
}

class Square {
  show(color, size) {
    fill(color);

    rect(-size, -size, size * 2, size * 2);
  }
}

class Bomb {
  constructor(player) {
    this.player = player;
    this.pos = this.player.pos.copy();
    this.framerate = 30;
    this.time = 3 * this.framerate;
  }

  update() {
    this.time--;
    if (this.time == 0) {
      // explode to flames.
      let map = this.player.map;
      this.player.map.getTile(this.pos).template = new Square();
      this.propegateFlames(map, this.player.flameRange);
    }
  }
  
  propegateFlames(map, range) {
    let flame = new Flame(this.pos);
    map.getTile(this.pos).flameTime = this.framerate / 2;
    for (let i = 1; i <= range; i++) {
      var offset = createVector(i, 0);
      var t = map.getTile(p5.Vector.add(this.pos, offset));
      if (t && !t.solid || t.destructable) {
        t.flameTime = this.framerate / 2;
        t.color = color(0);
        t.solid = false;
      }
      offset = createVector(-i, 0);
      t = map.getTile(p5.Vector.add(this.pos, offset));
      if (t && !t.solid || t.destructable) {
        t.flameTime = this.framerate / 2;
        t.color = color(0);
        t.solid = false;
      }
      offset = createVector(0, i);
      t = map.getTile(p5.Vector.add(this.pos, offset));
      if (t && !t.solid || t.destructable) {
        t.flameTime = this.framerate / 2;
        t.color = color(0);
        t.solid = false;
      }
      offset = createVector(0, -i);
      t = map.getTile(p5.Vector.add(this.pos, offset));
      if (t && !t.solid || t.destructable) {
        t.flameTime = this.framerate / 2;
        t.color = color(0);
        t.solid = false;
      }
    }
  }

  show(color, size) {
    fill('blue');

    ellipse(0, 0, size * 1.6);

    // TODO frame rate?
    stroke('white');
    fill('white');
    text(ceil(this.time / this.framerate), -3, 3);
  }
}

class Flame {
  show(color, size) {
    fill('yellow');
    ellipse(0, 0, size * 2);
    fill('orange');
    ellipse(0, 0, size * 1.8);
    fill('red');
    ellipse(0, 0, size * 1.4);
  }
}

class Circle {
  show(color, size) {
    fill(color);

    ellipse(0, 0, size * 2);
  }
}

class Triangle {
  show(color, size) {
    fill(color);

    triangle(-size, size, -size, -size, size * 2, 0);
  }
}

class Tile {
  constructor(map, x, y) {
    this.map = map;
    this.pos = createVector(x, y);
    this.properties = {};
    this.template = new Square();
    this.color = color(0);
  }

  show(size) {
    this.template.show(this.color, size);
    if (this.flameTime > 0) {
      this.flameTime--;
      // flametime goes from 15 -> 1
      // scale goes from 0.25 to 1.
      let scale = 1 - this.flameTime / 20;
      new Flame().show(this.color, size * scale);
    }
  }

}
class GridMap {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.tiles = [];
    for (let y = 0; y < this.height; y++) {
      this.tiles.push([]);
      for (let x = 0; x < this.width; x++) {
        let tile = new Tile(this, x, y);
        this.tiles[y].push(tile);
      }
    }
  }

  getTile(pos) {
    let y = pos.y;
    let x = pos.x;
    if (y < 0 || y >= this.tiles.length) {
      throw y + " y out of bounds"
    }
    if (x < 0 || x >= this.tiles[y].length) {
      throw x + " x out of bounds"
    }
    return this.tiles[y][x];
  }

  // TODO support rendering a view of this.
  // TODO support loading objects near a point.
  // TODO support loading particular objects (layers)
}

class MapView {
  constructor(size) {
    this.size = size;
    this.left = 0;
    this.top = 0;
  }

  toScreenX(x) {
    return 30 + x * this.size * 2;
  }

  toScreenY(y) {
    return 30 + y * this.size * 2;
  }

  draw(map, players) {
    // TODO align center?
    let width = 340 / this.size / 2;
    let height = 340 / this.size / 2;
    width = min(width, map.width - this.left);
    height = min(height, map.height - this.top);
    for (let y = this.top; y < this.top + height; y++) {
      for (let x = this.left; x < this.left + width; x++) {
        let tile = map.getTile(createVector(x, y));
        push();
        translate(this.toScreenX(x - this.left), this.toScreenY(y - this.top));
        noStroke();
        tile.show(this.size);    
        pop();
      }
    }


    for (let player of players) {
      push();
      translate(this.toScreenX(player.pos.x - this.left), this.toScreenY(player.pos.y - this.top));
      noStroke();
      player.show(this.size * .8);    
      pop();
    }
  }
}

class BombermanGame {
  constructor() {
    this.map = new GridMap(50, 50);
    this.view = new MapView(20);

    for (let y = 0; y < this.map.height; y++) {
      for (let x = 0; x < this.map.width; x++) {
        let tile = this.map.getTile(createVector(x, y));
        if (x == 0 || y == 0 || y == this.height - 1 || x == this.width - 1 || (x % 2 == 0 && y % 2 == 0)) {
          tile.color = 'white';
          // Can't walk through this.
          tile.solid = true;
          // And can't destroy it either.
          tile.destructable = false;
        } else if (x + y < 4) {
          // Leave a gap in the start corner.
        } else if (this.width - x + y < 5) {
          // Leave a gap in the start corner.
        } else if (this.height - y + x < 5) {
          // Leave a gap in the start corner.
        } else if (this.height - y + this.width - x < 6) {
          // Leave a gap in the start corner.
        } else {
          tile.color = 'brown';
          tile.solid = true;
          tile.destructable = true;
          if (Math.random() < .1) {
            if (Math.random() < .5) {
              tile.powerup = 'explodeSize';
            } else {
              tile.powerup = 'numBombs';
            }
          }
        }
      }
    }

    this.humanPlayer = new Player(this.map, 1, 1);
    this.humanPlayer.color = color('red')
    this.players = [this.humanPlayer];

    // Add keys for player?
  }

  keys() {
    let vel = createVector(0, 0);
    if (keyCode === LEFT_ARROW) {
      vel.x--;
    } else if (keyCode === RIGHT_ARROW) {
      vel.x++;
    } else if (keyCode === UP_ARROW) {
      vel.y--;
    } else if (keyCode === DOWN_ARROW) {
      vel.y++;
    } else if (keyCode === 32 /* SPACE */) {
      this.humanPlayer.action();
    }
    this.humanPlayer.setVel(vel);
  }

  update() {
    for (let player of this.players) {
      player.update();
    }

  }

  draw() {
    this.view.draw(this.map, this.players);
  }

}
function setup() {
  createCanvas(400, 400);
  // Must match bomb settings for countdown.
  frameRate(30);
  game = new BombermanGame();
}

function keyPressed() {
  game.keys(keyCode);
}

function draw() {
  background(0);

  game.update();

  game.draw();
}
