class Circle {
  constructor(color, r) {
    this.color = color;
    this.r = r;
  }

  show(size) {
    noFill();
    stroke(this.color);
    circle(0, 0, size * this.r * 2);
  }
}

// TODO show selected units in bottom menu?
// refactor click method of controls better.
// Add attack move, and hold position/attack on engage.
// add hotkeys for shortcuts.


class MouseControls {
  constructor(game, team) {
    this.map = game.map;
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

  update() {}

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

    let mouseGamePos = this.view.toGame(this.mousePos);
    let buildTarget = new ConstructionSite(this.placement.createBuilding(mouseGamePos, this.team));
    this.map.addUnit(buildTarget);
    // Once placed we set an action to make the worker build it.
    if (shift || this.placement.repeat === true) {
      this.selectedUnit.addAction(new BuildCommand(buildTarget));
    } else {
      this.selectedUnit.setAction(new BuildCommand(buildTarget));
    }
    this.view.overlayMenu.addMessage("Building " + this.placement.name);

    // Pay for it.
    this.team.resourceCount -= this.placement.cost;

    // Reset placement unless shift is pressed.
    if (shift || this.placement.repeat === true) {
      // build another one.
    } else {
      this.placement = null;
    }
  }

  handleAreaSelect() {
    let v1 = this.view.toGame(this.startMouse);
    let v2 = this.view.toGame(this.endMouse);
    // Looks like a selection area is being made.

    // TODO support for shift adding to selection?
    let newSelection = this.map.getInArea(Math.min(v1.x, v2.x),
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
      let nearby = this.map.getNearby(clickPos, 20);
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
    let nearby = this.map.getNearby(clickPos, 20);
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
    let features = this.map.getNearbyFeatures(clickPos, 20);
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

  buildUnit(unitClass) {
    if (this.team.resourceCount < unitClass.cost) {
      this.view.overlayMenu.addMessage("Need more money!");
      return;
    }
    // Submit a new buildUnit action?
    // Or append to an existing buildUnit action?
    // TODO support multiple buildings selected?
    let building = this.selectedUnit;
    if (building.buildQueue.length >= 10) {
      this.view.overlayMenu.addMessage("Build queue full!");
      return;
    }

    // 1.4 is ~ sqrt(2) for corners.
    let pos = p5.Vector.random2D().mult(building.getSize() * 1.4 + unitClass.getSize()).add(building.pos);
    let unit = unitClass.create(pos, building.team)
    building.buildQueue.push({
      time: unitClass.time * 30,
      unit: unit,
    });
    this.view.overlayMenu.addMessage("Building " + unitClass.name);
    this.team.resourceCount -= unitClass.cost;
  }

  buildBuilding(buildingClass) {
    if (this.team.resourceCount >= buildingClass.cost) {
      this.placement = buildingClass;
    } else {
      this.view.overlayMenu.addMessage("Need more money!");
    }
  }

  updateBuildButtons() {
    // Update the view menus for this unit?
    if (this.selectedUnit.unitClass) {
      for (let buildingClass of this.selectedUnit.unitClass.buildBuildings) {
        // TODO cost of each button should affect active/inactive state?
        this.buildButtons.addButton(buildingClass.name, this.buildBuilding.bind(this, buildingClass));
      }
    }
    if (this.selectedUnit.buildingClass) {
      for (let unitClass of this.selectedUnit.buildingClass.buildUnits) {
        this.buildButtons.addButton(unitClass.name, this.buildUnit.bind(this, unitClass));
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
      if (this.selectedUnits[i].unitClass) {
        text(this.selectedUnits[i].unitClass.name, x, y, size, size);
      } else {
        text(this.selectedUnits[i].buildingClass.name, x, y, size, size);
      }
    }
  }

  showResources() {
    fill('white');
    textSize(16);
    textAlign(LEFT);
    let resources = "Money: " + this.team.resourceCount;
    text(resources, 5, 15);

    // TODO fix use of constructor here?
    // This is just debug information for the selected units.
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

  draw() {
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
      if (this.placement.cost <= this.team.resourceCount) {
        fill('green');
      } else {
        fill('red');
      }
      let mouseGamePos = this.view.toGame(this.mousePos);
      this.view.showMethodAtPos(this.placement.renderPlacement.bind(this.placement), mouseGamePos);
    }
    if (this.lastClick) {
      this.view.showAtPos(new Circle('green', 3), this.lastClick);
    }
    for (let selected of this.selectedUnits) {
      // Show something about the selected unit?
      this.view.showAtPos(new Circle('green', selected.getSize() * 1.4), selected.pos);

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
    rect(size * -2, 0, size * 4, size * 10);
    fill("ForestGreen");
    circle(0,  size * -5, size * 15);
  }
}

class Game {
  constructor(view, map) {
    this.view = view;
    this.map = map;
    this.init();
  }

  init() {

    let base = new Base();
    let builder = new Builder();
    let house = new House();
    let barracks = new Barracks();
    let wall = new Wall();
    let tower = new Tower();
    let melee = new UnitClass("Melee");
    let archer = new Archer();
    let horse = new Horse();

    base.setBuildableUnits([builder]);
    barracks.setBuildableUnits([melee, archer, horse]);
    builder.setBuildableBuilding([base, house, barracks, wall, tower]);

    let bounds = this.map.getBounds();
    let team = new Team(this, color('#D33430'));
    let hq = base.createBuilding(createVector(50, 50), team);
    team.setHq(hq);
    this.map.addUnit(hq);

    team = new Team(this, color('#5C16C8'))
    let teamSpawn = createVector(bounds.x - 50, bounds.y - 50);
    let homeBase = base.createBuilding(teamSpawn, team);
    team.setHq(homeBase);

    this.map.addUnit(homeBase);
    let pos = p5.Vector.random2D().mult(homeBase.getSize() * 1.4 + 10).add(homeBase.pos);
    this.map.addUnit(builder.create(pos, team));
    this.map.addUnit(barracks.createBuilding(createVector(-100, 0).add(teamSpawn), team));

    this.view.setCenter(teamSpawn);
    // Add human controls for one team
    this.humanControls = new MouseControls(this, team);
    this.map.addControls(this.humanControls);

    pos = p5.Vector.random2D().mult(300).add(teamSpawn);
    this.map.addFeature(new Tree(pos));
    pos = p5.Vector.random2D().mult(20).add(pos);
    this.map.addFeature(new Tree(pos));
    pos = p5.Vector.random2D().mult(20).add(pos);
    this.map.addFeature(new Tree(pos));

    this.view.overlayMenu.addMessage("RTS Game init finished");
  }

  show() {
    this.view.update();

    this.map.update();

    this.map.show(this.view);

    this.view.coverEdges();
  }
}
