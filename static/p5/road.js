class Road {
  constructor(start) {
    this.start = start;
    this.points = [start];
  }

  addPos(p) {
    this.points.push(p);
  }

  show(view) {
    stroke('grey');
    strokeWeight(10);
    let last = view.toScreen(this.start);
    for (let p of this.points) {
      let p2 = view.toScreen(p);
      line(p2.x, p2.y, last.x, last.y);
      last = p2;
    }
  }
}

class RoadControls {
  constructor(game) {
    this.game = game;
    this.view = game.view;
  }

  click() {
    if (mouseButton !== LEFT) {
      selectedNode = null;
      return;
    }

    let loc = createVector(mouseX, mouseY);
    let pos = this.view.toGame(loc);

    // TODO check if you are close to an existing point?
    let clicked = null;
    let clickedRoad = null;
    for (let road of this.game.roads) {
      for (let p of road.points) {
        if (pos.dist(p) < 16) {
          clicked = pos;
          clickedRoad = road;
          break;
        }
      }
      if (clicked) {
        break;
      }
    }

    if (clickedRoad) {
      if (clickedRoad !== this.buildRoad) {
        // TODO clicking on a different road may need it to split the road into 2?
      }
      // Finish the road
      this.buildRoad.addPos(clicked);
      this.buildRoad = null;
    } else if (!this.buildRoad) {
      this.buildRoad = new Road(pos);
      this.game.addRoad(this.buildRoad);
    } else {
      // grow the road.
      // TODO handle the curves?
      this.buildRoad.addPos(pos);
    }

    // Determine if a node was clicked.
    // let clickedNode = null;
    // for (let node of nodes) {
    //   if (loc.dist(node.pos) < 16) {
    //     clickedNode = node;
    //   }
    // }
    //
    // let shift = keyIsDown(16);
    // // If there is no node at the click location, create a new one.
    // if (!clickedNode) {
    //   clickedNode = new Node(loc);
    //   nodes.push(clickedNode);
    // }
    //
    // if (selectedNode) {
    //   if (selectedNode.alreadyConnected(clickedNode)) {
    //     // prevent connecting the same nodes again.
    //     console.log("prevented adding existing connection")
    //   } else {
    //     let c = new Connection(selectedNode, clickedNode);
    //     selectedNode.addConnection(c);
    //     clickedNode.addConnection(c);
    //   }
    // }
    // // Always select the node at the location which was clicked.
    // selectedNode = clickedNode;
  }

}

class RoadGame {
  constructor(view) {
    this.view =  view;
    this.roads = [];
  }

  addRoad(road) {
    this.roads.push(road);
  }

  update() {

  }

  show() {

    for (let road of this.roads) {
      road.show(this.view);
    }

    this.view.coverEdges();
  }
}

function setup() {
  let view = new MapView(20);
  // 18px is the top div showing nav items.
  view.setScreen(windowWidth, windowHeight - 18);
  let w = view.getCanvasWidth();
  let h = view.getCanvasHeight();
  let c = createCanvas(w, h);
  console.log("setting canvas size", w, h);

  game = new RoadGame(view);

  controls = new RoadControls(game);

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
  background(0);

  game.update();

  game.show();
}

function mouseReleased() {
  controls.click();
}
