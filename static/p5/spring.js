import {Util} from "./jslib/util.js";

class Node {
  constructor(game, pos) {
    this.game = game;
    this.pos = pos;
    this.vel = createVector(0, 0);
    this.size = 8;
    this.connections = [];
    this.from = [];
    this.fixed = false;
    this.gravity = createVector(0, 10);
    this.mass = 1;
  }

  calculateEnergy() {

    // Spring potential energy is
    // PE = ½kx²

    // GPE
    return this.mass * this.gravity.mag() * -this.pos.y
    // KE
        + .5 * this.mass * this.vel.magSq();
  }

  computeForce(time) {
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
    // This must be computed from every node's position *before* any node
    // moves this step, otherwise the two ends of a spring disagree about
    // where the other end was and Newton's third law breaks down - that
    // asymmetry pumps energy into the system, more so the more nodes/
    // connections there are.
    for (let conn of this.connections) {
      let f = conn.springForce(this, time);
      force.add(f);
    }

    this.force = force;
  }

  applyForce(t) {
    if (this.fixed) {
      return;
    }

    let force = this.force;

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
    force.mult(t);
    this.vel.add(force);

    // gravity overwhelms this, but then the ground cancels it out.
    if (this.vel.mag() < this.game.staticFriction) {
      // If the friction force is greater than the speed, the object stops moving.
      this.vel.set(0, 0);
    } else {
      // Otherwise we apply some kinetic friction to slow down the object.
      this.vel.add(this.vel.copy().setMag(-this.game.kineticFriction));
    }

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
      conn.show(this.game.debug);
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
  }

  showForces(time) {
    if (this.fixed) {
      // don't show forces on fixed nodes as they don't apply.
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
      let f = conn.springForce(this, time);
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
    this.amplitude = 0;
    this.period = 100;
  }

  springForce(node, time) {
    // The current actual length of a spring;
    let x = this.to.pos.dist(this.from.pos);

    let expectedLength = this.length + Math.sin(time / this.period) * this.amplitude;
    this.stress = x - expectedLength;
    if (Math.abs(this.stress) < 0.01) {
      // No force should apply if the offset is minimal?
      this.stress = 0;
    }
    let forceMag = -this.rigidity * this.stress;
    if (node === this.from) {
      // The direction of the force is based on which node is affected by it.
      return this.from.pos.copy().sub(this.to.pos).setMag(forceMag);
    } else {
      return this.to.pos.copy().sub(this.from.pos).setMag(forceMag);
    }
  }

  show(debug) {
    if (debug) {
      // Green if the length is accurate.
      // Red if the length is stretched or compressed.
      let green = color(0,255,0);
      let red = color(255,0,0);
      // At 0, amt = 1 - 1/1 is 0 (no stress)
      // As diff increases this approaches 1 (max stress).
      let amt = 1 - (10 / (10 + this.stress));
      stroke(lerpColor(green, red, amt));
    } else {
      stroke(0);
    }
    strokeWeight(2);
    line(this.from.pos.x, this.from.pos.y, this.to.pos.x, this.to.pos.y);
  }
}

class SpringGame {
  constructor() {
    this.running = false;
    // Add an initial fixed node to connect to.
    let fixedNode = new Node(this, createVector(400, 100));
    fixedNode.fixed = true;
    this.nodes = [fixedNode];
    // Start with the fixed node selected?
    this.selectedNode = fixedNode;
    this.kineticFriction = 0.01;
    this.staticFriction = 0.05;
    this.time = 0;
    // Number of physics substeps per frame. Splitting the (fixed) frame
    // step into smaller substeps keeps the integrator stable even when
    // several springs stack up on one node and raise its effective
    // stiffness.
    this.substeps = 8;
    // Toggled with 'd'; shows the per-force debug vectors on the selected node.
    this.debug = false;

    // TODO "clear/reset" button.
  }

  step() {
    this.time++;
    let dt = (1 / 10) / this.substeps;
    for (let i = 0; i < this.substeps; i++) {
      // Two passes: compute every node's force from the current frozen
      // state, then apply them all. Doing compute-then-apply per node
      // instead would make each spring's force depend on update order.
      for (let node of this.nodes) {
        node.computeForce(this.time);
      }
      for (let node of this.nodes) {
        node.applyForce(dt);
      }
    }
  }

  draw() {
    if (this.running) {
      this.step();

      let totalEnergy = 0;
      for (let node of this.nodes) {
        totalEnergy += node.calculateEnergy();
      }

      noStroke();
      fill(0);
      text("Energy: " + totalEnergy, 5, 15);
    }

    // Show connections first, so that nodes are rendered on top.
    for (let node of this.nodes) {
      node.showConnections();
    }
    for (let node of this.nodes) {
      node.show();
    }
    if (this.selectedNode) {
      if (this.debug) {
        this.selectedNode.showForces(this.time);
      }
      this.selectedNode.showSelected();
      this.showNode(this.selectedNode);
    }
  }

  showNode(node) {
    noStroke();
    fill(0);
    text("Pos: " + Util.vectorString(node.pos), 5, 30);
    text("Vel: " + Util.vectorString(node.vel), 5, 45);
  }

  keyPressed(key) {
    if (key === ' ') {
      // Run a frame?
      this.step();
      this.running = false;
    }
    if (key === 'd') {
      this.debug = !this.debug;
    }
    if (keyCode === ENTER) {
      this.running = !this.running;
    }
    if (keyCode === ESCAPE) {
      this.selectedNode = null;
    }
  }

  getNodeAt(pos) {
    // Determine if a node was clicked.
    let clickedNode = null;
    for (let node of this.nodes) {
      if (pos.dist(node.pos) < 16) {
        clickedNode = node;
      }
    }
    return clickedNode;
  }

  click(mousePos, mouseButton) {
    if (mouseButton !== LEFT) {
      this.selectedNode = null;
      return;
    }

    let clickedNode = this.getNodeAt(mousePos);
    // If there is no node at the click location, create a new one.
    if (!clickedNode) {
      clickedNode = new Node(this, mousePos);
      this.nodes.push(clickedNode);
    }

    if (this.selectedNode) {
      if (this.selectedNode.alreadyConnected(clickedNode)) {
        // prevent connecting the same nodes again.
        console.log("prevented adding existing connection")
      } else {
        let c = new Connection(this.selectedNode, clickedNode);
        this.selectedNode.addConnection(c);
        clickedNode.addConnection(c);
      }
    }
    // Always select the node at the location which was clicked.
    this.selectedNode = clickedNode;
  }
}
let game;

export function setup() {
  let c = createCanvas(800, 600);
  c.canvas.oncontextmenu = function() {
    return false;
  }
  window.onblur = function() {
    noLoop();
  }
  window.onfocus = function() {
    loop();
  }

  game = new SpringGame();
}

export function draw() {
  background(192);

  game.draw();
}

export function keyPressed() {
  game.keyPressed(key);
}

export function mouseReleased() {
  let loc = createVector(mouseX, mouseY);
  game.click(loc, mouseButton);
}
