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

    // Start with some gravity.
    let force = createVector(0, .1);
    // Add some air resistance.
    let resistance = this.vel.copy().setMag(- this.vel.magSq() / 1000);
    force.add(resistance);

    // Then add the forces towards the natural length of the connections.
    for (let conn of this.connections) {
      let f = conn.force(this);
      force.add(f);
    }
    this.vel.add(force);

    this.vel.mult(0.99);
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
    this.rigidity = 1;
    this.length = this.from.pos.dist(this.to.pos);
  }

  force(node) {
    let diff = (this.from.pos.dist(this.to.pos) - this.length);
    if (node === this.from) {
      return p5.Vector.sub(this.to.pos, this.from.pos).setMag(diff / 10);
    }
    return p5.Vector.sub(this.from.pos, this.to.pos).setMag(diff / 10);
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
    node.update();
  }

  for (let node of nodes) {
    node.showConnections();
  }
  for (let node of nodes) {
    node.show();
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
