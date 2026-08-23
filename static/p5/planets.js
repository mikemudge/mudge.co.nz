import {Logger} from "../shared/logger.js";

// Shared with the AI's travel-time estimates, so keep this in sync with Ship.maxSpeed.
const SHIP_SPEED = 1.5;
const SHIP_TRAIL_LENGTH = 20;

// First entry is always the human player's color, see PlanetsGame.buildTeams.
const TEAM_COLORS = ['#D33430', '#34D330', '#3430D3', '#D3A930', '#A930D3'];
const MIN_PLANETS = 6;
const MAX_PLANETS = 20;
const MIN_AI = 1;
const MAX_AI = TEAM_COLORS.length - 1;

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
  constructor(pos, team, target, game) {
    this.r = 8;
    this.team = team;
    this.pos = pos;
    this.target = target;
    this.game = game;
    this.vel = p5.Vector.random2D();
    this.acc = createVector(0, 0);
    this.maxSpeed = SHIP_SPEED;
    this.maxForce = 0.25;
    this.done = false;
    this.trail = [];
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
          this.game.addEffect(new Effect(this.pos, this.team.color, 14, 12));
          if (this.target.shipCount <= 0) {
            // Changes team if the count reaches 0.
            this.target.team = this.team;
            this.game.addEffect(new Effect(this.target.pos, this.team.color, this.target.radius * 1.4, 30));
            this.game.addEffect(new ParticleBurst(this.target.pos, this.team.color, this.target.radius));
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

    this.trail.push(this.pos.copy());
    if (this.trail.length > SHIP_TRAIL_LENGTH) {
      this.trail.shift();
    }
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
    noFill();
    strokeWeight(2);
    // The newest segments are drawn over by the ship's own body below, so most
    // of what's actually visible is the older (lower-alpha) end of the trail -
    // keep it long enough and bright enough that that end still reads clearly.
    for (let i = 0; i < this.trail.length - 1; i++) {
      let alpha = map(i, 0, this.trail.length, 0, 220);
      stroke(red(this.team.color), green(this.team.color), blue(this.team.color), alpha);
      line(this.trail[i].x, this.trail[i].y, this.trail[i + 1].x, this.trail[i + 1].y);
    }

    push();
    translate(this.pos.x, this.pos.y);
    rotate(this.vel.heading());
    stroke(255);
    strokeWeight(1);
    fill(this.team.color);
    triangle(this.r, 0, -this.r * 0.7, this.r * 0.6, -this.r * 0.7, -this.r * 0.6);
    pop();
  }
}

class Team {
  constructor(color) {
    this.color = color;
  }
}

class Effect {
  // A brief fading ring, used to call out ship kills and planet hits.
  constructor(pos, effectColor, maxRadius, duration) {
    this.pos = pos.copy();
    this.effectColor = effectColor;
    this.maxRadius = maxRadius;
    this.duration = duration;
    this.age = 0;
  }

  get done() {
    return this.age >= this.duration;
  }

  update() {
    this.age++;
  }

  show() {
    let t = this.age / this.duration;
    noFill();
    stroke(red(this.effectColor), green(this.effectColor), blue(this.effectColor), 255 * (1 - t));
    strokeWeight(2);
    ellipse(this.pos.x, this.pos.y, this.maxRadius * 2 * t);
  }
}

class ParticleBurst {
  // A scattering of sparks kicked outwards from a planet, used on capture.
  // Scaled by the planet's radius so it reads clearly without flying off past
  // it - speed is derived from distance/duration so the two don't compound.
  constructor(pos, particleColor, radius) {
    this.particleColor = particleColor;
    this.duration = 25 + radius / 4;
    this.age = 0;
    this.size = 3 + radius / 20;
    this.particles = [];
    let count = Math.round(10 + radius / 4);
    for (let i = 0; i < count; i++) {
      // Total travel over the burst's life ends up 1.2-2x the planet's radius
      // (regardless of duration), so particles clear the planet's own edge -
      // same color as the planet, so anything short of that is invisible.
      let speed = random(1.2, 2) * radius / this.duration;
      this.particles.push({
        pos: pos.copy(),
        vel: p5.Vector.random2D().mult(speed),
      });
    }
  }

  get done() {
    return this.age >= this.duration;
  }

  update() {
    this.age++;
    for (let particle of this.particles) {
      particle.pos.add(particle.vel);
    }
  }

  show() {
    // Eased rather than linear, so particles stay bright while still closing
    // in on the planet's edge and only dim once they're clearly past it.
    let alpha = 255 * Math.sqrt(1 - this.age / this.duration);
    noStroke();
    fill(red(this.particleColor), green(this.particleColor), blue(this.particleColor), alpha);
    for (let particle of this.particles) {
      ellipse(particle.pos.x, particle.pos.y, this.size);
    }
  }
}

class PlanetsGame {
  constructor() {
    this.width = windowWidth;
    this.height = windowHeight;
    this.planets = [];
    this.ships = [];
    this.effects = [];
    this.controls = [];
    this.winner = null;
    this.screen = 'menu';
    this.settings = {
      numPlanets: 10,
      aiDifficulties: ['easy', 'hard'],
    };
  }

  init() {
    this.planets = [];
    this.ships = [];
    this.effects = [];

    // 100 * 100 would have radius 10-20.
    // 900 * 900 would have radius 30-60.

    logger.debug("Game Size " + this.width + ", " + this.height);
    let baseRadius = (width * height) ** (1 / 4);
    // Take the 4th root of the area to determine the size of planets.
    // TODO this should scale with numPlanets?

    logger.debug("Base radius " + baseRadius);

    let numPlanets = this.settings.numPlanets;
    for (let i = 0; i < numPlanets; i++) {
      // Randomly choose somewhere between 1 and 2 radius.
      let radius = baseRadius + random(baseRadius);
      let overlap;
      let pos;
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

  buildTeams() {
    // First team is always the human player, see buildControls.
    this.teams = TEAM_COLORS.slice(0, this.settings.aiDifficulties.length + 1).map(c => new Team(color(c)));
    this.humanTeam = this.teams[0];

    let startingPlanets = this.pickSpreadOutPlanets(this.teams.length);
    for (let i = 0; i < this.teams.length; i++) {
      startingPlanets[i].setTeam(this.teams[i]);
    }
  }

  buildControls() {
    this.controls = [];
    this.humanControls = new PlanetControl(this, this.teams[0]);
    this.addControls(this.humanControls);
    for (let i = 0; i < this.settings.aiDifficulties.length; i++) {
      this.addControls(new AiPlanetControls(this, this.teams[i + 1], this.settings.aiDifficulties[i]));
    }
  }

  startGame() {
    this.init();
    this.buildTeams();
    this.buildControls();
    this.winner = null;
    this.screen = 'playing';
  }

  addAi() {
    if (this.settings.aiDifficulties.length < MAX_AI) {
      this.settings.aiDifficulties.push('medium');
    }
  }

  removeAi(index) {
    if (this.settings.aiDifficulties.length > MIN_AI) {
      this.settings.aiDifficulties.splice(index, 1);
    }
  }

  cycleAiDifficulty(index) {
    let order = Object.keys(DIFFICULTY_TARGET_SCORES);
    let next = (order.indexOf(this.settings.aiDifficulties[index]) + 1) % order.length;
    this.settings.aiDifficulties[index] = order[next];
  }

  changePlanetCount(delta) {
    this.settings.numPlanets = constrain(this.settings.numPlanets + delta, MIN_PLANETS, MAX_PLANETS);
  }

  pickSpreadOutPlanets(count) {
    // Farthest-point sampling: start from a random planet, then repeatedly add
    // whichever remaining planet is farthest from the ones already chosen. This
    // keeps starting positions roughly equidistant instead of wherever the first
    // few planets happened to spawn, so no team starts isolated or crowded in.
    let remaining = [...this.planets];
    let chosen = [remaining.splice(floor(random(remaining.length)), 1)[0]];
    while (chosen.length < count && remaining.length > 0) {
      let bestIndex = 0;
      let bestDist = -Infinity;
      for (let i = 0; i < remaining.length; i++) {
        let minDist = Math.min(...chosen.map(planet => p5.Vector.dist(planet.pos, remaining[i].pos)));
        if (minDist > bestDist) {
          bestDist = minDist;
          bestIndex = i;
        }
      }
      chosen.push(remaining.splice(bestIndex, 1)[0]);
    }
    return chosen;
  }

  addControls(controls) {
    this.controls.push(controls);
  }

  addEffect(effect) {
    this.effects.push(effect);
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
      this.ships.push(new Ship(pos, planet1.team, planet2, this));
    }
    planet1.shipCount = 0;
  }

  resolveCombat() {
    // Opposing ships that collide mid-flight cancel each other out 1-to-1,
    // instead of flying past each other to swap planets unopposed.
    for (let i = 0; i < this.ships.length; i++) {
      let shipA = this.ships[i];
      if (shipA.done) {
        continue;
      }
      for (let j = i + 1; j < this.ships.length; j++) {
        let shipB = this.ships[j];
        if (shipB.done || shipB.team === shipA.team) {
          continue;
        }
        if (shipA.pos.dist(shipB.pos) < shipA.r + shipB.r) {
          shipA.done = true;
          shipB.done = true;
          let midpoint = p5.Vector.lerp(shipA.pos, shipB.pos, 0.5);
          this.addEffect(new Effect(midpoint, color(255), 12, 10));
          break;
        }
      }
    }
  }

  show() {
    if (this.screen === 'menu') {
      this.drawMenu();
      return;
    }

    if (!this.winner) {
      for (let control of this.controls) {
        control.update();
      }

      for (let ship of this.ships) {
        ship.update();
      }
      this.resolveCombat();
      // Remove ships which are done.
      for (let i = this.ships.length - 1; i >= 0; i--) {
        if (this.ships[i].done) {
          this.ships.splice(i, 1);
        }
      }

      for (let planet of this.planets) {
        planet.update();
      }

      for (let effect of this.effects) {
        effect.update();
      }
      this.effects = this.effects.filter(effect => !effect.done);

      this.checkGameOver();
    }

    // Render the game. Left frozen on the last frame once there's a winner.
    for (let planet of this.planets) {
      planet.show();
    }
    for (let ship of this.ships) {
      ship.show();
    }
    for (let effect of this.effects) {
      effect.show();
    }

    for (let control of this.controls) {
      control.draw();
    }

    if (this.winner) {
      this.showGameOver();
    }
  }

  checkGameOver() {
    let teamsRemaining = new Set();
    for (let planet of this.planets) {
      if (planet.team) {
        teamsRemaining.add(planet.team);
      }
    }
    // A team with no planets but ships still in flight could yet recapture one.
    for (let ship of this.ships) {
      teamsRemaining.add(ship.team);
    }
    if (teamsRemaining.size === 1) {
      this.winner = [...teamsRemaining][0];
      let label = this.winner === this.humanTeam ? "The player" : "AI " + this.teams.indexOf(this.winner);
      logger.info(label + " is the winner");
    }
  }

  getRestartButtonBounds() {
    let w = 200;
    let h = 60;
    return {x: this.width / 2 - w / 2, y: this.height / 2 + 20, w, h};
  }

  isPointInRestartButton(pos) {
    return this.pointInRect(pos, this.getRestartButtonBounds());
  }

  pointInRect(pos, bounds) {
    return pos.x >= bounds.x && pos.x <= bounds.x + bounds.w && pos.y >= bounds.y && pos.y <= bounds.y + bounds.h;
  }

  drawButton(bounds, label, fillColor = '#3430D3') {
    noStroke();
    fill(fillColor);
    rect(bounds.x, bounds.y, bounds.w, bounds.h, 8);
    fill(255);
    textAlign(CENTER, CENTER);
    textSize(18);
    text(label, bounds.x + bounds.w / 2, bounds.y + bounds.h / 2);
  }

  showGameOver() {
    let didWin = this.winner === this.humanTeam;

    push();
    noStroke();
    fill(0, 0, 0, 180);
    rect(0, 0, this.width, this.height);

    textAlign(CENTER, CENTER);
    fill(255);
    textSize(48);
    text(didWin ? "You Win!" : "You Lose", this.width / 2, this.height / 2 - 40);

    this.drawButton(this.getRestartButtonBounds(), "Play Again", didWin ? '#34D330' : '#D33430');
    pop();
  }

  // Layout for the settings screen, shared by drawMenu (rendering) and
  // handleMenuClick (hit-testing), so the two can never drift apart.
  getMenuLayout() {
    let cx = this.width / 2;
    let layout = {};
    let row = 150;
    layout.planetsMinus = {x: cx - 140, y: row, w: 40, h: 40};
    layout.planetsPlus = {x: cx + 100, y: row, w: 40, h: 40};

    layout.aiSlots = [];
    row += 90;
    for (let i = 0; i < this.settings.aiDifficulties.length; i++) {
      layout.aiSlots.push({
        index: i,
        difficulty: {x: cx - 140, y: row, w: 220, h: 44},
        remove: {x: cx + 100, y: row, w: 40, h: 44},
      });
      row += 56;
    }
    layout.addAi = {x: cx - 140, y: row, w: 280, h: 44};
    row += 90;
    layout.start = {x: cx - 100, y: row, w: 200, h: 60};
    return layout;
  }

  drawMenu() {
    background(20);
    let layout = this.getMenuLayout();

    fill(255);
    textAlign(CENTER, CENTER);
    textSize(40);
    text("Planets", this.width / 2, 70);

    textSize(24);
    text("Planets: " + this.settings.numPlanets, this.width / 2, layout.planetsMinus.y + layout.planetsMinus.h / 2);
    this.drawButton(layout.planetsMinus, "-");
    this.drawButton(layout.planetsPlus, "+");

    for (let slot of layout.aiSlots) {
      let difficulty = this.settings.aiDifficulties[slot.index];
      noStroke();
      fill(TEAM_COLORS[slot.index + 1]);
      ellipse(slot.difficulty.x - 24, slot.difficulty.y + slot.difficulty.h / 2, 24);
      this.drawButton(slot.difficulty, "AI " + (slot.index + 1) + ": " + difficulty);
      this.drawButton(slot.remove, "x", '#D33430');
    }

    this.drawButton(layout.addAi, "+ Add opponent");
    this.drawButton(layout.start, "Start Game", '#34D330');
  }

  handleMenuClick(pos) {
    let layout = this.getMenuLayout();
    if (this.pointInRect(pos, layout.planetsMinus)) {
      this.changePlanetCount(-1);
      return;
    }
    if (this.pointInRect(pos, layout.planetsPlus)) {
      this.changePlanetCount(1);
      return;
    }
    if (this.pointInRect(pos, layout.addAi)) {
      this.addAi();
      return;
    }
    if (this.pointInRect(pos, layout.start)) {
      this.startGame();
      return;
    }
    for (let slot of layout.aiSlots) {
      if (this.pointInRect(pos, slot.difficulty)) {
        this.cycleAiDifficulty(slot.index);
        return;
      }
      if (this.pointInRect(pos, slot.remove)) {
        this.removeAi(slot.index);
        return;
      }
    }
  }
}

// riskTolerance is rolled freely (see resetPersonality) so AIs keep a distinct
// personality even within one difficulty tier; patience is then chosen to make
// up the rest of the difficulty tier's target score.
const RISK_TOLERANCE_RANGE = [1.1, 2.2];
const PATIENCE_RANGE = [60, 240];
const BOLDNESS_RANGE = [0.5, 2];
// Overall difficulty score (0 = harmless, 1 = relentless) each tier aims for.
const DIFFICULTY_TARGET_SCORES = {
  easy: [0.1, 0.3],
  medium: [0.4, 0.6],
  hard: [0.65, 0.8],
  extreme: [0.85, 0.95],
};

class AiPlanetControls {
  constructor(game, team, difficulty = 'medium') {
    this.game = game;
    this.team = team;
    this.resetPersonality(difficulty);
  }

  resetPersonality(difficulty = this.difficulty || 'medium') {
    this.difficulty = difficulty;
    let [minTarget, maxTarget] = DIFFICULTY_TARGET_SCORES[difficulty] || DIFFICULTY_TARGET_SCORES.medium;
    let targetScore = random(minTarget, maxTarget);

    // How much bigger a defense needs to be, relative to us, before we back off.
    this.riskTolerance = random(...RISK_TOLERANCE_RANGE);
    // Normalize to 0 (cautious) .. 1 (reckless), the risk half of the difficulty score.
    let riskiness = 1 - (this.riskTolerance - RISK_TOLERANCE_RANGE[0]) / (RISK_TOLERANCE_RANGE[1] - RISK_TOLERANCE_RANGE[0]);

    // Average frames between an owned planet's attack decisions, chosen so that
    // combined with riskiness above, the overall difficulty lands in this tier.
    // Keeps reaction time human-ish and staggers attacks instead of firing them all at once.
    let patienceFactor = constrain(2 * targetScore - riskiness, 0, 1); // 0 (slow) .. 1 (fast)
    this.patience = PATIENCE_RANGE[1] - patienceFactor * (PATIENCE_RANGE[1] - PATIENCE_RANGE[0]);

    // How willing we are to send ships a long way rather than sticking close to home.
    // Purely a play-style flavor, not tied to difficulty.
    this.boldness = random(...BOLDNESS_RANGE);

    // Team-wide decision cadence, independent of how many planets we own -
    // this is what keeps overall attack tempo from scaling with territory.
    this.nextDecisionIn = random(this.patience);
  }

  update() {
    this.nextDecisionIn--;
    if (this.nextDecisionIn > 0) {
      return;
    }
    this.nextDecisionIn = random(this.patience * 0.5, this.patience * 1.5);
    this.considerTeamAttack();
  }

  // Evaluates every owned planet ganging up on one target, nearest first, and
  // stops adding contributors as soon as their combined force is enough - a
  // single planet may be too weak, but several together (like a human
  // multi-selecting sources) can still take down a strong defender.
  evaluateCoalitionAttack(sources, target) {
    let ordered = [...sources].sort((a, b) => p5.Vector.dist(a.pos, target.pos) - p5.Vector.dist(b.pos, target.pos));
    if (ordered.length === 0) {
      return {viable: false};
    }

    // The nearest planet anchors the distance/defense estimate, since it's
    // the primary attacker and the first to arrive.
    let primary = ordered[0];
    let dis = p5.Vector.dist(primary.pos, target.pos);
    let travelFrames = dis / SHIP_SPEED;
    let expectedDefense = target.shipCount;
    if (target.team) {
      // Reinforcements the defender will grow before our ships land, capped at
      // their max - otherwise a maxed-out defender looks like it'll keep growing.
      expectedDefense = Math.min(target.maxShipCount, expectedDefense + travelFrames / target.resetTime);
    }
    // A primary attacker that's already maxed out has nothing to gain by
    // waiting for a bigger edge (it can't grow any further), so it needs
    // proportionally less of a safety margin - otherwise two maxed-out
    // planets can never look safe to attack, since neither can out-grow the other.
    let sourceSlack = primary.shipCount / primary.maxShipCount;
    let requiredMargin = 1 + (this.riskTolerance - 1) * (1 - sourceSlack);

    let contributors = [];
    let combinedForce = 0;
    for (let source of ordered) {
      contributors.push(source);
      combinedForce += source.shipCount;
      if (combinedForce >= expectedDefense * requiredMargin) {
        let surplus = combinedForce - expectedDefense;
        // Prefer big surpluses; boldness controls how much distance discourages a target.
        let value = surplus * 10 - dis / this.boldness;
        return {viable: true, value, target, contributors};
      }
    }
    // Not confident enough of a win, even combining every planet we own.
    return {viable: false};
  }

  considerTeamAttack() {
    let ownedPlanets = this.game.planets.filter(planet => planet.team === this.team);
    if (ownedPlanets.length === 0) {
      return;
    }

    // Pick the single best target opportunity, considering every owned planet
    // as a potential contributor towards taking it.
    let best = -Infinity;
    let bestAttack = null;
    for (let target of this.game.planets) {
      if (target.team === this.team) {
        // Ignore your own planets for now.
        // TODO reinforcements should be considered?
        continue;
      }
      let attack = this.evaluateCoalitionAttack(ownedPlanets, target);
      if (attack.viable && attack.value > best) {
        best = attack.value;
        bestAttack = attack;
      }
    }
    if (!bestAttack) {
      return;
    }
    for (let source of bestAttack.contributors) {
      this.game.moveShips(source, bestAttack.target);
    }
  }

  draw() {
  }
}

class PlanetControl {
  constructor(game, team) {
    this.game = game;
    this.team = team;
    this.attackers = [];
    this.target = null;
  }

  start(mousePos) {
    this.attackers = [];
    this.target = null;
    this.mousePos = mousePos;
    let planet = this.game.getPlanet(mousePos);
    if (planet && planet.team === this.team) {
      this.attackers.push(planet);
    }
  }

  move(mousePos) {
    this.mousePos = mousePos;
    let planet = this.game.getPlanet(mousePos);
    if (planet && planet.team === this.team && !this.attackers.includes(planet)) {
      // Select it the moment we hover it, not only once we've moved past it -
      // attackersExcluding still lets us release on it as the destination instead.
      this.attackers.push(planet);
    }
    // Whatever's under the cursor right now is the live destination preview -
    // releasing here sends from every other selected planet, even one of our
    // own (reinforcements) or one already selected as a source.
    this.target = (planet && this.attackersExcluding(planet).length > 0) ? planet : null;
  }

  // Selected attackers other than the given planet - excludes it even if it
  // was already selected as a source, so wherever you actually release
  // always wins as the destination.
  attackersExcluding(planet) {
    return this.attackers.filter(attacker => attacker !== planet);
  }

  end(mousePos) {
    let selectEnd = this.game.getPlanet(mousePos);
    if (selectEnd) {
      for (let source of this.attackersExcluding(selectEnd)) {
        this.game.moveShips(source, selectEnd);
      }
    }
    // Reset the action.
    this.attackers = [];
    this.target = null;
    this.mousePos = null;
  }

  update() {
    // No action required for this control.
  }

  draw() {
    // Excludes the live target from the sources shown, even if it was already
    // selected as a source, to match what end() would send.
    let sources = this.target ? this.attackersExcluding(this.target) : this.attackers;
    if (sources.length === 0) {
      return;
    }
    let x = this.mousePos.x;
    let y = this.mousePos.y;
    if (this.target) {
      x = this.target.pos.x;
      y = this.target.pos.y;
    }
    noFill();
    stroke('yellow');
    strokeWeight(3);
    for (let attacker of sources) {
      ellipse(attacker.pos.x, attacker.pos.y, attacker.radius * 2 + 10);
    }
    stroke('blue');
    strokeWeight(4);
    for (let attacker of sources) {
      line(attacker.pos.x, attacker.pos.y, x, y);
    }
  }
}

var mousePos;
let logger
let game;
let touchPos;
export function setup() {

  logger = new Logger();
  game = new PlanetsGame();
  createCanvas(windowWidth, windowHeight);
  logger.debug("Canvas " + windowWidth + ", " + windowHeight);
  window.onblur = function() {
    game.paused = true;
    noLoop();
  }

  mousePos = createVector(0, 0);
  touchPos = createVector(0, 0);
}

// Shared by the mouse and touch handlers below, so swipe/tap on mobile goes
// through exactly the same menu/game-over/attack logic as click-drag does.
function pressStart(pos) {
  if (game.paused) {
    return;
  }
  if (game.screen === 'menu') {
    game.handleMenuClick(pos);
    return;
  }
  if (game.winner) {
    if (game.isPointInRestartButton(pos)) {
      // Return to the settings screen rather than an instant rematch, so
      // difficulty/planet-count changes can be made before the next game.
      game.screen = 'menu';
    }
    return;
  }
  game.humanControls.start(pos);
}

function dragMove(pos) {
  if (game.screen !== 'playing' || game.winner) {
    return;
  }
  game.humanControls.move(pos);
}

function pressEnd(pos) {
  if (game.paused) {
    game.paused = false;
    loop();
    return;
  }
  if (game.screen !== 'playing' || game.winner) {
    return;
  }
  game.humanControls.end(pos);
}

export function mousePressed() {
  mousePos.set(mouseX, mouseY);
  pressStart(mousePos);
}

export function mouseDragged() {
  mousePos.set(mouseX, mouseY);
  dragMove(mousePos);
}

export function mouseReleased() {
  mousePos.set(mouseX, mouseY);
  pressEnd(mousePos);
}

export function touchStarted() {
  touchPos.set(touches[0].x, touches[0].y);
  pressStart(touchPos);
  // Avoid a simulated mousePressed event from also firing for this tap.
  return false;
}

export function touchMoved() {
  touchPos.set(touches[0].x, touches[0].y);
  dragMove(touchPos);
  // Prevents the page from scrolling/panning while dragging on the canvas.
  return false;
}

export function touchEnded() {
  // `touches` is already empty by this point, so reuse the last touchPos.
  pressEnd(touchPos);
  return false;
}

export function draw() {
  background(0);

  game.show();

  logger.draw(windowWidth / 2 - 150, windowHeight - 160);
}
