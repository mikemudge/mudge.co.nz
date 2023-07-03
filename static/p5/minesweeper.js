
class Square {
  constructor(color) {
    this.color = color;
  }
  show(size) {
    fill(this.color);

    rect(-size, -size, size * 2, size * 2);
  }
}

class Bomb {
  show(size) {
    fill('blue');

    ellipse(0, 0, size * 1.6);
  }
}

class Flag {
  show(size) {
    fill('red');
    strokeWeight(2);
    line(size / 2, size / 4, size / 2, size * 3 / 4);
    triangle(size / 2, size / 2,
      size / 2, size / 4,
      size * 3 / 4, size * 3 / 8);
  }
}

class Tile {
  constructor(map, x, y) {
    this.map = map;
    this.pos = createVector(x, y);
    this.properties = {};
    this.template = new Square("grey");
    this.bomb = false;
    this.count = 0;
    this.uncovered = false;
  }

  isBomb() {
    return this.bomb;
  }

  show(size) {
    this.template.show(size);
    if (this.uncovered) {
      if (this.bomb) {
        // If this is a bomb don't show a count.

      } else if (this.count) {
        stroke('black');
        fill('black');
        textSize(size);
        text(this.count, -size / 3, size * 2 / 5);
      }
    }
  }

}
class GridMap {
  constructor(width, height) {
    this.covered = new Square("#ccc");
    this.uncovered = new Square("#999");
    this.flag = new Flag();
    this.bomb = new Bomb();
    this.width = width;
    this.height = height;
    this.tiles = [];
    this.reset();
  }
  reset() {
    for (let y = 0; y < this.height; y++) {
      this.tiles.push([]);
      for (let x = 0; x < this.width; x++) {
        let tile = new Tile(this, x, y);
        tile.template = this.covered;
        tile.uncovered = false;
        this.tiles[y].push(tile);
      }
    }

    // place some bombs
    for (let i = 0; i < 10; i++) {
      let t = this.getTile(createVector(floor(random(0, this.width)), floor(random(0, this.height))));
      t.bomb = true;
    }

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        let count = 0;
        let locs = this.getAdjacent(x, y);
        for (let loc of locs) {
          if (this.inBounds(loc) && this.getTile(loc).isBomb()) {
            count++;
          }
        }
        let t = this.getTile(createVector(x, y));
        t.count = count;
      }
    }
  }

  getAdjacent(x, y) {
    return [
      createVector(x - 1, y - 1),
      createVector(x - 1, y),
      createVector(x - 1, y + 1),
      createVector(x, y - 1),
      createVector(x, y + 1),
      createVector(x + 1, y - 1),
      createVector(x + 1, y),
      createVector(x + 1, y + 1),
    ]
  }

  checkMine(pos) {
    let t = this.getTile(pos);
    t.uncovered = true;
    if (t.isBomb()) {
      this.gameOver = true;
      t.template = bomb;
    } else {
      t.template = this.uncovered;
    }
  }

  inBounds(pos) {
    let y = pos.y;
    let x = pos.x;
    if (y < 0 || y >= this.tiles.length) {
      return false;
    }
    return !(x < 0 || x >= this.tiles[y].length);
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
    this.map = new GridMap(10, 10);
    this.view = new MapView(10);
  }

  update() {

  }

  click(x, y) {
    let pos = createVector(this.view.toGameX(x), this.view.toGameY(y));

    this.map.checkMine(pos);
  }

  draw() {
    this.view.draw(this.map);
  }

}
function setup() {
  createCanvas(400, 400);
  // Must match bomb settings for countdown.
  frameRate(30);
  game = new BombermanGame();
}

function mouseClicked() {
  game.click(mouseX, mouseY);
}

function draw() {
  background(0);

  game.update();

  game.draw();
}
