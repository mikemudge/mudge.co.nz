class Square {
  constructor() {
    this.piece = null;
  }

  show(size) {
    if (this.piece) {
      this.piece.show(size);
    }
  }
}
class Connect4 {
  constructor(pos, vel) {
    this.width = 7;
    this.height = 6;
    this.player1 = {color: color('red')};
    this.player2 = {color: color('yellow')};
    this.turn = this.player1;
    this.possibleY = null;
    this.grid = [];
    for (let y = 0; y < this.height; y++) {
      let row = [];
      for (let x = 0; x < this.width; x++) {
        row.push(new Square());
      }
      this.grid.push(row);
    }
  }

  show() {
    noStroke();
    fill('#0000ff')
    rect(50, 50, 50 * this.width, 50 * this.height);
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.grid[y][x].piece) {
          fill(this.grid[y][x].piece.color);
        } else {
          fill('#000000');
        }
        circle(75 + 50 * x, 75 + 50 * y, 40);
      }
    }

    if (this.possibleY != null) {
      var c = color(this.turn.color.levels);
      c.setAlpha(128);
      fill(c);
      circle(75 + 50 * this.possibleX, 75 + 50 * this.possibleY, 40);
      console.log(this.turn.color, this.possibleX, this.possibleY);
    }
  }

  getYFallHeightFor(x) {
    // drop in column x?
    for (var y = this.height - 1; y >= 0; y--) {
      if (!this.grid[y][x].piece) {
        return y;
      }
    }
    // This column is full.
    return null;
  }

  hover(mouseX, mouseY) {
    let x = floor((mouseX - 50) / 50);
    if (x >= 0 && x < this.width) {
      this.possibleX = x;
      this.possibleY = this.getYFallHeightFor(x);
    }
  }

  click(mouseX, mouseY) {
    let x = floor((mouseX - 50) / 50);

    if (x >= 0 && x < this.width) {
      var y = this.getYFallHeightFor(x);
      if (y != null) {
        this.grid[y][x].piece = this.turn;
        this.turn = (this.turn === this.player1) ? this.player2 : this.player1;
        this.hover(mouseX, mouseY);
      }
    }
  }
}

function setup() {
  createCanvas(800, 600);
  board = new Connect4();
}

function draw() {
  background(color(80, 80, 80));

  board.show();
}

function mouseClicked() {
  board.click(mouseX, mouseY);
}

function mouseMoved() {
  board.hover(mouseX, mouseY);
}
