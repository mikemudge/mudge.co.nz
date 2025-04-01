/**
 * A javascript class to help use mouse/touch.
 **/
class SwipeControls {
  constructor(controlled) {
    this.controlled = controlled;
  }

  start(point) {
    console.log("Started action at", point);
    this.currentPoint = point;
    // TODO find a target controllable at point?
  }

  move(point) {
    this.currentPoint = point;
  }

  end(point) {
    this.currentPoint = point;

    let force = p5.Vector.sub(this.controlled.pos, point);
    console.log("Ended action at", point, "with vector", force);

    // TODO apply action should be more generic?
    // limits/scale can be set in the control?

    force.div(10);
    this.controlled.vel.add(force);
    // this.controlled.vel.limit(5);
  }

  update() {
    // this control logic occurs within the interaction methods above.
  }

  draw() {
    if (this.currentPoint) {
      stroke('red');
      strokeWeight(3);
      line(this.controlled.pos.x, this.controlled.pos.y, this.currentPoint.x, this.currentPoint.y);
    }
  }
}

