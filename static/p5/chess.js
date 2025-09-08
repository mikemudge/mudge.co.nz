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

class Player {
  constructor(color) {
    this.color = color;
    this.pieces = [];
    this.captured = [];
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
    let params = getURLParams();
    // TODO Add support for different AI and for human player?
    this.strategy = [
      params.whiteStrategy || 'randomAI',
      params.blackStrategy || 'randomAI'
    ];

    this.turn = 0;
    // at 30fps this would be 5 seconds per move.
    this.delayMoveReset = params.delayMoveReset || 150;

    var input = document.createElement("input");
    input.type = "range";
    input.min = 0;
    input.max = 300;
    input.value = this.delayMoveReset;
    input.onchange = function(event) {
      this.delayMoveReset = parseInt(event.target.value);
    }.bind(this);
    document.body.appendChild(input);

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

    for (var y = 0; y < this.players[0].captured.length; y++) {
      this.players[0].captured[y].showAt(this.size, this.x - this.size, this.y + this.size + y * this.size);
    }
    for (y = 0; y < this.players[1].captured.length; y++) {
      this.players[1].captured[y].showAt(this.size, this.x + this.size * 17, this.y + this.size + y * this.size);
    }


    if (this.lastLocation) {
      if (this.lastPiece.color === "W") {
        stroke(color(20, 255, 20));
      } else {
        stroke(color(255, 50, 20));
      }
      strokeWeight(2);
      noFill();
      let x = this.x + this.lastLocation.x * this.size * 2;
      let y = this.y + this.lastLocation.y * this.size * 2;
      rect(x, y, this.size * 2);
    }

    if (this.lastPiece) {
      if (this.lastPiece.color === "W") {
        stroke(color(20, 255, 20));
      } else {
        stroke(color(255, 50, 20));
      }
      strokeWeight(2);
      noFill();
      let x = this.x + this.lastPiece.x * this.size * 2 + this.size;
      let y = this.y + this.lastPiece.y * this.size * 2 + this.size;
      circle(x, y, this.size * 1.5);
    }
  }

  update() {
    if (this.turn === -1) {
      // Game is over
      return;
    }

    if (this.delayMove > 0) {
      this.delayMove--;
      return;
    }
    var choose = null;
    if (this.strategy[this.turn] === 'human') {
      // No AI required, let the human make a manual move.
      return;
    } else if (this.strategy[this.turn] === 'randomAI') {
      choose = this.aiRandom(this.players[this.turn]);
    } else if (this.strategy[this.turn] === 'v2AI') {
      choose = this.aiV2(this.players[this.turn]);
    }

    if (!choose) {
      alert("Can't play any move, you win");
      this.turn = -1;
      return;
    }
    var unit = choose[0];
    var move = choose[1];

    this.makeMove(unit, move);
    this.turn = 1 - this.turn;
  }

  makeMove(unit, move) {
    this.lastLocation = {x: unit.x, y: unit.y};
    this.lastPiece = unit;
    var capture = this.grid[move.y][move.x].get();
    // A move like En Passant can capture a piece which is not at the grid location.
    if (move.capture) {
      capture = move.capture;
    }
    if (capture) {
      console.log("captured ", capture.type, "at", move.x, move.y);

      // Remove the piece from the board.
      this.grid[capture.y][capture.x].set(null);

      let player = this.players[capture.color === "W" ? 0 : 1];
      // Remove the piece from the players list.
      const index = player.pieces.indexOf(capture);
      var r = player.pieces.splice(index, 1);
      player.captured.push(r[0]);
    }
    unit.hasMoved = true;
    // Remove the unit from its old spot.
    this.grid[unit.y][unit.x].set(null);
    unit.y = move.y;
    unit.x = move.x;
    // Add it to the new spot.
    this.grid[move.y][move.x].set(unit);
    // To support castling we need to move 2 pieces sometimes.
    if (move.other) {
      var piece = move.other.piece;
      piece.hasMoved = true;
      this.grid[piece.y][piece.x].set(null);
      piece.y = move.other.y;
      piece.x = move.other.x;
      // Add it to the new spot.
      this.grid[move.other.y][move.other.x].set(piece);
    }
    // Reset the move delay clock.
    this.delayMove = this.delayMoveReset;
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
      // Can only play a move if the strategy is 'human'
      let canMove = this.strategy[this.turn] === 'human';
      if (this.selectedUnit && canMove) {
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
    this.players = [
      new Player("W"),
      new Player("B")
    ]
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
    this.players[unit.color === "W" ? 0 : 1].pieces.push(unit);
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

    // En passant check.
    if (this.lastPiece && this.lastPiece.isPawn()) {
      // The pawn must now be on the same row as us.
      if (this.lastPiece.y === unit.y) {
        // And it was previously 2 rows ahead of us (move 2 steps).
        if (this.lastLocation.y === unit.y + 2 * unit.vy) {
          // And it must be in an adjacent columen
          if (Math.abs(this.lastPiece.x - unit.x) === 1) {
            // This is a valid en passant move, but we need to ensure if used, it will additionally capture the piece.
            result.push({x: this.lastPiece.x, y: unit.y + unit.vy, capture: this.lastPiece});
          }
        }
      }
    }
    // TODO en passant is hard, needs previous board state, or at least previous move?
    return result;
  }

  kingMoves(unit) {
    // TODO need to check that its not moving into check
    // Also need to check for stalemate/checkmate states.

    // Need to check for castling as well?
    var possible = this.moves(unit, this.dirs, 1);

    if (!unit.hasMoved) {
      // Castling is only possible if this unit has never moved before.
      // Need to check the rooks as well, and all spaces in between.
      var leftRook = this.grid[unit.y][0].get();
      var rightRook = this.grid[unit.y][7].get();

      if (leftRook && !leftRook.hasMoved) {
        // Could be a candidate, need to check spaces between.
        var pieceInWay = false;
        for (var x = 1; x < 3; x++) {
          if (this.grid[unit.y][x].get()) {
            pieceInWay = true;
            break;
          }
        }
        if (!pieceInWay) {
          possible.push({x: 1, y: unit.y, other: {piece: leftRook, x: 2, y: unit.y}});
        }
      }

      if (rightRook && !rightRook.hasMoved) {
        // Could be a candidate, need to check spaces between.
        pieceInWay = false;
        for (x = 4; x < 7; x++) {
          if (this.grid[unit.y][x].get()) {
            pieceInWay = true;
            break;
          }
        }
        if (!pieceInWay) {
          possible.push({x: 5, y: unit.y, other: {piece: rightRook, x: 4, y: unit.y}});
        }
      }

    }
    return possible;
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
  getAllMoves(player) {
    // AI turn.
    var allMoves = [];
    player.pieces.forEach(function (unit) {
      this.possibleMoves(unit).forEach(function (move) {
        allMoves.push([unit, move]);
      });
    }.bind(this));
    return allMoves;
  }

  aiRandom(player) {
    // AI turn.
    var allMoves = this.getAllMoves(player);
    return random(allMoves);
  }

  aiV2(player) {
    // AI turn.
    var allMoves = this.getAllMoves(player);
    // TODO something better than random.
    return random(allMoves);
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

  isPawn() {
    return this.type === "Pawn";
  }

  show(size) {
    let x = this.board.x + this.x * size * 2 + size;
    let y = this.board.y + this.y * size * 2 + size;
    this.showAt(size, x, y);
  }

  showAt(size, x, y) {
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
    textSize(size / 2);
    text(this.unit, x - 4 - (this.unit === "Q" ? 1 : 0), y + 4);
  }
}

let paused;
let board;
export function setup() {
  createCanvas(800, 600);
  paused = false;
  board = new Board();
  board.initStart();
}

export function draw() {
  background(color(192, 192, 192));

  board.show();

  board.update();
}

export function mouseClicked() {
  board.click(mouseX, mouseY);
}
