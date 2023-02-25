class Square {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.piece = null;
  }

  set(piece) {
    // TODO handle piece already here?
    this.piece = piece;
  }

  get() {
    return this.piece;
  }

  show(size) {
    if (this.piece) {
      this.piece.show(size);
    }
  }
}
class Board {
  constructor(pos, vel) {
    this.grid = [];
    for (let y = 0; y < 8; y++) {
      let row = [];
      for (let x = 0; x < 8; x++) {
        row.push(new Square(x, y));
      }
      this.grid.push(row);
    }
    this.turn = 0;

    this.x = 50;
    this.y = 50;
    this.size = 20;
  }

  show() {
    noStroke();
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        fill((x + y) % 2 === 0 ? color(64, 64, 64) : color(245, 245, 245));
        rect(this.x + x * this.size * 2, this.y + y * this.size * 2, this.size * 2);
        this.grid[y][x].show(this.size);
      }
    }

    if (this.selectedUnit) {
      stroke(color(20, 250, 20));
      strokeWeight(2);
      noFill();
      let x = this.x + this.selectedUnit.x * this.size * 2 + this.size;
      let y = this.y + this.selectedUnit.y * this.size * 2 + this.size;
      circle(x, y, this.size * 1.5);
    }
  }

  click(mouseX, mouseY) {
    let x = floor((mouseX - this.x) / this.size / 2);
    let y = floor((mouseY - this.y) / this.size / 2);
    if (x >= 0 && x < 8 && y >= 0 && y < 8) {
      if (this.selectedUnit) {
        // move unit here?
        if (this.grid[y][x].get()) {
          console.log("Already a unit at", x, y);
        } else {
          // Remove the unit from its old spot.
          this.grid[this.selectedUnit.y][this.selectedUnit.x].set(null);
          this.selectedUnit.y = y;
          this.selectedUnit.x = x;
          // Add it to the new spot.
          this.grid[y][x].set(this.selectedUnit);
          this.selectedUnit = null;
        }
      } else {
        this.selectedUnit = this.grid[y][x].get();
      }
    }
  }

  initStart() {
    this.turn = 0;
    for (let x = 0; x < 8; x++) {
      this.grid[1][x].set(new Unit(this, x, 1, color(10, 10, 10), "P"))
      this.grid[6][x].set(new Unit(this, x, 6, color(240, 240, 240), "P"))
    }

    this.addUnit(new Unit(this, 0, 0, color(10, 10, 10), "R"))
    this.addUnit(new Unit(this, 1, 0, color(10, 10, 10), "H"))
    this.addUnit(new Unit(this, 2, 0, color(10, 10, 10), "B"))
    this.addUnit(new Unit(this, 3, 0, color(10, 10, 10), "K"))
    this.addUnit(new Unit(this, 4, 0, color(10, 10, 10), "Q"))
    this.addUnit(new Unit(this, 5, 0, color(10, 10, 10), "B"))
    this.addUnit(new Unit(this, 6, 0, color(10, 10, 10), "H"))
    this.addUnit(new Unit(this, 7, 0, color(10, 10, 10), "R"))

    this.addUnit(new Unit(this, 0, 7, color(240, 240, 240), "R"))
    this.addUnit(new Unit(this, 1, 7, color(240, 240, 240), "H"))
    this.addUnit(new Unit(this, 2, 7, color(240, 240, 240), "B"))
    this.addUnit(new Unit(this, 3, 7, color(240, 240, 240), "K"))
    this.addUnit(new Unit(this, 4, 7, color(240, 240, 240), "Q"))
    this.addUnit(new Unit(this, 5, 7, color(240, 240, 240), "B"))
    this.addUnit(new Unit(this, 6, 7, color(240, 240, 240), "H"))
    this.addUnit(new Unit(this, 7, 7, color(240, 240, 240), "R"))

  }

  addUnit(unit) {
    this.grid[unit.y][unit.x].set(unit);
  }
}

class Unit {
  constructor(board, x, y, col, unit) {
    this.board = board;
    this.x = x;
    this.y = y;
    this.color = col;
    this.unit = unit;
  }

  show(size) {
    let x = this.board.x + this.x * size * 2 + size;
    let y = this.board.y + this.y * size * 2 + size;
    stroke(color(128,128,128));
    strokeWeight(2);
    fill(this.color);
    circle(x, y, size);
    fill(color(128,128,128));
    noStroke();
    text(this.unit, x - 4 - (this.unit === "Q" ? 1 : 0), y + 4);
  }
}

function setup() {
  createCanvas(800, 600);
  paused = false;
  board = new Board();
  board.initStart();
}

function draw() {
  background(color(192, 192, 192));

  board.show();
}

function mouseClicked() {
  board.click(mouseX, mouseY);
}
