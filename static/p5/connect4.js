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

class AIConnect4 {

  getX(grid) {
    if (!grid[0][3].piece) {
      return 3;
    }
    for (var i = 1; i < 3; i++) {
      if (!grid[0][3 - i].piece) {
        return 3 - i;
      }
      if (!grid[0][3 + i].piece) {
        return 3 + i;
      }
    }
    return null;
  }
}

class Connect4 {
  constructor(pos, vel) {
    this.width = 7;
    this.height = 6;
    this.player1 = {color: color('red')};
    this.player2 = {color: color('yellow')};
    this.ai = new AIConnect4();
    this.reset();
  }

  reset() {
    this.grid = [];
    this.winner = null;
    this.turn = this.player1;
    this.possibleY = null;
    for (let y = 0; y < this.height; y++) {
      let row = [];
      for (let x = 0; x < this.width; x++) {
        row.push(new Square());
      }
      this.grid.push(row);
    }
  }

  checkWin() {
    var last = null;
    var same = 0;
    var cur;

    // Need to check horizontals, verticals and 2 diagonals.
    for (let y = 0; y < this.height; y++) {
      // Reset last for each row.
      last = null;
      for (let x = 0; x < this.width; x++) {
        cur = this.grid[y][x].piece;
        if (cur && cur === last) {
          same++;
          if (same === 4) {
            // Found 4 in a row of cur.
            console.log("Win on row", y, "between", x - 3, x);
            return cur;
          }
        } else {
          same = 1;
        }
        last = cur;
      }
    }

    // check for vertical wins.
    for (let x = 0; x < this.width; x++) {
      // Reset last for each col.
      last = null;
      for (let y = 0; y < this.height; y++) {
        cur = this.grid[y][x].piece;
        if (cur && cur === last) {
          same++;
          if (same === 4) {
            // Found 4 in a row of cur.
            console.log("Win on col", x, "between", y - 3, y);
            return cur;
          }
        } else {
          same = 1;
        }
        last = cur;
      }
    }

    // check for diagonal \ wins.
    // "i" represents the diagonal index counting (from 1) up the left side then along the top.
    // Skip the first and last 3 which don't have 4 tiles in them.
    for (let i = 4; i < this.height + this.width - 3; i++) {
      // Reset last for each diagonal.
      last = null;
      var x = Math.max(0, i - this.height);
      var y = Math.max(0, this.height - i);
      for (; x < this.width && y < this.height; x++, y++) {
        cur = this.grid[y][x].piece;
        if (cur && cur === last) {
          same++;
          if (same === 4) {
            // Found 4 in a row of cur.
            console.log("Win on \\ diagonal", i, "between", x - 3, y - 3, "and", x, y);
            return cur;
          }
        } else {
          same = 1;
        }
        last = cur;
      }
    }


    // check for diagonal / wins.
    // "i" represents the diagonal index counting (from 0) across the top and down the right.
    // Skip the first and last 3 which don't have 4 tiles in them.
    for (let i = 3; i < this.height + this.width - 4; i++) {
      // Reset last for each diagonal.
      last = null;
      var x = Math.min(this.width - 1, i);
      var y = Math.max(0, i - this.width + 1);
      for (; x >= 0 && y < this.height; x--, y++) {
        cur = this.grid[y][x].piece;
        if (cur && cur === last) {
          same++;
          if (same === 4) {
            // Found 4 in a row of cur.
            console.log("Win on / diagonal", i, "between", x + 3, y - 3, "and", x, y);
            return cur;
          }
        } else {
          same = 1;
        }
        last = cur;
      }
    }
  }

  turnMade() {
    if (this.checkWin()) {
      this.winner = this.turn;
    }
    // Switch the player to the opponent.
    this.turn = (this.turn === this.player1) ? this.player2 : this.player1;

    // Calling hover will update the placement guide.
    this.hover(mouseX, mouseY);
  }

  update() {
    if (this.winner) {
      return;
    }

    // Take the AI turn.
    if (this.turn === this.player2) {
      var x = this.ai.getX(this.grid);
      var y = this.getYFallHeightFor(x);
      if (y != null) {
        this.grid[y][x].piece = this.turn;
        this.turnMade();
      }
    }
  }

  show() {
    this.update();

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

    if (this.winner) {
      fill("#FFFFFF");
      if (this.winner === this.player1) {
        text("You Win!", this.width * 50 / 2, this.height * 50 / 2);
      } else {
        text("Better luck next time", this.width * 50 / 2, this.height * 50 / 2);
      }
      return;
    }

    if (this.possibleY != null) {
      var c = color(this.turn.color.levels);
      c.setAlpha(128);
      fill(c);
      circle(75 + 50 * this.possibleX, 75 + 50 * this.possibleY, 40);
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
    if (this.winner) {
      this.reset();
      return;
    }
    let x = floor((mouseX - 50) / 50);

    if (x >= 0 && x < this.width) {
      var y = this.getYFallHeightFor(x);
      if (y != null) {
        this.grid[y][x].piece = this.turn;
        this.turnMade();
      }
    }
  }
}

let board;
export function setup() {
  createCanvas(800, 600);
  board = new Connect4();
}

export function draw() {
  background(color(80, 80, 80));

  board.show();
}

export function mouseClicked() {
  board.click(mouseX, mouseY);
}

export function mouseMoved() {
  board.hover(mouseX, mouseY);
}
