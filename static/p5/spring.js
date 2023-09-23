class Node {
  constructor(pos) {
    this.pos = pos;
    this.vel = createVector(0, 0);
    this.size = 8;
    this.connections = [];
    this.from = [];
    this.fixed = false;
    this.gravity = createVector(0, 10);
    this.mass = 1;
  }

  update() {
    if (this.fixed) {
      // Fixed points don't move for any forces.
      return;
    }

    // Start with some gravity which is a const acceleration.
    // f = ma;
    let force = this.gravity.copy().mult(this.mass);

    // Add some air resistance proportional to velocity squared.
    let resistance = this.vel.copy().setMag(- this.vel.magSq() / 100);
    force.add(resistance);

    // Then add the forces towards the natural length of the connections.
    for (let conn of this.connections) {
      let f = conn.springForce(this);
      force.add(f);
    }

    if (this.pos.y + this.size > 600) {
      if (this.vel.y > 0) {
        this.vel.y *= -.5;
      }
      // Cancel out force and reverse any motion when on the ground.
      let x = -force.x - this.vel.x * 2;
      let y = -force.y + (600 - this.pos.y - this.size);
      force.add(createVector(x, y));
    }

    // a = f / m;
    force.mult(1 / this.mass);
    // delta v = a * t;
    // t is 1/30 due to frameRate.
    // delta v = f * 1/30
    let t = 1 / 10;
    force.mult(t);
    this.vel.add(force);

    // delta x = v * t?
    this.pos.add(this.vel.copy().mult(t));
  }

  addConnection(c) {
    this.connections.push(c);
    if (c.from === this) {
      this.from.push(c);
    }
  }

  alreadyConnected(node) {
    return this.connections.find(function(c) {
      return c.to === node;
    });
  }

  showConnections() {
    for (let conn of this.from) {
      conn.show();
    }
  }

  showForce(color, force) {
    stroke(color);
    // Multiply force by 10 to make sure its visible.
    line(this.pos.x, this.pos.y, this.pos.x + force.x * 10, this.pos.y + force.y * 10);
  }

  showSelected() {
    fill('green');
    if (this.fixed) {
      rect(this.pos.x - this.size, this.pos.y - this.size, this.size * 2, this.size * 2);
    } else {
      circle(this.pos.x, this.pos.y, this.size * 2);
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

    if (this.fixed) {
      // don't show forces on fixed nodes as they don't apply.
      return;
    }
    if (this !== selectedNode) {
      return;
    }
    // Show forces acting on the node.
    strokeWeight(2);
    this.showForce('green', this.gravity);
    let resistance = this.vel.copy().setMag(- this.vel.magSq() / 20);
    this.showForce('cyan', resistance);

    let force = this.gravity.copy().add(resistance)
    for (let conn of this.connections) {
      // Show the full force from each connection.
      let f = conn.springForce(this);
      force.add(f);
      this.showForce('purple', f);
    }

    // Show the total force on the node.
    this.showForce('red', force);
  }
}

class Connection {
  constructor(from, to) {
    this.from = from;
    this.to = to;
    this.rigidity = 5;
    this.length = this.from.pos.dist(this.to.pos);
  }

  springForce(node) {
    // The current actual length of a spring;
    let x = this.to.pos.dist(this.from.pos);
    let off = x - this.length;
    if (Math.abs(off) < 0.01) {
      // No force should apply if the offset is minimal.
      off = 0;
    }
    let forceMag = -this.rigidity * off;
    if (node === this.from) {
      // The direction of the force is based on which node is affected by it.
      return this.from.pos.copy().sub(this.to.pos).setMag(forceMag);
    } else {
      return this.to.pos.copy().sub(this.from.pos).setMag(forceMag);
    }
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
let selectedNode;
let running = false;

function setup() {
  let c = createCanvas(800, 600);
  nodes = [];

  fixedNode = new Node(createVector(400, 100));
  fixedNode.fixed = true;
  nodes.push(fixedNode);

  // Start with the fixed node selected?
  selectedNode = fixedNode;

  c.canvas.oncontextmenu = function() {
    return false;
  }
  window.onblur = function() {
    noLoop();
  }
  window.onfocus = function() {
    loop();
  }
}

function draw() {
  background(color(192, 192, 192));

  for (let node of nodes) {
    node.showConnections();
  }
  for (let node of nodes) {
    node.show();
  }
  if (selectedNode) {
    selectedNode.showSelected();
  }
  if (running) {
    for (let node of nodes) {
      node.update();
    }
  }
}

function keyPressed() {
  if (key === ' ') {
    // Run a frame?
    for (let node of nodes) {
      node.update();
    }
    running = false;
  }
  if (keyCode === ENTER) {
    running = !running;
  }
}

function mouseReleased() {
  if (mouseButton !== LEFT) {
    selectedNode = null;
    return;
  }

  let loc = createVector(mouseX, mouseY);

  // Determine if a node was clicked.
  let clickedNode = null;
  for (let node of nodes) {
    if (loc.dist(node.pos) < 16) {
      clickedNode = node;
    }
  }

  let shift = keyIsDown(16);
  // If there is no node at the click location, create a new one.
  if (!clickedNode) {
    clickedNode = new Node(loc);
    nodes.push(clickedNode);
  }

  if (selectedNode) {
    if (selectedNode.alreadyConnected(clickedNode)) {
      // prevent connecting the same nodes again.
      console.log("prevented adding existing connection")
    } else {
      let c = new Connection(selectedNode, clickedNode);
      selectedNode.addConnection(c);
      clickedNode.addConnection(c);
    }
  }
  // Always select the node at the location which was clicked.
  selectedNode = clickedNode;
}
