
if (window.mudgemi && window.mudgemi.init) {
  app = window.mudgemi.init.app;
  app.loadScript("/static/shared/logger.js");
}

class Planet {
  constructor(radius, pos) {
    this.radius = radius;
    this.pos = pos;
    this.maxShipCount = 99;
    this.shipCount = 10;
    // Based on 30 fps this would be once per second.
    this.resetTime = 30;
    this.timer = this.resetTime;
  }

  update() {
    if (!this.team) {
      // No ship increments for planets without teams.
      return;
    }
    this.pos.add(this.vel);
    this.timer--;
    if (this.timer <= 0) {
      if (this.shipCount < this.maxShipCount) {
        this.shipCount++;
      }
      this.timer = this.resetTime;
    }
  }

  setTeam(team) {
    this.team = team;
  }

  show() {
    if (this.team) {
      fill(this.team.color);
    } else {
      fill(color('darkgray'));
    }

    ellipse(this.pos.x, this.pos.y, this.radius * 2);

    noStroke();
    fill('white');
    text(this.shipCount, this.pos.x - 8, this.pos.y + 5);
  }
}

class Ship {
  constructor(pos, team, target) {
    this.r = 8;
    this.team = team;
    this.pos = pos;
    this.target = target;
    this.vel = p5.Vector.random2D();
    this.acc = createVector(0, 0);
    this.maxSpeed = 1.5;
    this.maxForce = 0.25;
    this.done = false;
  }

  update() {
    if (this.done) {
      return;
    }
    if (this.target) {
      if (this.target.pos.dist(this.pos) < this.target.radius) {
        // Reached target, should disappear now.
        // Add/Subtract ship from planet depending on the team.
        if (this.target.team === this.team) {
          this.target.shipCount++;
        } else {
          this.target.shipCount--;
          if (this.target.shipCount <= 0) {
            // Changes team if the count reaches 0.
            this.target.team = this.team;
          }
        }
        this.done = true;
        return;
      }
      this.applyForce(this.seek(this.target.pos));
    }

    // Now update the speed and position based on what was calculated above.
    this.vel.add(this.acc);
    this.vel.limit(this.maxSpeed);

    this.pos.add(this.vel);
    this.acc.set(0, 0);
  }

  applyForce(force) {
    this.acc.add(force);
  }

  seek(target) {
    let force = p5.Vector.sub(target, this.pos);
    // if (force.mag() > this.maxSpeed) {
      force.setMag(this.maxSpeed);
    // }
    force.sub(this.vel)
    // force.limit(this.maxForce)
    return force
  }

  show() {
    let size = 8;
    stroke(255);
    strokeWeight(1);
    fill(this.team.color)

    ellipse(this.pos.x, this.pos.y, size);
  }
}

class Team {
  constructor(color) {
    this.color = color;
  }
}

class PlanetsGame {
  constructor(view) {
    this.width = windowWidth;
    this.height = windowHeight;
    this.planets = [];
    this.ships = [];
    this.controls = [];
  }

  init() {
    this.planets = [];
    this.ships = [];

    // 100 * 100 would have radius 10-20.
    // 900 * 900 would have radius 30-60.

    logger.debug("Game Size " + this.width + ", " + this.height);
    let baseRadius = (width * height) ** (1 / 4);
    // Take the 4th root of the area to determine the size of planets.
    // TODO this should scale with numPlanets?

    logger.debug("Base radius " + baseRadius);

    let numPlanets = 10;
    for (let i = 0; i < numPlanets; i++) {
      // Randomly choose somewhere between 1 and 2 radius.
      let radius = baseRadius + random(baseRadius);
      let overlap = false;
      let pos = null;
      do {
        pos = createVector(random(this.width - 2 * radius) + radius, random(this.height - 2 * radius) + radius);
        overlap = false;
        for (let planet of this.planets) {
          // Add pixels to keep things farther apart.
          if (p5.Vector.dist(pos, planet.pos) < radius + planet.radius + 10) {
            overlap = true;
            break;
          }
        }
      } while (overlap);
      let planet = new Planet(radius, pos);
      // TODO avoid these being too close?
      this.planets.push(planet);
    }
  }

  initTeams() {
    this.teams = [
      new Team(color('#D33430')),
      new Team(color('#34D330')),
      new Team(color('#3430D3')),
    ];
    for (let i = 0;i < this.teams.length; i++) {
      // Assign a planet to each team.
      this.planets[i].setTeam(this.teams[i]);
    }
  }

  addControls(controls) {
    this.controls.push(controls);
  }

  applyControl(unit, force) {
    unit.applyForce(force);
  }

  getPlanet(pos) {
    for (let planet of this.planets) {
      if (p5.Vector.dist(planet.pos, pos) < planet.radius) {
        return planet;
      }
    }
    return null;
  }

  moveShips(planet1, planet2) {
    if (!planet1.team) {
      // Can't move ships from a planet which doesn't have a team yet.
      // TODO should only allow the players team.
      return;
    }
    for (let i=0; i<planet1.shipCount; i++) {
      let pos = p5.Vector.random2D().mult(random(planet1.radius)).add(planet1.pos);
      this.ships.push(new Ship(pos, planet1.team, planet2));
    }
    planet1.shipCount = 0;
  }

  show() {
    for (let control of this.controls) {
      control.update();
    }

    for (let ship of this.ships) {
      ship.update();
    }
    // Remove ships which are done.
    for (let i = this.ships.length - 1; i >= 0; i--) {
      if (this.ships[i].done) {
        this.ships.splice(i, 1);
      }
    }

    for (let planet of this.planets) {
      planet.update();
    }

    // Check win/lose
    let teams = [];
    for (let planet of this.planets) {
      if (planet.team) {
        teams.push(planet.team);
      }
    }
    if (teams.length === 1) {
      // Only one team remains, they win.
      logger.log("Team " + teams[0] + " is the winner");
      // TODO offer reset?
    }

    // Render the game.
    for (let planet of this.planets) {
      planet.show();
    }
    for (let ship of this.ships) {
      ship.show();
    }

    for (let control of this.controls) {
      control.draw();
    }

  }
}

class AiPlanetControls {
  constructor(game, team) {
    this.game = game;
    this.team = team;
  }

  update() {
    for (let planet of this.game.planets) {
      if (planet.team === this.team) {
        this.considerAttacks(planet);
      }
    }
  }

  considerAttacks(startPlanet) {
    let damagePossible = startPlanet.shipCount;
    // TODO consider defence level required as well?
    let best = 0;
    let bestPlanet = null;
    for (let planet of this.game.planets) {
      if (planet.team === this.team) {
        // Ignore your own planets for now.
        // TODO reinforcements should be considered?
        continue;
      }
      let dis = p5.Vector.dist(startPlanet.pos, planet.pos);
      let expectedPower = planet.shipCount;
      if (planet.team) {
        // The planet will grow by 1 ship per 30 frames, ships can fly 1.5 pixels per frame.
        expectedPower = planet.shipCount + 1 * dis / 45;
      }
      // How risky should this bot be?
      // high value means its less risky.
      let acceptableRisk = expectedPower + random(damagePossible);
      if (damagePossible > expectedPower + acceptableRisk) {
        console.log("Attack", damagePossible, expectedPower, dis / 45, planet.shipCount)
        // Worth sending attack to.
        // value is high for closer planets.
        let value = 10000 - dis;
        // TODO consider multiplier for ship count difference vs dis(pixels)?
        value += (damagePossible - expectedPower);
        if (value > best) {
          best = value;
          bestPlanet = planet;
        }
      }
    }
    if (bestPlanet) {
      this.game.moveShips(startPlanet, bestPlanet);
    }
  }

  draw() {
  }
}

class PlanetControl {
  constructor(game, team) {
    this.game = game;
    this.team = team;
    this.selectStart = null;
    this.target = null;
  }

  start(mousePos) {
    this.selectStart = this.game.getPlanet(mousePos);
    if (this.selectStart.team !== this.team) {
      // Player can only command planets they own.
      this.selectStart = null;
      return;
    }
    this.mousePos = mousePos;
    this.target = null;
  }

  move(mousePos) {
    // TODO Check if new planets are added to the selected?
    this.target = this.game.getPlanet(mousePos);
    if (this.target === this.selectStart) {
      // You can't target the same planet you leave from.
      this.target = null;
    }
    this.mousePos = mousePos;
  }

  end(mousePos) {
    if (this.selectStart) {
      let selectEnd = this.game.getPlanet(mousePos);

      if (selectEnd) {
        this.game.moveShips(this.selectStart, selectEnd);
      }
      // Reset the action.
      this.selectStart = null;
      this.mousePos = null;
    }
  }

  update() {
    // No action required for this control.
  }

  draw() {
    if (this.selectStart) {
      let x = this.mousePos.x;
      let y = this.mousePos.y;
      if (this.target) {
        x = this.target.pos.x;
        y = this.target.pos.y;
      }
      stroke('blue');
      strokeWeight(4);
      line(this.selectStart.pos.x, this.selectStart.pos.y, x, y);
    }
  }
}

var mousePos;
var humanControls;
function setup() {

  logger = new Logger();
  game = new PlanetsGame();
  createCanvas(windowWidth, windowHeight);
  logger.debug("Canvas " + windowWidth + ", " + windowHeight);
  window.onblur = function() {
    game.paused = true;
    noLoop();
  }

  game.init();
  game.initTeams(3);

  humanControls = new PlanetControl(game, game.teams[0]);
  game.addControls(humanControls);

  game.addControls(new AiPlanetControls(game, game.teams[1]))
  game.addControls(new AiPlanetControls(game, game.teams[2]))

  mousePos = createVector(0, 0);
  touchPos = createVector(0, 0);
}

function mousePressed() {
  if (game.paused) {
    return;
  }
  mousePos.set(mouseX, mouseY);
  // logger.debug("Mouse Pressed " + logger.vectorf(mousePos));
  humanControls.start(mousePos);
}

function mouseDragged() {
  mousePos.set(mouseX, mouseY);
  // logger.debug("Mouse Drag " + logger.vectorf(mousePos));
  humanControls.move(mousePos);
}

function mouseReleased() {
  if (game.paused) {
    game.paused = false;
    loop();
    return;
  }

  mousePos.set(mouseX, mouseY);
  humanControls.end(mousePos);
}

function draw() {
  background(0);

  game.show();

  logger.draw(windowWidth / 2 - 150, windowHeight - 160);
}
