/**
 * A javascript class to help use mouse/touch.
 **/
export class SwipeControls {
  constructor(game, controllable) {
    this.game = game;
    this.controllable = controllable;
    // Which unit is currently being controlled (after selection);
    this.controlled = null;
    // How far towards the input source should the display show.
    this.visualScale = 0.5;
    // The maximum size of the visual aid.
    this.max = 200;
    // The actual force applied is scaled down from the visual aid.
    this.scale = 0.2;
    // A visual aid which is smaller than this is considered a non action.
    this.min = 20;
  }

  start(point) {
    console.log("Started action at", point);
    this.currentPoint = point;

    var best = this.controllable[0];
    var bestDis = p5.Vector.dist(point, best.pos);
    for (let controlled of this.controllable) {
      let dis = p5.Vector.dist(point, controlled.pos);
      // TODO could consider missing a target if this dis is too large?
      // How to handle multiple units in a tight space (top aka displayed last should be selected first)?
      if (dis < bestDis) {
        best = controlled;
        bestDis = dis;
      }
    }

    this.controlled = best;
  }

  move(point) {
    // Set this so that the resulting action force can be displayed in draw.
    this.currentPoint = point;
  }

  end(point) {
    // Unset this so that the resulting action is no longer displayed after its been applied.
    this.currentPoint = null;

    let force = p5.Vector.sub(this.controlled.pos, point);
    console.log("Ended action at", point, "with vector", force);
    if (force.mag() < this.min) {
      // Consider this a non action if the force is tiny.
      this.controlled = null;
      return false;
    }

    force.mult(this.visualScale);
    force.limit(this.max);
    // Scale down before applying.
    force.mult(this.scale);

    this.game.applyControl(this.controlled, force);
    this.controlled = null;
    return true;
  }

  update() {
    // this control logic occurs within the interaction methods above.
  }

  draw() {
    if (this.currentPoint) {
      let force = p5.Vector.sub(this.controlled.pos, this.currentPoint);
      force.mult(this.visualScale);
      force.limit(this.max);

      stroke('red');
      strokeWeight(3);
      // Show force in the negative direction to show it towards the controlled object from the source.
      line(this.controlled.pos.x, this.controlled.pos.y, this.controlled.pos.x - force.x, this.controlled.pos.y - force.y);
    }
  }
}

export class SwipeJoystick {

  constructor(game, controllable) {
    this.game = game;
    this.controlled = controllable;
    this.speed = 5;
  }

  start(point) {
    console.log("Started action at", point);
    this.currentPoint = point;
    this.startPoint = point.copy();
  }

  move(point) {
    // Set this so that the resulting action force can be displayed in draw.
    this.currentPoint = point;
  }

  end(point) {
    // Unset this so that the resulting action is no longer displayed after its been applied.
    this.currentPoint = null;
    this.startPoint = null;
  }

  update() {
    if (this.startPoint && this.currentPoint) {
      // this control logic occurs within the interaction methods above.
      let force = this.currentPoint.copy().sub(this.startPoint);
      force.setMag(this.speed);
      // Once per update we control the unit based on the current values.
      this.game.applyControl(this.controlled, force);
    }
  }

  draw() {

    if (this.startPoint) {
      stroke("white");
      strokeWeight(3);
      noFill();
      circle(this.startPoint.x, this.startPoint.y, 40);
    }
    if (this.currentPoint && this.startPoint) {
      let offset = this.currentPoint.copy().sub(this.startPoint);
      offset.setMag(10);
      offset.add(this.startPoint);

      fill('white');
      noStroke()
      circle(offset.x, offset.y, 20);
    }
  }
}