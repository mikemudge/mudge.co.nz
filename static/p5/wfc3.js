class Square {
  constructor(x, y, tiles) {
    this.pos = createVector(x, y);
    this.possible = [];
    this.type = null;
    this.tiles = tiles;
    // Initially all tiles are possible.
    for (let i = 0; i < this.tiles.length; i++) {
      this.possible.push(i);
    }
  }

  update() {

  }

  removePossible(dir, patterns) {
    let removalOccured = false;
    // Iterate through the possibilities and remove which don't match a pattern on this side.
    for (let i = this.possible.length - 1; i >= 0; i--) {
      let tile = this.tiles[this.possible[i]];
      if (!patterns.includes(tile[dir])) {
        // Incompatible neighbour.
        this.possible.splice(i, 1);
        removalOccured = true;
      }
    }
    return removalOccured;
  }

  getReversedPatternSet(dir) {
    let set = {};
    for (let possible of this.possible) {
      let tile = this.tiles[possible];
      set[tile[dir].split('').reverse().join('')] = 1;
    }
    return Object.keys(set);
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
    this.type = random(this.possible);
    this.possible = [this.type];
  }

  getPossibleCount() {
    return this.possible.length;
  }

  show(size) {
    if (this.type == null || this.type == -1) {
      fill(255);
      text(this.getPossibleCount(), -5, 0);
      stroke(70);
      noFill();
      rect(-size, -size, size * 2, size * 2);
      return;
    }
    let tile = this.tiles[this.type];
    image(tile[4], -size, -size, size * 2, size * 2);
  }
}

class WFC {
  constructor() {
    this.width = 30;
    this.height = 20;
    this.map = new Grid(this.width, this.height, view.getMapSize());

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
    if (this.complete) {
      return;
    }
    this.time++;
    // Set the type of one square every rate frames.
    if (this.time % this.rate === 0) {
      let best = this.chooseTile();

      if (best) {
        this.collapseTile(best);
      } else {
        console.log("Completed iterating");
        this.complete = true;
      }
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
    for (let y = 0; y < this.map.height; y++) {
      for (let x = 0; x < this.map.width; x++) {
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

  collapseTile(loc) {
    let square = loc.getData();
    if (!square) {
      return;
    }

    square.collapse();
    if (square.type === -1) {
      // Invalid collapse?
      return;
    }

    // console.log("Collapsing", x, y, "as", loc.type)
    let tile = this.tiles[square.type];
    this.reducePossible(loc.north(), 2, tile[0].split('').reverse().join(''));
    this.reducePossible(loc.east(), 3, tile[1].split('').reverse().join(''));
    this.reducePossible(loc.south(), 0, tile[2].split('').reverse().join(''));
    this.reducePossible(loc.west(), 1, tile[3].split('').reverse().join(''));
  }

  reducePossible(tile, dir, pattern) {
    let square = tile.getData();
    if (!square) {
      // This can happen if we hit an edge of the map.
      return;
    }

    if (square.type != null) {
      // Already collapsed, no more reducing possible.
      return;
    }

    let removed = square.removePossible(dir, [pattern]);

    if (removed) {
      // After removing some possibilities we need to propagate.
      // E.g. if SW is the only option above, it limits our left and right options.
      // left must have *S and right must have W* based on matching above.
      this.recursePossible(tile);
    }
  }

  recursePossible(tile) {
    // Iterate all directions
    let dirs = tile.getCardinalTiles();
    for (let dir = 0; dir < 4; dir++) {
      let sq = dirs[dir].getData();
      if (!sq) {
        // Hit an edge.
        continue;
      }
      if (sq.type != null) {
        // This direction is already collapsed.
        continue;
      }
      let opposite = (2 + dir) % 4;
      // Determine the set of patterns in dir, then reduce sq based on what is possible.
      let removed = sq.removePossible(opposite, tile.getData().getReversedPatternSet(dir));
      if (removed) {
        this.recursePossible(dirs[dir]);
      }
    }
  }

  draw() {

    this.view.draw(this.map);

    if (this.selectedTile) {
      let pos = createVector(this.selectedTile.x, this.selectedTile.y).mult(32);
      this.view.showAtPos({
        show: function (size) {
          fill('green');
          circle(-size, -size, 2 * size, 2 * size);
        }
      }, pos);
    }

    this.view.coverEdges();

    let squareHeight = 16;
    let squareWidth = 16;
    // Show all the tiles along the top.
    for (let i = 0; i < this.tiles.length; i++) {
      let x = 20 + (i % 26) * squareWidth;
      let y = this.view.getCanvasHeight() - 90 + Math.floor(i / 26) * squareHeight;
      image(this.tiles[i][4], x, y, squareWidth, squareHeight);
    }
    //
    // grid.draw();
  }
}

function preload() {
  allimages = loadImage('/static/p5/wfc/tileset.png');
}

let wfc = null;
function setup() {
  view = new MapView(32);
  w = view.getCanvasWidth();
  h = view.getCanvasHeight();
  createCanvas(w, h);

  wfc = new WFC(view);

  let edges = [
    ['WW', 'WG', 'GW', 'WW'],
    ['WW', 'WG', 'GG', 'GW'],
    ['WW', 'WW', 'WG', 'GW'],
    ['GG', 'GW', 'WG', 'GG'],
    ['GG', 'GG', 'GW', 'WG'],
    ['DD', 'DG', 'GD', 'DD'],
    ['DD', 'DG', 'GG', 'GD'],
    ['DD', 'DD', 'DG', 'GD'],
    ['GG', 'GD', 'DG', 'GG'],
    ['GG', 'GG', 'GD', 'DG'],
    ['GG', 'GG', 'GG', 'GG'],
    ['GG', 'GG', 'GG', 'GG'],
    ['SS', 'SW', 'WS', 'SS'],
    ['SS', 'SS', 'SW', 'WS'],

    ['WG', 'GG', 'GW', 'WW'],
    ['GG', 'GG', 'GG', 'GG'],
    ['GW', 'WW', 'WG', 'GG'],
    ['GW', 'WG', 'GG', 'GG'],
    ['WG', 'GG', 'GG', 'GW'],
    ['DG', 'GG', 'GD', 'DD'],
    ['GG', 'GG', 'GG', 'GG'],
    ['GD', 'DD', 'DG', 'GG'],
    ['GD', 'DG', 'GG', 'GG'],
    ['DG', 'GG', 'GG', 'GD'],
    ['GG', 'GG', 'GG', 'GG'],
    ['GG', 'GG', 'GG', 'GG'],
    ['SW', 'WS', 'SS', 'SS'],
    ['WS', 'SS', 'SS', 'SW'],

    ['WG', 'GW', 'WW', 'WW'],
    ['GG', 'GW', 'WW', 'WG'],
    ['GW', 'WW', 'WW', 'WG'],
    ['WW', 'WW', 'WW', 'WW'],
    ['DD', 'DD', 'DD', 'DD'],
    ['DG', 'GD', 'DD', 'DD'],
    ['GG', 'GD', 'DD', 'DG'],
    ['GD', 'DD', 'DD', 'DG'],
    ['GG', 'GS', 'SG', 'GG'],
    ['GG', 'GG', 'GS', 'SG'],
    ['WW', 'WD', 'DW', 'WW'],
    ['WW', 'WD', 'DD', 'DW'],
    ['WW', 'WW', 'WD', 'DW'],
    ['WW', 'WS', 'SW', 'WW'],
    ['WW', 'WS', 'SS', 'SW'],
    ['WW', 'WW', 'WS', 'SW'],

    ['BB', 'BG', 'GB', 'BB'],
    ['BB', 'BG', 'GG', 'GB'],
    ['BB', 'BB', 'BG', 'GB'],
    ['BB', 'BB', 'BB', 'BB'],
    ['SS', 'SS', 'SS', 'SS'],
    ['SS', 'SG', 'GS', 'SS'],
    ['SS', 'SG', 'GG', 'GS'],
    ['SS', 'SS', 'SG', 'GS'],
    ['GS', 'SG', 'GG', 'GG'],
    ['SG', 'GG', 'GG', 'GS'],
    ['WD', 'DD', 'DW', 'WW'],
    ['DD', 'DD', 'DD', 'DD'],
    ['DW', 'WW', 'WD', 'DD'],
    ['WS', 'SS', 'SW', 'WW'],
    ['SS', 'SS', 'SS', 'SS'],
    ['SW', 'WW', 'WS', 'SS'],

    ['BG', 'GG', 'GB', 'BB'],
    ['GG', 'GG', 'GG', 'GG'],
    ['GB', 'BB', 'BG', 'GG'],
    ['GG', 'GB', 'BG', 'GG'],
    ['GG', 'GG', 'GB', 'BG'],
    ['SG', 'GG', 'GS', 'SS'],
    ['GG', 'GG', 'GG', 'GG'],
    ['GS', 'SS', 'SG', 'GG'],
    ['DD', 'DW', 'WD', 'DD'],
    ['DD', 'DD', 'DW', 'WD'],
    ['WD', 'DW', 'WW', 'WW'],
    ['DD', 'DW', 'WW', 'WD'],
    ['DW', 'WW', 'WW', 'WD'],
    ['WS', 'SW', 'WW', 'WW'],
    ['SS', 'SW', 'WW', 'WS'],
    ['SW', 'WW', 'WW', 'WS'],

    ['BG', 'GB', 'BB', 'BB'],
    ['GG', 'GB', 'BB', 'BG'],
    ['GB', 'BB', 'BB', 'BG'],
    ['GB', 'BG', 'GG', 'GG'],
    ['BG', 'GG', 'GG', 'GB'],
    ['SG', 'GS', 'SS', 'SS'],
    ['GG', 'GS', 'SS', 'SG'],
    ['GS', 'SS', 'SS', 'SG'],
    ['DW', 'WD', 'DD', 'DD'],
    ['WD', 'DD', 'DD', 'DW']
  ]

  // Split the large image up into tiles, using the edge data above.
  let widths = [14, 14, 16, 16, 16, 10];
  let squareHeight = 16;
  let squareWidth = 16;

  tiles = [];
  let i = 0;
  for (var y = 0; y < widths.length; y += 1) {
    for (var x = 0; x < widths[y]; x += 1) {
      let img = allimages.get(x * squareWidth, y * squareHeight, squareWidth, squareHeight);
      let a = edges[i];
      i++;
      tiles.push([a[0], a[1], a[2], a[3], img, 0]);
    }
  }

  wfc.load(tiles)
}

function draw() {
  background(0);

  wfc.update();

  wfc.draw();
}

function mouseWheel(event) {
  view.scale(event.delta);
}

function mouseReleased() {
  wfc.click();
}
