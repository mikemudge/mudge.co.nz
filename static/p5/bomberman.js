class Player {
  constructor(map, x, y) {
    this.map = map;
    this.pos = createVector(x, y);
    this.color = color(255);
    this.bombs = [];
    this.flameRange = 1;
  }

  setVel(vel) {
    this.vel = vel;
    this.pos.add(this.vel);
    let t = this.map.getTileAtPos(this.pos).getData();
    if (!t || t.solid) {
      this.pos.sub(this.vel);
    }
  }

  action() {
    let bomb = new Bomb(this);
    this.bombs.push(bomb);
    this.map.getTileAtPos(this.pos).getData().addBomb(bomb);
  }

  update() {
    for (let bomb of this.bombs) {
      bomb.update();
    }
    // Remove old bombs?
  }

  show(size) {
    fill(this.color);

    ellipse(0, 0, size * 2);
  }
}

class Square {
  constructor() {
  }

  addBomb(bomb) {
    this.bomb = bomb;
  }

  setFlame(flameTime) {
    this.flameTime = flameTime;
  }

  show(size) {
    if (this.solid) {
      if (this.destructable) {
        fill("#a52a2a");
      } else {
        fill("#fff");
      }
      rect(-size, -size, size * 2, size * 2);
    }

    if (this.bomb) {
      if (this.bomb.time < 0) {
        this.bomb = null;
      } else {
        this.bomb.show(size);
      }
    }
    if (this.flameTime > 0) {
      this.flameTime--;
      // flametime goes from 15 -> 1
      // scale goes from 0.25 to 1.
      let scale = 1 - this.flameTime / 20;
      this.showFlame(size * scale);
    }
  }

  showFlame(size) {
    fill('yellow');
    ellipse(0, 0, size * 2);
    fill('orange');
    ellipse(0, 0, size * 1.8);
    fill('red');
    ellipse(0, 0, size * 1.4);
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
    if (this.time === 0) {
      // explode to flames.
      let map = this.player.map;
      this.player.map.getTileAtPos(this.pos).getData().solid = false;
      this.propegateFlames(map, this.player.flameRange);
    }
  }

  burnFlame(tile, flameTime) {
    let square = tile.getData();
    if (!square) {
      // Edge of map.
      return false;
    }
    if (square.solid) {
      if (square.destructable) {
        square.setFlame(flameTime);
        square.solid = false;
      }
      // Can't continue after first solid block
      return false;
    }
    square.setFlame(flameTime);
    return true;
  }

  propegateFlames(map, range) {
    let flameTime = this.framerate / 2;
    let tile = map.getTileAtPos(this.pos);
    tile.getData().setFlame(flameTime);

    // Propagate flames in each direction.
    let t = tile.north();
    for (let i = 1; i <= range && this.burnFlame(t, flameTime); i++) {
      t = t.north();
    }
    t = tile.east();
    for (let i = 1; i <= range && this.burnFlame(t, flameTime); i++) {
      t = t.east();
    }
    t = tile.south();
    for (let i = 1; i <= range && this.burnFlame(t, flameTime); i++) {
      t = t.south();
    }
    t = tile.west();
    for (let i = 1; i <= range && this.burnFlame(t, flameTime); i++) {
      t = t.west();
    }
  }

  show(size) {
    fill('#00f');
    ellipse(0, 0, size * 1.6);

    noStroke()
    fill('white');
    text(ceil(this.time / this.framerate), -3, 3);
  }
}

class Game {
  constructor(view) {
    this.width = 10;
    this.height = 10;
    this.size = 20;
    this.bombs = 0;
    this.map = new Grid(this.width, this.height);
    this.setupNewGame();

    this.view = view;
    this.humanPlayer = new Player(this.map, 1, 1);
    this.humanPlayer.color = color('red')
    this.players = [this.humanPlayer];

    // Add keys for player?
  }

  setupNewGame() {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        let square = new Square();
        if (x === 0 || y === 0 || y === this.height - 1 || x === this.width - 1 || (x % 2 === 0 && y % 2 === 0)) {
          // Indestructible rock.
          square.solid = true;
          square.destructable = false;
        } else if (x + y < 4 || this.height - y + this.width - x < 6) {
          // Leave a gap in the corners.
        } else if (this.width - x + y < 5 || this.height - y + x < 5) {
          // Leave a gap in the corners.
        } else {
          square.solid = true;
          square.destructable = true;
          // Add some power ups with 10% chance.
          if (Math.random() < .1) {
            if (Math.random() < .5) {
              square.powerup = 'explodeSize';
            } else {
              square.powerup = 'numBombs';
            }
          }
        }

        this.map.setTileData(x, y, square);
      }
    }
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
    this.view.draw(this.map);

    for (let player of this.players) {
      push();
      let x = this.view.toScreenX(player.pos.x);
      let y = this.view.toScreenY(player.pos.y);
      translate(x, y);
      noStroke();
      player.show(this.size * .8);
      pop();
    }
  }
}

function setup() {
  createCanvas(400, 400);
  // Must match bomb settings for countdown.
  frameRate(30);

  view = new MapView(20, 400, 400);
  game = new Game(view);
}

function keyPressed() {
  game.keys(keyCode);
}

function draw() {
  background(0);

  game.update();

  game.draw();
}
