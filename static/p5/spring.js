class Node {
  constructor(pos) {
    this.pos = pos;
    this.vel = createVector(0, 0);
    this.size = 8;
    this.connections = [];
    this.from = [];
    this.fixed = false;
  }

  update() {
    if (this.fixed) {
      // Fixed points don't move for any forces.
      return;
    }

    stroke(color('cyan'));
    strokeWeight(2);

    // Start with some gravity.
    let force = createVector(0, 10);
    line(this.pos.x, this.pos.y, this.pos.x + force.x * 100, this.pos.y + force.y * 100);
    // Add some air resistance.
    let resistance = this.vel.copy().setMag(- this.vel.magSq() / 20);
    line(this.pos.x, this.pos.y, this.pos.x + resistance.x * 100, this.pos.y + resistance.y * 100);
    force.add(resistance);

    // Then add the forces towards the natural length of the connections.
    for (let conn of this.connections) {
      let f = conn.force(this);
      line(this.pos.x, this.pos.y, this.pos.x + f.x * 100, this.pos.y + f.y * 100);
      force.add(f);
    }
    // Scale the force by the time per frame to calculate the velocity as a distance per frame.
    // delta x = v * delta t
    force.mult(1/30);
    force = conn.energyBasedForce(node, force);
    this.vel.add(force);

    // Show the total force.
    stroke(color('red'));
    line(this.pos.x, this.pos.y, this.pos.x + force.x * 3000, this.pos.y + force.y * 3000);

    // Max speed to avoid the really crazy movements.
    this.vel.limit(5);

    this.pos.add(this.vel);
  }

  addConnection(c) {
    this.connections.push(c);
    if (c.from === this) {
      this.from.push(c);
    }
  }

  showConnections() {
    for (let conn of this.from) {
      conn.show();
    }
  }
  show() {
    noStroke();
    fill(0);
    if (this.fixed) {
      rect(this.pos.x - this.size, this.pos.y - this.size, this.size * 2, this.size * 2);
    } else {
      circle(this.pos.x, this.pos.y, this.size * 2);
    }
  }
}

class Connection {
  constructor(from, to) {
    this.from = from;
    this.to = to;
    this.rigidity = 5;
    this.length = this.from.pos.dist(this.to.pos);
  }

  energyBasedForce(node, f) {
    let diff = this.from.pos.dist(this.to.pos) - this.length;
    let v = node.vel.mag();
    var m = 1;
    // energy;
    // Gravity = m * g * h.
    // Kinetic = 1/2 m * v * v
    // Spring = 1/2 k * x * x

    // determine after with the force applied.
    let nx = (node.x + node.vel.x + f.x);
    let ny = (node.y + node.vel.y + f.y);
    let dh = ny - node.y;
    var dx = createVector(nx, ny).sub(this.from.pos);
    if (this.from === node) {
      dx = createVector(nx, ny).sub(this.to.pos).mult(-1);
    }
    let ndiff = dx - this.length;

    var energyDelta = 0;
    energyDelta += m * 10 * dh;
    energyDelta += 1 / 2 * this.rigidity * (ndiff * ndiff - diff * diff);

    // energyDelta *= 0.9;
    // Calculate how much speed the node can have with energy conserved?
    let nv = Math.sqrt(energyDelta * 2 / m + v * v);
    f.setMag(nv);
    return f;
  }

  force(node) {
    let diff = this.from.pos.dist(this.to.pos) - this.length;

    if (diff < 0) {
      // the connection is shorter than expected.
      // For ropes this would mean 0 tension.
      // return createVector(0,0);
    }
    let directionForce = p5.Vector.sub(this.to.pos, this.from.pos);
    // Determine the magnitude of force based on spring forces f = -kx
    directionForce.setMag(-diff * this.rigidity);

    // If the forces movement will flip direction in the space of a single frame then we should apply less.
    // E.g -kx will be in the opposite direction by the end of this frame.

    if (node === this.from) {
      // If we want the force from the other node's perspective it would be the equal opposite.
      directionForce.mult(-1);
    }

    // Make this a desired speed rather than an applied force.
    // delta = final - initial
    // node.vel is initial
    let desiredSpeed = p5.Vector.sub(directionForce, node.vel);
    // The force must be applied in the direction of the connection.
    // But we can scale it based on how much we are already moving in the right direction.
    directionForce.setMag(desiredSpeed.dot(directionForce));

    return directionForce;
  }
  show() {
    // Green if the length is accurate.
    // Red if the length is stretched or compressed.
    let green = color(0,255,0);
    let red = color(255,0,0);
    // Calculate the absolute difference between the actual and ideal length.
    let diff = (this.from.pos.dist(this.to.pos) - this.length);
    // At 0, amt = 1 - 1/1 is 0 (no stress)
    // As diff increases this approaches 1 (max stress).
    let amt = 1 - (10 / (10 + diff));
    let col = lerpColor(green, red, amt);
    stroke(col);
    strokeWeight(2);
    line(this.from.pos.x, this.from.pos.y, this.to.pos.x, this.to.pos.y);
  }
}

let nodes;
let lastNode;

function setup() {
  createCanvas(800, 600);
  nodes = [];
  lastNode = null;

  fixedNode = new Node(createVector(400, 100));
  fixedNode.fixed = true;
  lastNode = fixedNode;
  nodes.push(fixedNode);
}

function draw() {
  background(color(192, 192, 192));

  for (let node of nodes) {
    node.showConnections();
  }
  for (let node of nodes) {
    node.show();
  }
  for (let node of nodes) {
    node.update();
  }
}

function mouseClicked() {
  let loc = createVector(mouseX, mouseY);
  let currentNode = null;
  for (let node of nodes) {
    if (loc.dist(node.pos) < 16) {
      currentNode = node;
    }
  }
  // If there is no existing node, create a new one.
  if (!currentNode) {
    currentNode = new Node(loc);
    nodes.push(currentNode);
  }

  // Attach a connection to the current node from the last node.
  // TODO need a way to deselect last node?
  // TODO should show last node.
  // TODO prevent connecting the same nodes again.
  if (lastNode) {
    let c = new Connection(lastNode, currentNode);
    lastNode.addConnection(c);
    currentNode.addConnection(c);
  }
  lastNode = currentNode;
}
