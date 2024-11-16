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

    this.cardinals = [
      {x: 0, y: 1},
      {x: 1, y: 0},
      {x: 0, y: -1},
      {x: -1, y: 0},
    ];
    this.diagonals = [
      {x: 1, y: 1},
      {x: 1, y: -1},
      {x: -1, y: -1},
      {x: -1, y: 1},
    ];
    this.dirs = this.cardinals.concat(this.diagonals);
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
      this.showSelectedUnit(this.selectedUnit);
    }

    if (this.lastLocation) {
      stroke(color(220, 50, 20));
      strokeWeight(2);
      noFill();
      let x = this.x + this.lastLocation.x * this.size * 2;
      let y = this.y + this.lastLocation.y * this.size * 2;
      rect(x, y, this.size * 2);
    }

    if (this.lastPiece) {
      stroke(color(220, 50, 20));
      strokeWeight(2);
      noFill();
      let x = this.x + this.lastPiece.x * this.size * 2 + this.size;
      let y = this.y + this.lastPiece.y * this.size * 2 + this.size;
      circle(x, y, this.size * 1.5);
    }
  }

  update() {
    if (this.turn === 1) {
      // AI turn.
      var allMoves = [];
      this.blackPlayer.forEach(function(unit) {
        this.possibleMoves(unit).forEach(function(move) {
          allMoves.push([unit, move]);
        });
      }.bind(this));

      var choose = random(allMoves);
      if (!choose) {
        alert("Can't play any move, you win");
        this.turn = 0;
        return;
      }
      var unit = choose[0];
      var move = choose[1];

      this.makeMove(unit, move);
      this.turn = 0;
    }
  }

  makeMove(unit, move) {
    this.lastLocation = {x: unit.x, y: unit.y};
    this.lastPiece = unit;
    var capture = this.grid[move.y][move.x].get();
    if (capture) {
      console.log("captured ", capture.type, "at", move.x, move.y);

      // Remove the piece from the players list.
      const index = this.players[capture.color].indexOf(capture);
      this.players[capture.color].splice(index, 1);
    }
    // Remove the unit from its old spot.
    this.grid[unit.y][unit.x].set(null);
    unit.y = move.y;
    unit.x = move.x;
    // Add it to the new spot.
    this.grid[move.y][move.x].set(unit);
  }
  click(mouseX, mouseY) {
    if (mouseButton !== LEFT) {
      this.selectedUnit = null;
      return;
    }
    let x = floor((mouseX - this.x) / this.size / 2);
    let y = floor((mouseY - this.y) / this.size / 2);
    if (x >= 0 && x < 8 && y >= 0 && y < 8) {
      let unit = this.grid[y][x].get();
      if (unit) {
        // If no unit is selected, or we are selecting a unit of the same color
        if (!this.selectedUnit || unit.color === this.selectedUnit.color) {
          // Make the new unit selected
          this.selectedUnit = unit;
          return;
        }
      }
      if (this.selectedUnit) {
        let moves = this.possibleMoves(this.selectedUnit);
        let allowed = moves.filter(function(m) {return m.x === x && m.y === y});

        if (allowed.length === 0) {
          console.log("moving", this.selectedUnit.type, "to", x, y, "is not an allowed move");
          // Deselect unit.
          this.selectedUnit = null;
          return;
        }
        this.makeMove(this.selectedUnit, allowed[0]);
        this.selectedUnit = null;
        this.turn = 1;
      }
    }
  }

  initStart() {
    this.turn = 0;

    this.whitePlayer = [];
    this.blackPlayer = [];
    this.players = {
      "W": this.whitePlayer,
      "B": this.blackPlayer
    }
    for (let x = 0; x < 8; x++) {
      this.addUnit(new Unit(this, x, 1, "B", "Pawn"));
      this.addUnit(new Unit(this, x, 6, "W", "Pawn"));
    }

    this.addUnit(new Unit(this, 0, 0, "B", "Rook"))
    this.addUnit(new Unit(this, 1, 0, "B", "Horse"))
    this.addUnit(new Unit(this, 2, 0, "B", "Bishop"))
    this.addUnit(new Unit(this, 3, 0, "B", "King"))
    this.addUnit(new Unit(this, 4, 0, "B", "Queen"))
    this.addUnit(new Unit(this, 5, 0, "B", "Bishop"))
    this.addUnit(new Unit(this, 6, 0, "B", "Horse"))
    this.addUnit(new Unit(this, 7, 0, "B", "Rook"))

    this.addUnit(new Unit(this, 0, 7, "W", "Rook"))
    this.addUnit(new Unit(this, 1, 7, "W", "Horse"))
    this.addUnit(new Unit(this, 2, 7, "W", "Bishop"))
    this.addUnit(new Unit(this, 3, 7, "W", "King"))
    this.addUnit(new Unit(this, 4, 7, "W", "Queen"))
    this.addUnit(new Unit(this, 5, 7, "W", "Bishop"))
    this.addUnit(new Unit(this, 6, 7, "W", "Horse"))
    this.addUnit(new Unit(this, 7, 7, "W", "Rook"))

  }

  addUnit(unit) {
    this.grid[unit.y][unit.x].set(unit);
    this.players[unit.color].push(unit);
  }

  showSelectedUnit(selectedUnit) {
    stroke(color(20, 250, 20));
    strokeWeight(2);
    noFill();
    let x = this.x + this.selectedUnit.x * this.size * 2 + this.size;
    let y = this.y + this.selectedUnit.y * this.size * 2 + this.size;
    circle(x, y, this.size * 1.5);

    // Now show the possible moves.
    let moves = this.possibleMoves(this.selectedUnit);
    fill(color(20, 250, 20));
    noStroke();
    for (let move of moves) {
      let x = this.x + move.x * this.size * 2 + this.size;
      let y = this.y + move.y * this.size * 2 + this.size;
      circle(x, y, this.size * .5);
    }
  }

  possibleMoves(selectedUnit) {
    switch (selectedUnit.unit) {
      case "P":
        return this.pawnMoves(selectedUnit);
      case "K":
        return this.kingMoves(selectedUnit);
      case "H":
        return this.knightMoves(selectedUnit);
      case "B":
        return this.bishopMoves(selectedUnit);
      case "R":
        return this.rookMoves(selectedUnit);
      case "Q":
        return this.queenMoves(selectedUnit);
      default:
        throw new Error("Not a known unit", selectedUnit);
    }
  }

  knightMoves(unit) {
    let moves = [];
    for (let dir of this.diagonals) {
      // Consider moving 2 on x and 1 on y
      let x = unit.x + dir.x * 2;
      let y = unit.y + dir.y;
      if (this.isValid(x, y, unit)) {
        moves.push({x: x, y: y});
      }
      // Also consider moving 1 on x and 2 on y
      x = unit.x + dir.x;
      y = unit.y + dir.y * 2;
      if (this.isValid(x, y, unit)) {
        moves.push({x: x, y: y});
      }
    }
    return moves;
  }

  pawnMoves(unit) {
    const result = [];
    if (this.isValid(unit.x, unit.y + unit.vy, unit) && !this.isCapture(unit.x, unit.y + unit.vy, unit)) {
      result.push({x: unit.x, y: unit.y + unit.vy});
      // pawn can also move 2 from the first row.
      if (unit.y === unit.sy && !this.isCapture(unit.x, unit.y + 2 * unit.vy, unit)) {
        result.push({x: unit.x, y: unit.sy + 2 * unit.vy})
      }
    }
    // Capture moves.
    if (this.isCapture(unit.x + 1, unit.y + unit.vy, unit)) {
      result.push({x: unit.x + 1, y: unit.y + unit.vy})
    }
    if (this.isCapture(unit.x - 1, unit.y + unit.vy, unit)) {
      result.push({x: unit.x - 1, y: unit.y + unit.vy})
    }
    // TODO en passant is hard, needs previous board state, or at least previous move?
    return result;
  }

  kingMoves(unit) {
    // TODO need to check that its not moving into check
    // Also need to check for stalemate/checkmate states.
    return this.moves(unit, this.dirs, 1);
  }

  bishopMoves(unit) {
    return this.moves(unit, this.diagonals, 8);
  }

  rookMoves(unit) {
    return this.moves(unit, this.cardinals, 8);
  }

  queenMoves(unit) {
    return this.moves(unit, this.dirs, 8);
  }

  moves(unit, dirs, maxDis) {
    let moves = [];
    for (let dir of dirs) {
      for (let dis = 1; dis <= maxDis; dis++) {
        let x = unit.x + dir.x * dis;
        let y = unit.y + dir.y * dis;
        if (this.isValid(x, y, unit)) {
          moves.push({x: x, y: y});
        } else {
          break;
        }
        let capture = this.grid[y][x].get();
        if (capture) {
          // If there is a piece here we can't go past it.
          break;
        }
      }
    }
    return moves;
  }

  isCapture(x, y, unit) {
    if (x < 0 || x >= 8 || y < 0 || y >= 8) {
      return false;
    }
    let capture = this.grid[y][x].get();
    return capture && capture.color !== unit.color;
  }

  isValid(x, y, unit) {
    if (x < 0 || x >= 8 || y < 0 || y >= 8) {
      return false;
    }
    let capture = this.grid[y][x].get();
    if (capture && capture.color === unit.color) {
      // Can't capture your own pieces.
      return false;
    }
    return true;
  }
}

class Unit {
  constructor(board, x, y, col, unit) {
    this.board = board;
    this.x = x;
    this.y = y;
    this.sy = y;
    this.vy = col === "W" ? -1 : 1;
    this.color = col;
    this.type = unit;
    this.unit = unit[0];
  }

  show(size) {
    let x = this.board.x + this.x * size * 2 + size;
    let y = this.board.y + this.y * size * 2 + size;
    stroke(color(128,128,128));
    strokeWeight(2);
    if (this.color === "W") {
      fill(color(240, 240, 240));
    } else {
      fill(color(10, 10, 10));
    }
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

  board.update();
}

function mouseClicked() {
  board.click(mouseX, mouseY);
}
