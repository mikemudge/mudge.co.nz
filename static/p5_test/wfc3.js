import {Grid} from "../p5/jslib/grid.js";
import {MapView} from "../p5/jslib/view.js";

class Square {
  constructor(x, y, tiles) {
    this.pos = createVector(x, y);
    this.possible = [];
    this.type = null;
    this.tiles = tiles;
    // Initially all tiles are possible.
    for (let i = 0; i < this.tiles.length; i++) {
      if (this.tiles[i].likelihood > 0) {
        this.possible.push(i);
      }
    }
    this.patterns = [[], [], [], []];
    this.calcReversedPatternSet();
    this.debugCollapseType = false;
    this.debugPossible = true;
  }

  update() {

  }

  removePossible(dir, patterns) {
    let removalOccured = false;
    // Iterate through the possibilities and remove which don't match a pattern on this side.
    for (let i = this.possible.length - 1; i >= 0; i--) {
      let tile = this.tiles[this.possible[i]];
      if (!patterns.includes(tile.getPattern(dir))) {
        // Incompatible neighbour.
        this.possible.splice(i, 1);
        removalOccured = true;
      }
    }
    if (removalOccured) {
      // Recalculate what possible patterns you can support.
      this.calcReversedPatternSet();
    }
    return removalOccured;
  }

  calcReversedPatternSet() {
    let set = [{}, {}, {}, {}];
    for (let possible of this.possible) {
      let tile = this.tiles[possible];
      for (let d = 0; d < 4; d++) {
        let pattern = tile.reversePattern(d);
        set[d][pattern] = 1;
      }
    }
    for (let d = 0; d < 4; d++) {
      this.patterns[d] = Object.keys(set[d]);
    }
  }

  getReversedPatternSet(dir) {
    return this.patterns[dir];
  }

  collapse() {
    if (this.type != null) {
      // Already collapsed.
      return;
    }
    if (this.possible.length === 0) {
      console.error("No possible tiles", this);
      this.type = -1;
      return;
    }
    // TODO use possible tiles weight to sway this randomness.
    let opts = [];
    for (let i = 0; i < this.possible.length; i++) {
      let t = this.tiles[this.possible[i]];
      for (let ii = 0; ii < t.likelihood; ii++) {
        opts.push(this.possible[i]);
      }
    }
    this.type = random(opts);
    this.possible = [this.type];
    this.calcReversedPatternSet();
  }

  getPossibleCount() {
    return this.possible.length;
  }

  show(size) {
    if (this.type == null || this.type == -1) {
      if (this.debugPossible) {
        fill(255);
        text(this.getPossibleCount(), -5, 0);
      }
      stroke(70);
      noFill();
      rect(0, 0, size, size);
      return;
    }
    let tile = this.tiles[this.type];
    image(tile.img, 0, 0, size, size);

    // Show what this collapsed to
    if (this.debugCollapseType) {
      fill(255);
      text(this.type, -5, 0);
    }
  }
}

/* Represents a tile which can be selected for a square in the grid. */
class WFCTile {
  constructor(patterns) {
    this.likelihood = 1;
    this.tags = [];
    // Array of size 4 (NESW) with the edge patterns which this tile has.
    this.patterns = patterns;
  }

  setImage(img) {
    this.img = img;
  }

  getPattern(dir) {
    return this.patterns[dir];
  }
  reversePattern(dir) {
    return this.patterns[dir].split('').reverse().join('');
  }

  hasPattern(match) {
    return this.patterns.join('').includes(match);
  }

  isEdge() {
    // Which are edges?
    // tiles one way but not the other
    let verticalTiling = this.reversePattern(0) === this.getPattern(2);
    let horizontalTiling = this.reversePattern(1) === this.getPattern(3);

    if (verticalTiling && !horizontalTiling) {
      return true;
    }
    if (!verticalTiling && horizontalTiling) {
      return true;
    }
    return false;
  }
}

class WFC {
  constructor() {
    this.width = 40;
    this.height = 40;
    this.map = new Grid(this.width, this.height);

    this.view = view;
    this.view.setCenter(createVector(this.width, this.height).mult(view.getMapSize() / 2));

    this.time = 0;
    // How many frames between collapses.
    this.rate = 1;
  }

  load(tiles) {
    this.tiles = tiles;
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        let square = new Square(x, y, this.tiles);
        this.map.setTileData(x, y, square);
      }
    }
  }

  update() {
    view.update();
    if (this.complete) {
      return;
    }
    this.time++;
    // Set the type of two squares every rate frames.
    if (this.time % this.rate === 0) {
      this.collapseBestTile();
      this.collapseBestTile();
    }
  }

  collapseBestTile() {
    let best = this.chooseTile();

    if (best) {
      best.getData().collapse();
      // console.log("Collapsing", tile.x, tile.y, "as", tile.getData().type)
      let reduceTiles = best.getCardinalTiles();
      while(reduceTiles.length > 0) {
        let next = [];
        for (let tile of reduceTiles) {
          if (this.reduceTile(tile)) {
            next = next.concat(tile.getCardinalTiles());
          }
        }
        reduceTiles = next;
      }
    } else {
      console.log("Completed iterating");
      this.complete = true;
    }
  }

  click() {
    if (this.reduceTiles && this.reduceTiles.length > 0) {
      // propagate?
      let next = [];
      for (let tile of this.reduceTiles) {
        if (this.reduceTile(tile)) {
          next = next.concat(tile.getCardinalTiles());
        }
      }
      this.reduceTiles = next;
    } else {
      // Choose a tile.
      let tile = this.chooseTile();
      if (!tile) {
        console.log("No more tiles available for collapsing");
      } else {
        tile.getData().collapse();
        console.log("Collapsing", tile.x, tile.y, "as", tile.getData().type)
        this.reduceTiles = tile.getCardinalTiles();
      }
    }
  }

  chooseTile() {
    let seenAtCurrentBest = 0;
    let best = null;
    for (let y = 0; y < this.map.getHeight(); y++) {
      for (let x = 0; x < this.map.getWidth(); x++) {
        let opt = this.map.getTile(x, y);
        if (opt.getData().type != null) {
          // Already collapsed
          continue;
        }
        if (!best) {
          // Just choose the first thing we see if we haven't got anything yet.
          seenAtCurrentBest = 1;
          best = opt;
        }
        if (opt.getData().getPossibleCount() === best.getData().getPossibleCount()) {
          // If things are equal choose the new option with a diminishing chance.
          // With a 2nd thing 1/2 chance, with a 3rd thing 1/3 chance.
          // The net result is all possible best things could be chosen uniformly.
          seenAtCurrentBest++;
          if (Math.random() < 1 / seenAtCurrentBest) {
            best = opt;
          }
        } else if (opt.getData().getPossibleCount() > 0 && opt.getData().getPossibleCount() < best.getData().getPossibleCount()) {
          // This is better than others, and it's the first time we have seen anything this good.
          seenAtCurrentBest = 1;
          best = opt;
        }
      }
    }
    return best;
  }

  reduceTile(tile) {
    let removed = false;
    let dirs = tile.getCardinalTiles();
    for (let dir = 0; dir < 4; dir++) {
      let sq = dirs[dir].getData();
      if (!sq) {
        // Hit an edge.
        continue;
      }
      let opposite = (2 + dir) % 4;
      removed |= tile.getData().removePossible(dir, sq.getReversedPatternSet(opposite));
    }
    return removed;
  }

  draw() {
    this.view.draw(this.map);

    this.view.coverEdges();

    let squareHeight = 16;
    let squareWidth = 16;
    // Show all the tiles along the top.
    for (let i = 0; i < this.tiles.length; i++) {
      let x = i % 14;
      let y = Math.floor(i / 14);
      if (i === 52 || i === 53) {
        // Two odd cases.
        x -= 2;
      } else if (i >= 38) {
        x = (i - 38) % 16 + 20;
        y = Math.floor((i - 38) / 16);
      }
      x = x * squareWidth + 20;
      y = y * squareHeight + this.view.getCanvasHeight() - 90;
      image(this.tiles[i].img, x, y, squareWidth, squareHeight);
      text(this.tiles[i].likelihood, x + 6, y + 12);
    }
  }
}

let allimages;
let view;
export function preload() {
  allimages = loadImage('/static/p5/wfc/tileset.png');
}

let wfc = null;
export function setup() {
  view = new MapView(32);
  view.createCanvas();

  wfc = new WFC(view);

  let tiles = [
    new WFCTile(['WW', 'WG', 'GW', 'WW']),
    new WFCTile(['WW', 'WG', 'GG', 'GW']),
    new WFCTile(['WW', 'WW', 'WG', 'GW']),
    new WFCTile(['GG', 'GW', 'WG', 'GG']),
    new WFCTile(['GG', 'GG', 'GW', 'WG']),
    new WFCTile(['DD', 'DG', 'GD', 'DD']),
    new WFCTile(['DD', 'DG', 'GG', 'GD']),
    new WFCTile(['DD', 'DD', 'DG', 'GD']),
    new WFCTile(['GG', 'GD', 'DG', 'GG']),
    new WFCTile(['GG', 'GG', 'GD', 'DG']),
    new WFCTile(['GG', 'GG', 'GG', 'GG']),
    new WFCTile(['GG', 'GG', 'GG', 'GG']),
    new WFCTile(['SS', 'SW', 'WS', 'SS']),
    new WFCTile(['SS', 'SS', 'SW', 'WS']),

    new WFCTile(['WG', 'GG', 'GW', 'WW']),
    new WFCTile(['GG', 'GG', 'GG', 'GG']),
    new WFCTile(['GW', 'WW', 'WG', 'GG']),
    new WFCTile(['GW', 'WG', 'GG', 'GG']),
    new WFCTile(['WG', 'GG', 'GG', 'GW']),
    new WFCTile(['DG', 'GG', 'GD', 'DD']),
    new WFCTile(['GG', 'GG', 'GG', 'GG']),
    new WFCTile(['GD', 'DD', 'DG', 'GG']),
    new WFCTile(['GD', 'DG', 'GG', 'GG']),
    new WFCTile(['DG', 'GG', 'GG', 'GD']),
    new WFCTile(['GG', 'GG', 'GG', 'GG']),
    new WFCTile(['GG', 'GG', 'GG', 'GG']),
    new WFCTile(['SW', 'WS', 'SS', 'SS']),
    new WFCTile(['WS', 'SS', 'SS', 'SW']),

    new WFCTile(['WG', 'GW', 'WW', 'WW']),
    new WFCTile(['GG', 'GW', 'WW', 'WG']),
    new WFCTile(['GW', 'WW', 'WW', 'WG']),
    new WFCTile(['WW', 'WW', 'WW', 'WW']),
    new WFCTile(['DD', 'DD', 'DD', 'DD']),
    new WFCTile(['DG', 'GD', 'DD', 'DD']),
    new WFCTile(['GG', 'GD', 'DD', 'DG']),
    new WFCTile(['GD', 'DD', 'DD', 'DG']),
    new WFCTile(['GG', 'GS', 'SG', 'GG']),
    new WFCTile(['GG', 'GG', 'GS', 'SG']),
    new WFCTile(['WW', 'WD', 'DW', 'WW']),
    new WFCTile(['WW', 'WD', 'DD', 'DW']),
    new WFCTile(['WW', 'WW', 'WD', 'DW']),
    new WFCTile(['WW', 'WS', 'SW', 'WW']),
    new WFCTile(['WW', 'WS', 'SS', 'SW']),
    new WFCTile(['WW', 'WW', 'WS', 'SW']),

    new WFCTile(['BB', 'BG', 'GB', 'BB']),
    new WFCTile(['BB', 'BG', 'GG', 'GB']),
    new WFCTile(['BB', 'BB', 'BG', 'GB']),
    new WFCTile(['BB', 'BB', 'BB', 'BB']),
    new WFCTile(['SS', 'SS', 'SS', 'SS']),
    new WFCTile(['SS', 'SG', 'GS', 'SS']),
    new WFCTile(['SS', 'SG', 'GG', 'GS']),
    new WFCTile(['SS', 'SS', 'SG', 'GS']),
    new WFCTile(['GS', 'SG', 'GG', 'GG']),
    new WFCTile(['SG', 'GG', 'GG', 'GS']),
    new WFCTile(['WD', 'DD', 'DW', 'WW']),
    new WFCTile(['DD', 'DD', 'DD', 'DD']),
    new WFCTile(['DW', 'WW', 'WD', 'DD']),
    new WFCTile(['WS', 'SS', 'SW', 'WW']),
    new WFCTile(['SS', 'SS', 'SS', 'SS']),
    new WFCTile(['SW', 'WW', 'WS', 'SS']),

    new WFCTile(['BG', 'GG', 'GB', 'BB']),
    new WFCTile(['GG', 'GG', 'GG', 'GG']),
    new WFCTile(['GB', 'BB', 'BG', 'GG']),
    new WFCTile(['GG', 'GB', 'BG', 'GG']),
    new WFCTile(['GG', 'GG', 'GB', 'BG']),
    new WFCTile(['SG', 'GG', 'GS', 'SS']),
    new WFCTile(['GG', 'GG', 'GG', 'GG']),
    new WFCTile(['GS', 'SS', 'SG', 'GG']),
    new WFCTile(['DD', 'DW', 'WD', 'DD']),
    new WFCTile(['DD', 'DD', 'DW', 'WD']),
    new WFCTile(['WD', 'DW', 'WW', 'WW']),
    new WFCTile(['DD', 'DW', 'WW', 'WD']),
    new WFCTile(['DW', 'WW', 'WW', 'WD']),
    new WFCTile(['WS', 'SW', 'WW', 'WW']),
    new WFCTile(['SS', 'SW', 'WW', 'WS']),
    new WFCTile(['SW', 'WW', 'WW', 'WS']),

    new WFCTile(['BG', 'GB', 'BB', 'BB']),
    new WFCTile(['GG', 'GB', 'BB', 'BG']),
    new WFCTile(['GB', 'BB', 'BB', 'BG']),
    new WFCTile(['GB', 'BG', 'GG', 'GG']),
    new WFCTile(['BG', 'GG', 'GG', 'GB']),
    new WFCTile(['SG', 'GS', 'SS', 'SS']),
    new WFCTile(['GG', 'GS', 'SS', 'SG']),
    new WFCTile(['GS', 'SS', 'SS', 'SG']),
    new WFCTile(['DW', 'WD', 'DD', 'DD']),
    new WFCTile(['WD', 'DD', 'DD', 'DW'])
  ]

  // Split the large image up into tiles, using the edge data above.
  let widths = [14, 14, 16, 16, 16, 10];
  let squareHeight = 16;
  let squareWidth = 16;

  let i = 0;
  for (var y = 0; y < widths.length; y += 1) {
    for (var x = 0; x < widths[y]; x += 1) {
      let img = allimages.get(x * squareWidth, y * squareHeight, squareWidth, squareHeight);
      tiles[i++].setImage(img);
    }
  }

  // TODO base weights on edges?
  // E.g doubles higher?
  // Certain elements higher?
  for (let t of tiles) {
    // TODO categorize tiles as corners/straights etc.
    // And as grass/water/stone/dirt?
    // Then support sliders for each category to increase/decrease chance.


    // Make edges more likely
    if (t.isEdge()) {
      t.likelihood = 10;
    }

    // Make some types of tiles impossible.
    if (t.hasPattern("D") || t.hasPattern("B") || t.hasPattern("S")) {
      t.likelihood = 0;
    }
  }
  //
  // // Set edges more than corners.
  tiles[1].likelihood = 10;
  tiles[14].likelihood = 10;
  tiles[16].likelihood = 10;
  tiles[29].likelihood = 10;
  //
  // // Set weight of grass tile higher.
  tiles[10].likelihood = 0;
  tiles[11].likelihood = 0;
  tiles[15].likelihood = 100;
  tiles[24].likelihood = 0;
  tiles[25].likelihood = 0;
  tiles[61].likelihood = 0;
  tiles[66].likelihood = 0;
  // // And water
  tiles[31].likelihood = 100;

  wfc.load(tiles)
}

export function draw() {
  background(0);

  wfc.update();

  wfc.draw();
}

export function windowResized() {
  resizeCanvas(windowWidth, windowHeight);

  view.setScreen(windowWidth, windowHeight);
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

export function mouseReleased() {
  wfc.click();
}
