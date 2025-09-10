import {Util} from "./lib/util.js";

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

  update(time) {
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
      let f = conn.springForce(this, this.game.time);
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

  show() {
    // Green if the length is accurate.
    // Red if the length is stretched or compressed.
    let green = color(0,255,0);
    let red = color(255,0,0);
    // At 0, amt = 1 - 1/1 is 0 (no stress)
    // As diff increases this approaches 1 (max stress).
    let amt = 1 - (10 / (10 + this.stress));
    let col = lerpColor(green, red, amt);
    stroke(col);
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

    // TODO "clear/reset" button.
  }

  draw() {
    if (this.running) {
      this.time++;
      for (let node of this.nodes) {
        node.update(this.time);
      }

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
      this.selectedNode.showForces(this.time)
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
      this.time++;
      for (let node of this.nodes) {
        node.update(this.time);
      }
      this.running = false;
    }
    if (keyCode === ENTER) {
      this.running = !this.running;
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
