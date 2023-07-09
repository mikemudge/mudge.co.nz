
class Square {
  constructor() {
    this.bomb = false;
    this.flag = false;
    this.count = 0;
    this.covered = true;
  }

  isBomb() {
    return this.bomb;
  }

  setBomb() {
    this.bomb = true;
  }

  setCount(count) {
    this.count = count;
  }

  getCount() {
    return this.count;
  }

  uncover() {
    this.covered = false;
  }

  toggleFlag() {
    this.flag = !this.flag;
  }

  show(size) {
    if (this.covered) {
      // Covered square.
      fill("#ccc");
      rect(-size, -size, size * 2, size * 2);
      if (this.flag) {
        fill('#f00');
        strokeWeight(2);
        line(- size / 4, - size / 2, - size / 4, size / 2);
        triangle(- size / 4, 0, - size / 4, - size / 2, size / 4, - size / 4);
      }
    } else {
      // Uncovered square.
      fill("#999");
      rect(-size, -size, size * 2, size * 2);
      if (this.bomb) {
        // If this is a bomb don't show a count.
        fill('#00f');
        ellipse(0, 0, size * 1.6);
      } else if (this.count) {
        stroke('#000');
        fill('#000');
        textSize(size);
        text(this.count, -size / 3, size * 2 / 5);
      }
    }
  }
}

// TODO support rendering a view of this.
// TODO support loading objects near a point.
// TODO support loading particular objects (layers)

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

  toGameX(x) {
    return Math.round((x - 30) / (2 * this.size));
  }

  toGameY(y) {
    return Math.round((y - 30) / (2 * this.size));
  }

  draw(map) {
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
  }
}

class BombermanGame {
  constructor() {
    this.width = 10;
    this.height = 10;
    this.size = 20;
    this.map = new Grid(this.width, this.height);
    this.setupNewGame();
  }

  setupNewGame() {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        this.map.setTileData(x, y, new Square());
      }
    }

    // place some bombs
    for (let i = 0; i < 10; i++) {
      this.map.getRandomTile().getData().setBomb();
    }

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        let count = 0;
        let tiles = this.map.getOrdinalTiles(x, y);
        for (let tile of tiles) {
          let square = tile.getData();
          if (square && square.isBomb()) {
            count++;
          }
        }
        let square = this.map.getTile(x, y).getData();
        square.setCount(count);
      }
    }
  }

  update() {

  }

  clickedTile(x, y) {
    let gx = Math.round((x - 50 - this.size) / this.size / 2);
    let gy = Math.round((y - 50 - this.size) / this.size / 2);

    return this.map.getTile(gx, gy);
  }

  flag(x, y) {
    let tile = this.clickedTile(x, y);
    let square = tile.getData();
    if (!square) {
      // Click was outside the board
      return;
    }
    square.toggleFlag();
  }

  click(x, y) {
    let tile = this.clickedTile(x, y);
    let square = tile.getData();
    if (!square) {
      // Click was outside the board
      return;
    }
    let tiles = [tile];
    while(tiles.length > 0) {
      let next = [];
      for (let t of tiles) {
        let s = t.getData();
        if (!s) {
          continue;
        }
        if (!s.covered) {
          // Already uncovered.
          continue;
        }
        s.uncover();
        if (s.getCount() > 0) {
          // Don't propagate this tile further.
          continue;
        }
        // Consider all the neighbours for propagating.
        let neighbours = t.getOrdinalTiles();
        next.push(...neighbours);
      }
      tiles = next;
    }

    if (square.isBomb()) {
      // TODO handle this case?
      this.gameOver = true;
    }
  }

  draw() {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        let square = this.map.getTile(x, y).getData();
        push();
        translate(50 + this.size + x * this.size * 2, 50 + this.size + y * this.size * 2);
        square.show(this.size);
        pop();
      }
    }
  }
}

function setup() {
  size = 50 * 2 + 20 * 2 * 10;
  createCanvas(size, size);
  // Must match bomb settings for countdown.
  frameRate(30);
  game = new BombermanGame();
}

document.oncontextmenu = function() {
  return false;
}

function mouseReleased() {
  if (mouseButton === "left") {
    game.click(mouseX, mouseY)
  }
  if (mouseButton === "right") {
    game.flag(mouseX, mouseY)
  }
}

function draw() {
  background(0);

  game.update();

  game.draw();
}
