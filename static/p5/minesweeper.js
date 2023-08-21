
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

  isFlag() {
    return this.flag;
  }

  show(size) {
    stroke(1);
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

class Game {
  constructor() {
    this.width = 10;
    this.height = 10;
    this.size = 20;
    this.bombs = 0;
    this.map = new Grid(this.width, this.height, 20);
    this.setupNewGame();
  }

  setupNewGame() {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        this.map.setTileData(x, y, new Square());
      }
    }

    this.flags = 0;
    this.bombs = 0;
    // place some bombs
    for (let i = 0; i < 10; i++) {
      let square = this.map.getRandomTile().getData();
      if (!square.isBomb()) {
        this.bombs++;
        square.setBomb();
      }
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
    if (square.covered) {
      square.toggleFlag();
      if (square.isFlag()) {
        this.flags++;
      } else {
        this.flags--;
      }
    }
  }
  doubleClick(x, y) {
    let tile = this.clickedTile(x, y);
    let square = tile.getData();
    if (!square) {
      // Click was outside the board
      return;
    }
    if (square.flag) {
      // Don't allow clicking on flags.
      return;
    }
    // Find how many flags are next to this?
    // uncover all neighbours which are not flags if flag count is equal to this tiles count.
    var flags = 0;
    for(let n of tile.getOrdinalTiles()) {
      if (n.getData() && n.getData().flag) {
        flags++;
      }
    }
    if (flags === square.count) {
      // Uncover all non flag neighbours
      for(let n of tile.getOrdinalTiles()) {
        if (n.getData() && !n.getData().flag) {
          this.uncover(n)
        }
      }
    }
  }

  click(x, y) {
    let tile = this.clickedTile(x, y);
    let square = tile.getData();
    if (!square) {
      // Click was outside the board
      return;
    }
    if (square.flag) {
      // Don't allow clicking on flags.
      return;
    }
    this.uncover(tile);
  }

  uncover(tile) {
    let square = tile.getData();
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

    noStroke();
    fill('#fff');
    textSize(16);
    text("Bombs remaining: " + (this.bombs - this.flags), 0, 15);
  }
}

function setup() {
  size = 50 * 2 + 20 * 2 * 10;
  c = createCanvas(size, size);
  c.canvas.oncontextmenu = function() {
    return false;
  }

  frameRate(30);
  game = new Game();
}

function mouseReleased() {
  if (mouseButton === "left") {
    game.click(mouseX, mouseY)
  }
  if (mouseButton === "right") {
    game.flag(mouseX, mouseY)
  }
}

function doubleClicked() {
  game.doubleClick(mouseX, mouseY);
}

function draw() {
  background(0);

  game.update();

  game.draw();
}
