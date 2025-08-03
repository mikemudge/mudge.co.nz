class CitySquare {
  constructor() {
    this.color = color(100 + random(100), 0, 0);
    this.solid = false;
    this.tower = null;
  }

  show(size) {
    if (this.solid) {
      fill('darkgrey');
      rect(0, 0, size, size);
      if (this.tower) {
        fill('green');
        circle(size / 2, size / 2, size);
      }
    } else {
      fill(this.color);
      rect(0, 0, size, size);
    }
  }
}

class EnemyPath {
  constructor(view, map) {
    this.view = view;
    this.map = map;
    this.team = new Team(map, color(0,0,255));
    this.time = 0;
    this.unitClass = new UnitClass("Minion");

    // Randomly choose a path.
    this.start = this.map.getRandomTile();
    // Add checkpoints?
    this.checkpoints = [];
    for (let i = 0; i < random(4); i++) {
      this.checkpoints.push(this.map.getRandomTile());
    }
    this.finish = this.map.getRandomTile();
    this.path = [];
    for (let c of this.checkpoints) {
      this.path.push(this.convertGrid(c));
    }
    this.path.push(this.convertGrid(this.finish));
    this.units = [];
  }

  convertGrid(square) {
    return createVector(square.x, square.y).mult(10).add(5, 5);
  }

  update() {
    this.time++;
    if (this.time % 100 === 0) {
      // spawn a new minion to follow the path?
      let unit = new Unit(createVector(this.start.x * 10, this.start.y * 10), this.team, this.unitClass);
      unit.setAction(new PathCommand(this.path, false));
      this.units.push(unit);
    }

    for (let unit of this.units) {
      unit.update();
    }
    for (let i = this.units.length - 1; i >= 0; i--) {
      let unit = this.units[i];
      if (unit.action == null) {
        // Unit reached the end?
        // TODO also need to remove units which died on the path.
        this.units.splice(i, 1);
        continue;
      }
      unit.update();
    }
  }

  showText(textString, size) {
    size = size * 10;
    textSize(size);
    text(textString, size / 2, size * .85);
    noFill();
    stroke('white');
    rect(0, 0, size, size);
  }

  show() {
    fill('white');
    noStroke();
    this.view.showAtGridLoc(this.start, this.showText.bind(this, ["S"]));
    for (let [i, c] of this.checkpoints.entries()) {
      this.view.showAtGridLoc(c, this.showText.bind(this, [i + 1]));
    }
    this.view.showAtGridLoc(this.finish, this.showText.bind(this, ["F"]));

    for (let unit of this.units) {
      this.view.show(unit);
    }
  }
}

class CityGame {
  constructor(view) {
    this.view = view;
    this.map = new Grid(50, 50);
    for (let y = 0; y < this.map.getHeight(); y++) {
      for (let x = 0; x < this.map.getWidth(); x++) {
        let square = new CitySquare();
        if (x === 0 || y === 0 || x === this.map.getWidth() - 1 || y === this.map.getHeight() - 1) {
          square.solid = true;
        } else {
          if (random(100) < 10) {
            square.solid = true;
          }
        }

        this.map.setTileData(x, y, square);
      }
    }
    this.enemyPath = new EnemyPath(view, this.map);
  }

  show() {
    this.view.update();

    this.enemyPath.update();

    this.view.drawMap(this.map);

    this.enemyPath.show();

    this.view.coverEdges();
  }
}

var mousePos;
var view;
function setup() {
  view = new MapView(10);
  view.createCanvas();
  mousePos = createVector(0, 0);

  game = new CityGame(view);
  // window.onblur = function() {
  //   game.paused = true;
  //   noLoop();
  // }

}

function draw() {
  background(0);

  game.show();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);

  view.setScreen(windowWidth, windowHeight);
}

function keyPressed() {
  view.keys();
}

function keyReleased() {
  view.keys();
}

// TODO move this setup into the swipecontrol.js class?
// TODO handle multiple touches? Would need touchStarted, touchMoved and touchedEnded.
function mousePressed() {
  mousePos.set(mouseX, mouseY);
}

function mouseDragged() {
  mousePos.set(mouseX, mouseY);
}

function mouseReleased() {
  mousePos.set(mouseX, mouseY);
}

function mouseWheel(event) {
  view.scale(event.delta);
}
