class Team {
  constructor(game, color) {
    this.game = game;
    this.color = color;
    this.headQuarters = null;
    // TODO starting with high resources for testing.
    this.resourceCount = 2000;
  }

  getGame() {
    return this.game;
  }

  setHq(hq) {
    this.headQuarters = hq;
  }
}

class Circle {
  constructor(color, size) {
    this.color = color;
    this.size = size;
  }

  show(size) {
    noFill();
    stroke(this.color);
    circle(0, 0, size * this.size / 40);
  }
}

class Rect {
  constructor(color, size) {
    this.color = color;
    this.size = size;
  }

  show(size) {
    size = size * this.size / 20;
    fill(this.color);
    rect(-size / 2, -size / 2, size, size);
  }
}

// TODO show selected units in bottom menu?
// refactor click method of controls better.
// Add attack move, and hold position/attack on engage.
// add hotkeys for shortcuts.


class MouseControls {
  constructor(game, team) {
    this.game = game;
    this.team = team;
    this.view = game.view;
    this.mousePos = createVector(0, 0);
    this.startMouse = createVector(0, 0);
    this.endMouse = createVector(0, 0);
    this.selectedUnits = [];

    this.view.topMenu = new DisplayMenu(this.showResources.bind(this));
    // TODO support more advanced layouts?
    this.buildButtons = new ButtonMenu();
    this.view.addBottomMenu(new DisplayMenu(this.showSelectedUnit.bind(this)));
    this.view.addBottomMenu(new DisplayMenu(this.showSelectedUnits.bind(this)));
    this.view.addBottomMenu(this.buildButtons);
  }

  mouseMove() {
    this.mousePos.set(mouseX, mouseY);
  }

  mouseDrag() {
    if (mouseButton === LEFT) {
      this.mousePos.set(mouseX, mouseY);
      this.endMouse.set(this.mousePos);
    }
  }

  mouseDown() {
    if (mouseButton === LEFT) {
      this.mousePressed = true;
      this.mousePos.set(mouseX, mouseY);
      this.startMouse.set(this.mousePos);
      this.endMouse.set(this.mousePos);
    }
  }

  handlePlacement() {
    // TODO Make sure we don't collide with anything?
    let shift = keyIsDown(16);
    if (this.placement.cost > this.team.resourceCount) {
      this.view.overlayMenu.addMessage("Need more money!");
      return;
    }

    let buildTarget = this.placement.building;
    let mouseGamePos = this.view.toGame(this.mousePos);
    buildTarget.pos.set(mouseGamePos);
    this.game.addUnit(buildTarget);
    // Once placed we set an action to make the worker build it.
    if (shift || this.placement.repeat === true) {
      this.selectedUnit.addAction(new BuildCommand(buildTarget));
    } else {
      this.selectedUnit.setAction(new BuildCommand(buildTarget));
    }
    this.game.view.overlayMenu.addMessage("Building " + buildTarget.constructor.name);

    // Pay for it.
    this.team.resourceCount -= this.placement.cost;

    // Reset placement unless shift is pressed.
    if (shift || this.placement.repeat === true) {
      // build another one.
      this.placement = {
        building: this.placement.action.call(this.selectedUnit, buildTarget),
        action: this.placement.action,
        cost: this.placement.cost,
        repeat: this.placement.repeat || false,
      };
    } else {
      this.placement = null;
    }
  }

  handleAreaSelect() {
    let v1 = this.view.toGame(this.startMouse);
    let v2 = this.view.toGame(this.endMouse);
    // Looks like a selection area is being made.

    // TODO support for shift adding to selection?
    let newSelection = this.game.getInArea(Math.min(v1.x, v2.x),
      Math.min(v1.y, v2.y),
      Math.abs(v1.x - v2.x),
      Math.abs(v1.y - v2.y));

    // TODO findone?
    let skipBuildings = false;
    for (let unit of newSelection) {
      if (!(unit instanceof Building)) {
        skipBuildings = true;
      }
    }

    if (skipBuildings) {
      // filter out all buildings if there are other things to select.
      newSelection = newSelection.filter(function (unit) {
        return !(unit instanceof Building);
      });
    }

    // TODO this filter result isn't used yet?
    newSelection.filter(function (unit) {
      return unit.team !== this.team;
    }, this)

    this.updateSelection(newSelection);
  }

  handlePointSelect(pos, nearby) {
    let clickedUnit = this.selectBest(pos, nearby);
    let shift = keyIsDown(16);
    if (shift) {
      // check if it's already selected.
      let index = this.selectedUnits.indexOf(clickedUnit);
      if (index === -1) {
        // Add the new selection.
        this.selectedUnits.push(clickedUnit);
      } else {
        // Remove from existing selection.
        this.selectedUnits.splice(index, 1);
      }
    } else {
      // Set the selected units to just this one.
      this.selectedUnits = [clickedUnit];
    }
    this.updateSelection(this.selectedUnits);
  }

  updateSelection(units) {
    this.selectedUnits = units;
    this.buildButtons.reset();
    if (this.selectedUnits.length > 0) {
      this.selectedUnit = this.selectedUnits[0];
      this.updateBuildButtons();
    } else {
      // deselect.
      this.selectedUnit = null;
    }
  }

  selectBest(pos, units) {
    // TODO select the best unit based on the click location.
    return units[0];
  }

  click() {
    this.mousePressed = false;
    let clickPos = this.view.toGame(createVector(mouseX, mouseY));
    this.lastClick = clickPos;

    let leftClick = (mouseButton === LEFT);
    if (leftClick) {
      if (this.placement) {
        this.handlePlacement();
        return;
      }
      // Left click implies selection of units.
      if (this.startMouse.dist(this.endMouse) > 5) {
        this.handleAreaSelect();
        return;
      }
      let nearby = this.game.getNearby(clickPos, 20);
      if (nearby.length > 0) {
        // There was units nearby, select them.
        this.handlePointSelect(clickPos, nearby);
        return;
      }
      // TODO check if selecting a feature?

      let shift = keyIsDown(16);
      if (shift) {
        // No deselect happens if shift is pressed and left click happens.
        // Essentially trying to add a unit to selected, but missed?
      } else {
        // deselect all.
        this.selectedUnit = null;
        this.selectedUnits = [];
      }
    } else {
      if (this.placement) {
        // Cancel placement for non left clicks.
        this.placement = null;
        return;
      }

      // right click implies commanding units.
      if (!this.selectedUnits) {
        // No selectedUnits to give a command to.
        return;
      }
      // Give an action to existing selection.

      this.handleAssignCommand(this.selectedUnits, clickPos);
    }
  }

  handleAssignCommand(units, clickPos) {
    // Check for nearby targets to attack
    let nearby = this.game.getNearby(clickPos, 20);
    if (nearby.length > 0) {
      // TODO select best should prefer other team?
      // Or support following same team unit?
      let clickedUnit = this.selectBest(clickPos, nearby);
      if (this.selectedUnit.team !== clickedUnit.team) {
        // An enemy was clicked.
        this.commandAll(this.selectedUnits, AttackCommand, clickedUnit);
        return;
      }
    }

    // Check for resources to gather.
    // TODO how to tell which units can do which actions?
    // E.g buildings can't move, soldiers can't gather, workers can't fight?
    let features = this.game.getNearbyFeatures(clickPos, 20);
    if (features.length > 0) {
      this.commandAll(this.selectedUnits, GatherCommand, features[0]);
      return;
    }

    let a = 65;
    if (keyIsDown(a)) {
      // attack move instead of just move.
      this.moveCommandAll(this.selectedUnits, AttackMoveCommand, clickPos);
      return
    }
    // Nothing more specific to do, just move units to the location.
    this.moveCommandAll(this.selectedUnits, MoveCommand, clickPos);
  }
  moveCommandAll(units, command, pos) {
    let moving = 0;
    let rallying = 0;
    let shift = keyIsDown(16);
    for (let selected of this.selectedUnits) {
      if (selected instanceof Building) {
        // TODO rally as an action?
        selected.targetRally = {
          command: command,
          pos: pos
        };
        rallying++;
      } else {
        if (shift) {
          moving++;
          selected.addAction(new command(pos));
        } else {
          moving++;
          selected.setAction(new command(pos));
        }
      }
    }
    if (moving > 0) {
      this.view.overlayMenu.addMessage("Moving " + moving + " unit(s) to " + Util.vectorString(pos));
    } else {
      this.view.overlayMenu.addMessage("Rally " + rallying + " building(s) to " + Util.vectorString(pos));
    }
  }

  commandAll(units, command, target) {
    let moving = 0;
    let rallying = 0;
    let shift = keyIsDown(16);
    for (let selected of units) {
      if (selected instanceof Building) {
        selected.targetRally = target;
        rallying++;
      } else {
        if (shift) {
          moving++;
          selected.addAction(new command(target));
        } else {
          moving++;
          selected.setAction(new command(target));
        }
      }
    }
    if (moving > 0) {
      this.view.overlayMenu.addMessage(command.name + " " + moving + " unit(s) to " + Util.vectorString(target.pos))
    } else {
      this.view.overlayMenu.addMessage("Rally " + rallying + " building(s) to " + command.name + " " + Util.vectorString(target.pos))
    }
  }

  updateBuildButtons() {
    // Update the view menus for this unit?
    if (this.selectedUnit.buildActions) {
      for (let buildAction of this.selectedUnit.buildActions) {
        // TODO cost of each button should affect active/inactive state?
        if (this.selectedUnit instanceof Building) {
          // Building a unit doesn't require placement
          let closure = function () {
            if (this.team.resourceCount >= buildAction.cost) {
              let buildTarget = buildAction.action.call(this.selectedUnit);
              if (buildTarget) {
                this.team.resourceCount -= buildAction.cost;
              }
            } else {
              this.view.overlayMenu.addMessage("Need more money!");
            }
          }.bind(this);
          this.buildButtons.addButton(buildAction.name, closure);
        } else {
          // Building a building requires placement
          let closure = function () {
            if (this.team.resourceCount >= buildAction.cost) {
              this.placement = {
                building: buildAction.action.call(this.selectedUnit),
                action: buildAction.action,
                cost: buildAction.cost,
                repeat: buildAction.repeat || false
              };
            } else {
              this.view.overlayMenu.addMessage("Need more money!");
            }
          }.bind(this);
          this.buildButtons.addButton(buildAction.name, closure);
        }
      }
    }
  }

  showSelectedUnit() {
    // TODO show something in the left bottom corner for the current unit?
  }

  showSelectedUnits() {
    let size = 30;
    let w = 8;
    let limit = 24; // w * 3 rows;
    let start = 0;
    // TODO support pagination?
    for (let i=start;i<Math.min(start + limit, this.selectedUnits.length);i++) {
      let x = i % w * size;
      let y = Math.floor(i / w) * size;
      stroke('white');
      noFill();
      rect(x, y, size, size);
      noStroke();
      fill('white');
      textSize(10);
      text(this.selectedUnits[i].constructor.name, x, y, size, size);
    }
  }

  showResources() {
    fill('white');
    textSize(16);
    textAlign(LEFT);
    let resources = "Money: " + this.team.resourceCount;
    text(resources, 5, 15);

    if (this.selectedUnits.length > 0) {
      let units = "Selected: " + this.selectedUnits.length;
      let set = {};
      for (let unit of this.selectedUnits) {
        set[unit.constructor.name] = 1;
      }
      units += " " + Object.keys(set);
      if (this.selectedUnit.action) {
        units += " " + this.selectedUnit.action.constructor.name;
      }
      text(units, 205, 15);
    }
  }

  show() {
    if (this.mousePressed && this.startMouse.dist(this.endMouse) > 5) {
      noFill()
      stroke('yellow');
      // Looks like a selection area is being made.
      rect(Math.min(this.startMouse.x, this.endMouse.x),
        Math.min(this.startMouse.y, this.endMouse.y),
        Math.abs(this.startMouse.x - this.endMouse.x),
        Math.abs(this.startMouse.y - this.endMouse.y))
    }
    if (this.placement) {
      let color = 'red';
      if (this.placement.cost <= this.team.resourceCount) {
        color = 'green';
      }
      let mouseGamePos = this.view.toGame(this.mousePos);
      this.view.showAtPos(new Rect(color, this.placement.building.r || 20), mouseGamePos);
    }
    if (this.lastClick) {
      this.view.showAtPos(new Circle('green', 3), this.lastClick);
    }
    for (let selected of this.selectedUnits) {
      // Show something about the selected unit?
      this.view.showAtPos(new Circle('green', selected.r * 2.8 + 2), selected.pos);

      stroke('blue');
      noFill();
      if (selected.actions) {
        let last = this.view.toScreen(selected.pos);
        if (selected.action) {
          let screenPos = this.view.toScreen(selected.action.getPos());
          line(last.x, last.y, screenPos.x, screenPos.y);
          circle(last.x, last.y, 3);
          last.set(screenPos);
        }
        for (let action of selected.actions) {
          let screenPos = this.view.toScreen(action.getPos());
          line(last.x, last.y, screenPos.x, screenPos.y);
          circle(last.x, last.y, 3);
          last.set(screenPos);
        }
      }

      // Show a building's rally point.
      // TODO should rally be an action?
      if (selected.targetRally) {
        let last = this.view.toScreen(selected.pos);
        let screenPos = this.view.toScreen(selected.targetRally.pos);
        line(last.x, last.y, screenPos.x, screenPos.y);
        circle(last.x, last.y, 2);
      }
    }
  }
}

class Tree {
  constructor(pos) {
    // lawn green is #7CFC00
    // green is #008000
    this.pos = pos;
    let rnd = random();
    this.color = color(rnd * 0x7c, 0x80 + rnd * (0xfc - 0x80), 0);
  }

  show(size) {
    stroke("black");
    fill("brown");
    rect(size * -.05, 0, size * .1 , size * .25);
    fill("ForestGreen");
    circle(0,  size * -.125, size * .375);
  }
}

// TODO add resources and gathering.

class Game {
  constructor(view) {
    this.view = view;
    this.width = 1000;
    this.height = 1000;
    this.units = [];
    this.features = [];
    this.projectiles = [];
    this.init();
  }

  init() {
    this.units = [];
    let team = new Team(this, color('#D33430'));
    let hq = new Base(createVector(50, 50), team);
    team.setHq(hq);
    this.units.push(hq);

    team = new Team(this, color('#5C16C8'))
    let teamSpawn = createVector(this.width - 50, this.height - 50);
    let homeBase = new Base(teamSpawn, team);
    team.setHq(homeBase);

    this.units.push(homeBase);
    let pos = p5.Vector.random2D().mult(homeBase.r * 1.4 + 10).add(homeBase.pos);
    this.units.push(new Builder(pos, team));
    this.units.push(new Barracks(createVector(-100, 0).add(teamSpawn), team));

    this.view.setCenter(teamSpawn);
    // Add human controls for one team
    this.controls = new MouseControls(this, team);

    pos = p5.Vector.random2D().mult(300).add(teamSpawn);
    this.features.push(new Tree(pos));
    pos = p5.Vector.random2D().mult(20).add(pos);
    this.features.push(new Tree(pos));
    pos = p5.Vector.random2D().mult(20).add(pos);
    this.features.push(new Tree(pos));

    this.view.overlayMenu.addMessage("RTS Game init finished");
  }

  getNearby(pos, range) {
    var result = this.units.filter(function(unit) {
      let eRange = range;
      if (unit.r) {
        eRange = unit.r + range;
      }
      return unit.pos.dist(pos) < eRange;
    });
    return result;
  }

  getNearbyFeatures(pos, range) {
    var result = this.features.filter(function(feature) {
      return feature.pos.dist(pos) < range;
    });
    return result;
  }

  getInArea(x, y, w, h) {
    var result = this.units.filter(function(unit) {
      return unit.pos.x > x && unit.pos.x < x + w && unit.pos.y > y && unit.pos.y < y + h;
    });
    return result;
  }

  addUnit(unit) {
    this.units.push(unit);
  }

  addProjectile(arrow) {
    this.projectiles.push(arrow);
  }

  show() {
    this.view.update();

    for (let unit of this.units) {
      unit.update();
    }
    for (let i = this.units.length - 1; i >= 0; i--) {
      if (this.units[i].finished()) {
        this.units.splice(i, 1);
      }
    }

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      this.projectiles[i].update();
      if (this.projectiles[i].finished()) {
        this.projectiles.splice(i, 1);
      }
    }

    for (let feature of this.features) {
      this.view.show(feature);
    }

    // Render the game.
    for (let unit of this.units) {
      this.view.show(unit);
    }

    for (let projectile of this.projectiles) {
      this.view.show(projectile);
    }

    // Render the game.
    for (let unit of this.units) {
      let health = unit.getHealth();
      health.setScale(unit.r / 20);
      if (health.isDamaged()) {
        this.view.showAtPos(health, unit.pos);
      }
    }

    this.controls.show();

    this.view.coverEdges();
  }
}
