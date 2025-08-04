
class MountainTileSet {
  constructor(matcher) {
    this.matcher = matcher;
  }

  get(x, y) {
    return this.matcher.getData(x, y);
  }

  doMatching() {
    // Get additional logging during edge detection for debug tiles.
    this.matcher.debug(13, 0);
    this.matcher.debug(13, 1);

    // Read pixels from image to determine what tiles can connect to.
    this.matcher.updateTileEdges();

    let threshold = this.matcher.tileWidth * 700;

    // Grass/Stone (ground)
    console.log("Grass/Stone threshold:", threshold);
    let grassStone = this.matcher.getRect(11, 0, 13, 2);
    for (let t of this.matcher.getRect(14, 6, 15, 7)) {
      grassStone.push(t);
    }
    this.matcher.detectEdges(grassStone, threshold, []);

    // Cliffs.
    threshold = this.matcher.tileWidth * 2000;
    this.matcher.detectEdges(this.matcher.getRect(0, 0, 5, 6), threshold, []);
    // this.matcher.detectEdges(this.matcher.getRect(6, 0, 9, 6), threshold, []);

    // Trees
    threshold = this.matcher.tileWidth * 8000;
    this.matcher.detectEdges(this.matcher.getRect(4, 12, 6, 15), threshold, []);
    this.matcher.detectEdges(this.matcher.getRect(7, 13, 8, 15), threshold, []);
    this.matcher.detectEdges(this.matcher.getRect(9, 12, 10, 15), threshold, []);

    // this.manualFixes();

    this.matcher.findAllClusters();

    // This tileset already has an empty image, so use that, but connect it to all transparent edges.
    let empty = this.matcher.getData(0, 0);
    empty.image = null;
    this.matcher.addTile(empty);
    this.matcher.interchangable([empty]);
    this.matcher.transparentEdges([empty]);

    let layers = this.matcher.getLayers();

    // Default that all objects can go above all ground?
    this.matcher.connectLayersZ(layers[0], layers[1]);

    console.log("Layers", layers);

    // How many pixels were matched, and how far away in color space were they on average.
    // Do edge detection to join tiles in specific regions.
    // this.matcher.detectEdges(layers[0], threshold, []);
    // this.matcher.detectEdges(layers[1], threshold, []);

    return layers;
  }
}

function preload() {
  tileset = loadImage('/static/p5/game/tilesets/mountain_landscape.png');
}

let renderer;
function setup() {
  let tilesetMatcher = new TileSetEdgeMatcher(tileset, 32,32);

  let imageSpecificMatcher = new MountainTileSet(tilesetMatcher);
  let layers = imageSpecificMatcher.doMatching();

  // Create a grid, and use the matched tiles to fill it in.
  view = new MapView(20);
  view.createCanvas();
  view.setCenter(createVector(200, 200));

  let useMinimum = true;
  let collapseFunction = new CollapseFunction(35, 25, layers, useMinimum);

  let size = createVector(16, 16);
  renderer = new WFCOverlay(collapseFunction, view, size, tilesetMatcher.tiles);
  renderer.addTilesetMatcher(tilesetMatcher, size);
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
