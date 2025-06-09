
class MountainTileSet {
  constructor(matcher) {
    this.matcher = matcher;
  }

  get(x, y) {
    return this.matcher.getData(x, y);
  }

  doMatching() {
    // Get additional logging during edge detection for debug tiles.
    this.matcher.debug(4, 7);
    this.matcher.debug(5, 7);

    // Read pixels from image to determine what tiles can connect to.
    this.matcher.updateTileEdges();

    // How many pixels were matched, and how far away in color space were they on average.
    let threshold = this.matcher.tileWidth * 550;
    // Do edge detection to join tiles in specific regions.
    this.matcher.detectEdges(this.matcher.getRect(0, 0, 15, 15), threshold, []);

    this.connectRect(0, 0, 5, 6);
    // this.connectRect(6, 0, 9, 6);
    // this.connectRect(0, 7, 3, 11);
    // this.connectRect(0, 12, 3, 15);

    let clusters = this.matcher.findAllClusters();

    // Get all the objects which can go above grass/dirt, should include trees, fences, houses and castle.
    let objects = [];
    for (let [i, cluster] of clusters.entries()) {
      console.log("Cluster", cluster.map(function(i) { return i.name }));
    }

    // This tileset already has an empty image, so use that, but connect it to all transparent edges.
    let empty = this.matcher.getData(0, 0);
    empty.image = null;
    this.matcher.transparentEdges([empty]);

    let available = [];
    for (let tile of this.matcher.allTiles) {
      if (tile === empty) {
        // This tile is isolated, but still allowed.
        available.push(tile);
        continue;
      }
      if (tile.isIsolated()) {
        // Skip isolated tiles.
        continue;
      }
      if (tile.anyEdgeUnconnectable()) {
        // Skip tiles which don't have a connection on some edge.
        continue;
      }
      available.push(tile);
    }
    return [available];
  }

  connectRect(x1, y1, x2, y2) {
    for (let y = y1; y <= y2; y++) {
      for (let x = x1; x <= x2; x++) {
        if (x + 1 <= x2) {
          this.matcher.connectX(this.get(x, y), this.get(x + 1, y));
        }
        if (y + 1 <= y2) {
          this.matcher.connectY(this.get(x, y), this.get(x, y + 1));
        }
      }
    }
  }
}

function preload() {
  tileset = loadImage('/static/p5/game/tilesets/mountain_landscape.png');
}

let renderer;
function setup() {
  let tilesetMatcher = new TileSetEdgeMatcher(tileset, 32,32, 1);

  let imageSpecificMatcher = new MountainTileSet(tilesetMatcher);
  let layers = imageSpecificMatcher.doMatching();

  // Create a grid, and use the matched tiles to fill it in.
  view = new MapView(20);
  createCanvas(view.getCanvasWidth(), view.getCanvasHeight());

  let useMinimum = true;
  let collapseFunction = new CollapseFunction(35, 25, view, layers, useMinimum);

  try {
    collapseFunction.init();
  } catch (e) {
    console.error("Couldn't init", e);
    // don't try and collapse more.
    collapseFunction.complete = true;
  }
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
