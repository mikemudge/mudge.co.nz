import {TileSetEdgeMatcher} from "./wfc/tileset.js";
import {MapView} from "./jslib/view.js";
import {CollapseFunction} from "./wfc/collapse.js";
import {WFCOverlay} from "./wfc/renders.js";
import {EAST, SOUTH} from "./wfc/tile.js";

// Max WFCTile.edgeScore allowed for an auto-detected connection — also used by
// TilesetRenderer to colour the borders between spritesheet-adjacent tiles.
const EDGE_SCORE_THRESHOLD = 0.7;

class MountainTileSet {
  constructor(matcher) {
    this.matcher = matcher;
  }

  get(x, y) {
    return this.matcher.getData(x, y);
  }

  doMatching() {
    this.matcher.updateTileEdges();

    this.matcher.setGroundRegion(10, 0, 15, 4);
    this.matcher.setGroundRegion(11, 15, 15, 6);
    this.matcher.setGroundRegion(8, 7, 15, 9);
    this.matcher.setGroundRegion(9, 10, 13, 11);
    this.matcher.setGroundRegion(7, 11, 8, 12);

    this.matcher.detectEdgesByOtsu([], EDGE_SCORE_THRESHOLD);

    this.matcher.forceMatch(2,6, EAST, 3, 6);
    this.matcher.forceMatch(3,6, EAST, 4, 6);

    this.matcher.forceNonMatch(4, 9, SOUTH, 7, 15);
    this.matcher.forceNonMatch(7, 15, EAST, 6, 11);

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

let tileset;
let view;
export function preload() {
  tileset = loadImage('/static/p5/game/tilesets/mountain_landscape.png');
}

let renderer;
export function setup() {
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
  renderer.tilesetRenderer.setEdgeScoreThreshold(EDGE_SCORE_THRESHOLD);
  renderer.addTilesetMatcher(tilesetMatcher, size);
}

export function draw() {
  background(127);

  renderer.update();
  renderer.draw();
}

export function windowResized() {
  resizeCanvas(windowWidth, windowHeight - 18);

  view.setScreen(windowWidth, windowHeight - 18);
}

export function keyPressed() {
  view.keys();
}

export function keyReleased() {
  view.keys();
}

export function mouseWheel(event) {
  view.scale(event.delta);
}

export function mouseMoved() {
  renderer.mouseMove(mouseX, mouseY);
}

export function mouseReleased() {
  renderer.click(mouseX, mouseY);
}
