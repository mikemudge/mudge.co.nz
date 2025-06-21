
class TinyTownTileSet {
  constructor(tileset, matcher) {
    this.tileset = tileset;
    this.matcher = matcher;
  }

  get(x, y) {
    return this.matcher.getData(x, y);
  }

  doMatching() {
    // Get additional logging during edge detection for debug tiles.
    // tilesetMatcher.get(0, 10).getData().setDebug("0,10");
    // tilesetMatcher.get(1, 10).getData().setDebug("1,10");

    // Read pixels from image to determine what tiles can connect to.
    this.matcher.updateTileEdges();

    // do a very strict edge matching to just find the near perfect matches.
    this.matcher.detectEdges(this.matcher.allTiles, 100, []);

    this.manualFixes();

    this.matcher.findAllClusters();

    // for (let c of this.matcher.clusters) {
    //   console.log("Finding impossible states in", c)
    //   this.matcher.findImpossibilities(c);
    // }

    // TODO Clustering of edges? (Transitivity?)
    // TODO positional awareness, my north's east is also my east's north.
    // Make sure that tile's which fit here can line up with some of my neighbours?

    this.registerEmpty();

    let layers = this.matcher.getLayers();

    // Default that all objects can go above all ground?
    this.matcher.connectLayersZ(this.matcher.ground, this.matcher.objects)

    return layers;

    // Find clusters after we detect edges, but before we allow transparent/blank connections.
    this.matcher.findAllClusters();

    // TODO should we add some of these items to the map?
    // Any tiles which don't connect to any others.
    console.log("Items", this.matcher.getItems().map(function(i) { return i.name }));

    // The grass/dirt cluster is the ground layer, and is used for vertical joining.
    let grassDirtTiles = layers[0];
    let objects = [];

    for (let t of layers[1]) {
      let sum = 0;
      for (let d of t.getDirectionTiles()) {
        sum += d.length;
      }
      // Ignore items which have no connection to anything.
      if (sum > 0) {
        objects.push(t);
      }
    }

    // This is happening before blank/transparent connections for clustering of trees/fences etc.
    this.manualVertical();

    return [grassDirtTiles, objects];
  }

  manualFixes() {
    // How many pixels were matched, and how far away in color space were they on average.
    let threshold = 16 * 500;
    // Do edge detection to join tiles in specific regions.
    // grass + dirt
    this.matcher.detectEdges(this.matcher.getRect(0, 0, 7, 3), threshold, []);
    // trees
    this.matcher.detectEdges(this.matcher.getRect(3, 0, 11, 2), threshold, ['transparent']);
    // house 1
    this.matcher.removeConnections(this.matcher.getRect(0, 4, 3, 7))
    // this.matcher.detectEdges(this.matcher.getRect(0, 4, 3, 7), threshold, []);
    // house 2
    this.matcher.removeConnections(this.matcher.getRect(4, 4, 7, 7))
    // this.matcher.detectEdges(this.matcher.getRect(4, 4, 7, 7), threshold, []);
    // fence
    this.matcher.detectEdges(this.matcher.getRect(8, 3, 11, 6), threshold, []);
    // castle
    this.matcher.detectEdges(this.matcher.getRect(0, 8, 6, 10), threshold, ['transparent']);

    // disconnect tiles which don't join well.
    this.matcher.removeConnections([
      // Open house doors causing issues.
      // this.get(2, 6),
      // this.get(6, 6),
      this.get(11, 7),
    ]);

    // TODO try to reduce these manual fixes.
    this.fixTrees(6);
    this.fixTrees(9);
    this.fixCastle();
    this.manualHouse(0, 4);
    this.manualHouse(4, 4);
  }

  registerEmpty() {
    // Add an empty tile to the object layer, so there is an option to have nothing above grass.
    let empty = new WFCTile(null, "Empty");
    for (let d = 0; d < 4; d++) {
      empty.setEdgeType(d, "transparent");
    }
    // Empty tile can connect to itself in any direction.
    this.matcher.interchangable([empty]);
    this.matcher.addTile(empty);

    // Connect blank and transparent edges to the empty tile.
    // This means there is always a slight gap between things.
    this.matcher.blankEdges([empty]);
    this.matcher.transparentEdges([empty]);

    return empty;
  }

  manualVertical() {
    let plainGrass = this.get(0, 0);
    let tuffGrass = this.get(1, 0);
    let flowerGrass = this.get(2, 0);
    let stoneGrass = this.get(7, 3);
    let grass = [plainGrass, tuffGrass, flowerGrass, stoneGrass];

    let greenTrees = this.matcher.findCluster(7, 1);
    let yellowTrees = this.matcher.findCluster(10, 1);
    this.matcher.multiConnectZ(grass, greenTrees);
    this.matcher.multiConnectZ(grass, yellowTrees);

    // Castle gates should have dirt beneath.
    this.matcher.connectZ(this.get(0, 2), this.get(3, 10));
    this.matcher.connectZ(this.get(2, 2), this.get(4, 10));

    let allFences = this.matcher.findCluster(8, 3)
    // Manual fence align with grass edges.
    // this.manualFencesOnGrassEdges(grass, allFences);
    // Alternatively just allow fences above grass.
    this.matcher.multiConnectZ(grass, allFences);

    let grassDirtTiles = this.matcher.findCluster(0, 0);
    // TODO layers.
    this.matcher.setDefaultBelow(grassDirtTiles);
  }

  manualFencesOnGrassEdges(grass, allFences) {
    let grassDirtTiles = this.matcher.findCluster(0, 0);
    let dirt = [this.get(1,2)]

    let grassDirtEdges = [];
    for (let t of grassDirtTiles) {
      if (grass.includes(t) || dirt.includes(t)) {
        continue;
      }
      grassDirtEdges.push(t);
    }

    // This causes some impossible state errors when the edge underneath a fence isn't possible?
    for (let x = 0; x < 3; x++) {
      for (let y = 0; y < 3; y++) {
        let fence = this.get(x + 8, y + 3);
        let dirt = this.get(x, y + 1);
        this.matcher.connectZ(dirt, fence);
      }
    }
    // Connect vertical and horizontal fences to dirt/grass edges.
    this.matcher.connectZ(this.get(0, 2), this.get(11, 4));
    this.matcher.connectZ(this.get(2, 2), this.get(11, 4));
    this.matcher.connectZ(this.get(1, 3), this.get(9, 6));
    this.matcher.connectZ(this.get(1, 1), this.get(9, 6));

    // Connect top left corner fence.
    this.matcher.connectZ(this.get(5, 3), this.get(8, 3));
    // Connect top right corner fence.
    this.matcher.connectZ(this.get(6, 3), this.get(10, 3));
    // Connect bottom right corner fence.
    this.matcher.connectZ(this.get(3, 3), this.get(10, 5));
    // Connect bottom left corner fence.
    this.matcher.connectZ(this.get(4, 3), this.get(8, 5));

    this.matcher.connectLayersZ(grassDirtEdges, allFences);
  }

  fixTrees(x) {
    this.matcher.connectX(this.get(x,1), this.get(x + 2,1))
    let treetop = [
      this.get(x + 1,1),
    ];
    let tree = [
      this.get(x,2),
      this.get(x + 1,2),
      this.get(x + 2,2)
    ];
    this.matcher.multiConnectY(treetop, tree);
    let treebottom = [this.get(x + 1, 2)]
    this.matcher.multiConnectY([this.get(x, 0), this.get(x + 2, 0)], treebottom);
  }


  fixCastle() {
    let window = this.get(5, 10);
    let wall = this.get(6, 10);
    // Set wall edges to blank so that they can match anything.
    wall.setEdgeType(1, "blank");
    wall.setEdgeType(3, "blank");
    window.setEdgeType(1, "blank");
    window.setEdgeType(3, "blank");

    let doorTop = [
      this.get(3, 9),
      this.get(4, 9)
    ]
    let doorTop2 = [
      this.get(5, 9),
      this.get(6, 9),
    ]
    let doorBottom = [
      this.get(3, 10),
      this.get(4, 10),
    ]

    this.matcher.connectY(doorTop[0], doorBottom[0]);
    this.matcher.connectY(doorTop[1], doorBottom[1]);
    this.matcher.connectY(doorTop2[0], doorBottom[0]);
    this.matcher.connectY(doorTop2[1], doorBottom[1]);

    // We don't want bottom doors to repeat in the y direction.
    this.matcher.multiDisconnectY(doorBottom, doorBottom);
    // this.connectX(doorBottom[0], doorBottom[1]);
    // Set blank bottom so they can connect to anything under them.
    for (let d of doorBottom) {
      d.setEdgeType(2, "blank")
    }

    let bottomWall = wall.copy();
    // nothing knows about bottomWall?
    // bottomWall does know about things though, because it copied wall.
    this.matcher.addTile(bottomWall);

    this.matcher.connectX(bottomWall, bottomWall);
    this.matcher.disconnectX(bottomWall, wall);
    this.matcher.disconnectX(wall, bottomWall);
    bottomWall.setEdgeType(2, "blank");

    // Iterate through all of wall2's connections and connect them to wall2.
    for (let d = 0; d < 4; d++) {
      let tiles = bottomWall.getDirectionTiles()[d];
      for (let t of tiles) {
        this.matcher.connectDirection(d, bottomWall, t);
      }
    }
    // Reset below, so that this will be connected to all tiles below.
    bottomWall.below = [];

    this.matcher.connectX(bottomWall, doorBottom[0]);
    this.matcher.connectX(doorBottom[1], bottomWall);


    let roof = [
      this.get(0,10),
      this.get(1,10),
      this.get(2,10),
    ];
    let roof2 = [
      this.get(3, 8),
      this.get(4, 8),
      this.get(5, 8),
    ]


    this.matcher.multiConnectY(roof, doorTop);
    this.matcher.multiConnectY(roof, doorTop2);

    this.matcher.multiConnectY(roof2, doorTop);
    this.matcher.multiConnectY(roof2, doorTop2);

    // Using a top wall and bottom wall so its always fixed height of 2.
    this.matcher.multiConnectY(roof, [wall, window]);
    this.matcher.multiConnectY(roof2, [wall, window]);
    this.matcher.multiConnectY([wall, window], [bottomWall]);
  }


  manualHouse(x, y) {
    let decor = this.matcher.getRect(x, y + 3, x + 1, y + 3);
    decor.push(this.get(x + 2, y + 2));
    let layers = [{
      left: this.get(x, y),
      middle: this.get(x + 1, y),
      right: this.get(x + 2, y),
      decor: [this.get(x + 3, y)]
    }, {
      left: this.get(x, y + 1),
      middle: this.get(x + 1, y + 1),
      right: this.get(x + 2, y + 1),
      decor: [this.get(x + 3, y + 1)]
    }, {
      left: this.get(x, y + 2),
      middle: this.get(x + 1, y + 2),
      right: this.get(x + 3, y + 2),
      decor: decor,
      doubleDecor: [this.matcher.getRect(x+2, y + 3, x + 3, y + 3)]
    }];

    this.matcher.connectLayers(layers);
  }
}

function preload() {
  tileset = loadImage('/static/p5/game/tilesets/tinytown_packed.png');
}

let renderer;
function setup() {
  tilesetMatcher = new TileSetEdgeMatcher(tileset, 16,16, 2);

  let imageSpecificMatcher = new TinyTownTileSet(tileset, tilesetMatcher);
  let layers = imageSpecificMatcher.doMatching();

  // Create a grid, and use the matched tiles to fill it in.
  view = new MapView(20);
  createCanvas(view.getCanvasWidth(), view.getCanvasHeight());

  let useMinimum = false;
  let collapseFunction = new CollapseFunction(35, 25, view, layers, useMinimum);

  renderer = new WFCOverlay(tilesetMatcher, collapseFunction);
}

function draw() {
  background(127);

  renderer.update();
  renderer.draw();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight - 18);

  view.setScreen(windowWidth, windowHeight - 18);
}

function keyPressed() {
  view.keys();
}

function keyReleased() {
  view.keys();
}

function mouseWheel(event) {
  view.scale(event.delta);
}

function mouseMoved() {
  renderer.mouseMove(mouseX, mouseY);
}

function mouseReleased() {
  renderer.click(mouseX, mouseY);
}
