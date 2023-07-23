class Player {
  constructor(map, x, y) {
    this.map = map;
    this.pos = createVector(x, y);
    this.color = color(255);
    this.bombs = [];
    this.flameRange = 1;
    this.numBombs = 1;
  }

  setVel(vel) {
    this.vel = vel;
    this.pos.add(this.vel);
    let t = this.map.getTileAtPos(this.pos).getData();
    if (!t || t.solid) {
      this.pos.sub(this.vel);
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
    this.map.getTileAtPos(this.pos).getData().addBomb(bomb);
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
      rect(-size, -size, size * 2, size * 2);
    } else {
      if (this.powerup) {
        if (this.powerup === 'explodeSize') {
          fill("red");
        } else if (this.powerup === 'numBombs') {
          fill("green");
        }
        circle(0, 0, size * .6);
      }
    }

    if (this.bomb) {
      this.bomb.show(size);
    }
    if (this.flameTime > 0) {
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
      this.player.map.getTileAtPos(this.pos).getData().bomb = null;
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
    // TODO locate where this should be better when zoomed in/out?
    // 12px for 20 size is default, and looks good.
    textSize(size * 0.6);
    text(ceil(this.time / this.framerate), -3, 3);
  }
}

class Game {
  constructor(view) {
    // These should be odd to get the solid block pattern right.
    this.width = 21;
    this.height = 21;
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
    this.humanPlayer.setVel(vel);
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
      push();
      let x = this.view.toScreenX(player.pos.x);
      let y = this.view.toScreenY(player.pos.y);
      translate(x, y);
      noStroke();
      player.show(this.view.size * .8);
      pop();
    }
  }
}

function setup() {
  view = new MapView(20);
  w = view.getCanvasWidth();
  h = view.getCanvasHeight();
  createCanvas(w, h);
  console.log("setting canvas size", w, h);
  // Must match bomb settings for countdown.
  frameRate(30);
  console.log("textSize", textSize());

  game = new Game(view);
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
