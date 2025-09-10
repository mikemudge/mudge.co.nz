import {Grid} from "./jslib/grid.js";
import {MapView} from "./jslib/view.js";
import {FollowCommand} from "./rts/actions.js";
import {Unit, UnitClass} from "./rts/units.js";
import {Team} from "./rts/map.js";

class RandomSquare {
  constructor() {
    this.color = color(100 + random(100), 0, 0);
    this.solid = false;
    this.tower = 0;
  }

  show(size) {
    if (this.solid) {
      fill('darkgrey');
      rect(0, 0, size, size);
      if (this.tower > 0) {
        fill('green');
        circle(size / 2, size / 2, size);
        // TODO show better tower levels?
        fill('white');
        textSize(size);
        text(this.tower, size / 2, size * .85);
      }
    } else {
      fill(this.color);
      rect(0, 0, size, size);
    }
  }
}

class MazeRouter {
  constructor(map, target) {
    this.map = map;
    this.grid = new Grid(map.getWidth(), map.getHeight());
    this.target = target;
    this.calculate();
  }

  calculate() {
    this.grid.reset();

    this.grid.getTile(this.target.x, this.target.y).setData({"end": true});
    // Start at the target and explore the map.
    let explore = [this.target];
    while (explore.length > 0) {
      let next = [];
      for (let e of explore) {
        if (!e.getData() || e.getData().solid) {
          // Can't walk over OOB or solid tiles.
          continue;
        }
        for (let t of e.getCardinalTiles()) {
          if (this.grid.getTile(t.x, t.y).getData()) {
            continue;
          }
          this.grid.getTile(t.x, t.y).setData({"next": e});
          next.push(t);
        }
      }
      explore = next;
    }
  }

  getTarget(unit) {
    let size = 10;
    let t = this.grid.getTileAtPosWithSize(unit.pos, size);
    if (!t.getData() || !t.getData().next) {
      return null;
    }
    let t2 = t.getData().next;
    // Scale up by size, and then offset to the center of the square.
    return createVector(t2.x, t2.y).mult(size).add(size / 2, size / 2);
  }
}

class EnemyPath {
  constructor(view, map) {
    this.view = view;
    this.map = map;
    this.team = new Team(map, color(0,0,255));
    this.time = 0;
    this.unitClass = new UnitClass("Minion");
    this.unitClass.r = 4;

    // Randomly choose a path.
    this.start = this.map.getRandomTile();
    this.start.getData().solid = false;
    // Add checkpoints?
    this.checkpoints = [];
    this.mazeRoutes = [];
    for (let i = 0; i < random(4); i++) {
      let c = this.map.getRandomTile();
      c.getData().solid = false;
      this.mazeRoutes.push(new MazeRouter(this.map, c));
      this.checkpoints.push(c);
    }
    this.finish = this.map.getRandomTile();
    this.finish.getData().solid = false;
    this.mazeRoutes.push(new MazeRouter(this.map, this.finish));

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
      for (let r of this.mazeRoutes) {
        unit.addAction(new FollowCommand(r));
      }
      this.units.push(unit);
    }

    for (let unit of this.units) {
      unit.update();
    }
    for (let i = this.units.length - 1; i >= 0; i--) {
      let unit = this.units[i];
      if (!unit.getHealth().isAlive()) {
        // Remove units which have expired.
        this.units.splice(i, 1);
      } else if (unit.action == null) {
        // Unit reached the end?
        // TODO have a cost of leaking?
        this.units.splice(i, 1);
        continue;
      }
      unit.update();
    }
  }

  showText(textString, size) {
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

  updateRoutes() {
    for (let r of this.mazeRoutes) {
      r.calculate();
    }
  }
}

class RandomTdGame {
  constructor(view) {
    this.view = view;
    this.map = new Grid(50, 50);
    // Set center to half of the map scaled up by size.
    view.setCenter(createVector(this.map.getWidth(), this.map.getHeight()).mult(10 / 2));
    for (let y = 0; y < this.map.getHeight(); y++) {
      for (let x = 0; x < this.map.getWidth(); x++) {
        let square = new RandomSquare();
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

  clickStart(mousePos) {
    let clicked = this.map.getTileAtPos(this.view.toGameGrid(mousePos));
    if (!clicked.getData()) {
      // Clicked outside the area.
      return;
    }
    let square = clicked.getData();
    if (!square.solid) {
      this.clickAction = 0;
    } else {
      this.clickAction = square.tower++;
    }
  }

  clickMove(mousePos) {
    this.upgradeToClickAction(mousePos);
  }
  clickEnd(mousePos) {
    this.upgradeToClickAction(mousePos);
  }

  upgradeToClickAction(mousePos) {
    let clicked = this.map.getTileAtPos(this.view.toGameGrid(mousePos));
    if (!clicked.getData()) {
      // Clicked outside the area.
      return;
    }
    let square = clicked.getData();
    if (!square.solid && this.clickAction === 0) {
      square.solid = true;
      this.enemyPath.updateRoutes();
    } else if (square.tower + 1 === this.clickAction) {
      square.tower = this.clickAction;
    }
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
var randomGame;
export function setup() {
  view = new MapView(10);
  view.createCanvas();
  mousePos = createVector(0, 0);

  randomGame = new RandomTdGame(view);
  window.onblur = function() {
    randomGame.paused = true;
    noLoop();
  }

}

export function draw() {
  background(0);

  randomGame.show();
}

export function windowResized() {
  resizeCanvas(windowWidth, windowHeight);

  view.setScreen(windowWidth, windowHeight);
}

export function keyPressed() {
  view.keys();
}

export function keyReleased() {
  view.keys();
}

// TODO move this setup into the swipecontrol.js class?
// TODO handle multiple touches? Would need touchStarted, touchMoved and touchedEnded.
export function mousePressed() {
  mousePos.set(mouseX, mouseY);
  randomGame.clickStart(mousePos);
}

export function mouseDragged() {
  mousePos.set(mouseX, mouseY);
  randomGame.clickMove(mousePos);
}

export function mouseReleased() {
  if (randomGame.paused) {
    randomGame.paused = false;
    loop();
    return;
  }
  mousePos.set(mouseX, mouseY);
  randomGame.clickEnd(mousePos);
}

export function mouseWheel(event) {
  view.scale(event.delta);
}
