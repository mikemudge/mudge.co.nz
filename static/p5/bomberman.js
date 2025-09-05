
if (window.mudgemi && window.mudgemi.init) {
  app = window.mudgemi.init.app;
  app.loadTags(['gridview']);
}

class Player {
  constructor(map, pos, size) {
    this.map = map;
    this.pos = pos;
    this.size = size;
    this.color = color(255);
    this.bombs = [];
    this.flameRange = 1;
    this.numBombs = 1;
  }

  setVel(vel) {
    this.vel = vel;
    this.pos.add(this.vel);
    let t = this.map.getTileAtPosWithSize(this.pos, this.size).getData();
    if (!t || t.solid) {
      this.pos.sub(this.vel);
      return;
    }
    let powerup = t.collectPowerUp();
    if (powerup === 'explodeSize') {
      this.flameRange++;
    } else if (powerup === 'numBombs') {
      this.numBombs++;
    }
  }

  action() {
    if (this.bombs.length >= this.numBombs) {
      // Can't add any more bombs.
      return;
    }
    let bomb = new Bomb(this);
    this.bombs.push(bomb);
    this.map.getTileAtPosWithSize(this.pos, this.size).getData().addBomb(bomb);
  }

  update() {
    this.map.update();

    for (let bomb of this.bombs) {
      bomb.update();
    }
    // Remove old bombs?
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      if (this.bombs[i].time < 0) {
        this.bombs.splice(i, 1);
      }
    }
  }

  show(size) {
    noStroke();
    fill(this.color);

    ellipse(size * this.size / 2, size * this.size / 2, size * this.size * 0.8);
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

  collectPowerUp() {
    let temp = this.powerup;
    this.powerup = null;
    return temp;
  }

  update() {
    if (this.flameTime > 0) {
      this.flameTime--;
    }
  }

  show(size) {
    if (this.solid) {
      if (this.destructable) {
        fill("#a52a2a");
      } else {
        fill("#fff");
      }
      rect(0, 0, size, size);
    } else {
      if (this.powerup) {
        if (this.powerup === 'explodeSize') {
          fill("red");
        } else if (this.powerup === 'numBombs') {
          fill("green");
        }
        circle(size / 2, size / 2, size * .3);
      }
    }

    if (this.bomb) {
      this.bomb.show(size);
    }
    if (this.flameTime > 0) {
      this.showFlame(size);
    }
  }

  showFlame(size) {
    // flametime goes from 15 -> 1
    // scale goes from 0.25 to 1.
    let scale = 1 - this.flameTime / 20;

    fill('yellow');
    ellipse(size / 2, size / 2, size * scale);
    fill('orange');
    ellipse(size / 2, size / 2, size * 0.9 * scale);
    fill('red');
    ellipse(size / 2, size / 2, size * 0.7 * scale);
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
      let square = map.getTileAtPosWithSize(this.pos, this.player.size).getData();
      square.solid = false;
      square.bomb = null;
      this.propegateFlames(map, this.player.flameRange);
    }
  }

  burnFlame(tile, flameTime) {
    let square = tile.getData();
    if (!square) {
      // Edge of map.
      return false;
    }
    if (square.bomb) {
      square.bomb.time = 1;
      // TODO explode now? Instead of setup to explode on next update() call?
      // Can't continue after hitting a bomb.
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
    let tile = map.getTileAtPosWithSize(this.pos, this.player.size);
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
    ellipse(size / 2, size / 2, size * 0.8);

    noStroke()
    fill('white');
    // TODO locate where this should be better when zoomed in/out?
    // 12px for 20 size is default, and looks good.
    textSize(size * 0.3);
    text(ceil(this.time / this.framerate), size / 2 - 3, size / 2 + 3);
  }
}

class Game {
  constructor(view) {
    // These should be odd to get the solid block pattern right.
    this.width = 21;
    this.height = 21;
    this.bombs = 0;
    this.size = 40;
    this.map = new Grid(this.width, this.height);
    this.setupNewGame();

    this.view = view;
    this.humanPlayer = new Player(this.map, createVector(this.size, this.size), this.size);
    this.humanPlayer.color = color('red')
    this.players = [this.humanPlayer];

    // Add keys for player?
  }

  setupNewGame() {
    let cornerSize = 4;
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        let square = new Square();
        if (x === 0 || y === 0 || y === this.height - 1 || x === this.width - 1 || (x % 2 === 0 && y % 2 === 0)) {
          // Indestructible rock.
          square.solid = true;
          square.destructable = false;
        } else if (x + y < cornerSize || this.height - y + this.width - x < cornerSize + 2) {
          // Leave a gap in the corners.
        } else if (this.width - x + y < cornerSize + 1 || this.height - y + x < cornerSize + 1) {
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
    this.humanPlayer.setVel(vel.mult(this.view.getMapSize()));
  }

  update() {
    this.view.setCenter(this.humanPlayer.pos);

    // TODO need to disconnect tile updates from display?

    for (let player of this.players) {
      player.update();
    }
  }

  draw() {
    this.view.draw(this.map);

    for (let player of this.players) {
      view.show(player);
    }

    this.view.coverEdges();
  }
}

function setup() {
  view = new MapView(40);
  view.createCanvas();
  // Must match bomb settings for countdown.
  frameRate(30);
  game = new Game(view);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight - 18);

  // TODO set screen should compensate for offsets?
  view.setScreen(windowWidth, windowHeight - 18);
}

function keyPressed() {
  game.keys(keyCode);
}

// function mouseWheel(event) {
//   view.scale(event.delta);
// }

function draw() {
  background(0);

  game.update();

  game.draw();
}
