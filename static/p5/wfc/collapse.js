class ImpossibleCollapse extends Error {
  constructor(square, possible, allowed) {
    super();
    this.square = square;
    this.possible = possible;
    this.allowed = allowed;
  }
}

class Square {
  constructor(x, y, z) {
    this.pos = createVector(x, y);
    this.z = z;
    this.possible = [];
    this.tile = null;
    this.failed = false;
  }

  update() {

  }

  setPossible(possible) {
    this.possible = possible;
  }
  collapse() {
    if (this.tile) {
      // Already collapsed.
      return;
    }

    this.tile = random(this.possible);
    this.possible = [this.tile];
  }

  getPossibleDirectionTiles() {
    let result = [[], [], [], [], [], []];
    for (let wfcTile of this.possible) {
      let allowedNeighbours = wfcTile.getDirectionTiles();
      for (let d = 0; d < allowedNeighbours.length; d++) {
        // For each possible tile, include its allowed neighbours in each direction.
        for (let t of allowedNeighbours[d]) {
          result[d].push(t);
        }
      }
    }
    return result;
  }
  reducePossible(allowed) {
    if (this.tile) {
      // Already collapsed.
      return false;
    }
    // remove all possible which are not in the set of allowed tiles passed from an adjacent tile.
    let prev = this.possible;
    this.possible = this.possible.filter(function(p) {
      return allowed.includes(p);
    });

    if (this.possible.length === 0) {
      // The provided allowed set reduced this locations possible to nothing.
      throw new ImpossibleCollapse(this, prev, allowed);
    }
    if (this.possible.length === 1) {
      this.tile = this.possible[0];
    }
    // The set of possible is reduced.
    return this.possible.length < prev.length;
  }

  setFailed() {
    this.failed = true;
  }

  up() {
    return this.grid.get(this.pos.x, this.pos.y - 1);
  }
  down() {
    return this.grid.get(this.pos.x, this.pos.y + 1);
  }
  left() {
    return this.grid.get(this.pos.x - 1, this.pos.y);
  }
  right() {
    return this.grid.get(this.pos.x + 1, this.pos.y);
  }

  getLocationString() {
    return this.pos.x + "," + this.pos.y;
  }
}

/* fills in a grid with Square's which collapse to a single tile using the WFCTile joins. */
class CollapseFunction {
  constructor(width, height, layers, useMinimum) {
    this.width = width;
    this.height = height;
    this.tiles = layers;

    this.complete = true;
    // Whether to collapse a tile with the minimum possibility first.
    this.useMinimum = useMinimum;
    this.layers = [];
    for (let i = 0; i < layers.length; i++) {
      this.layers.push(new Grid(width, height));
    }
    // Use the top layer as the interactive (click/hover) one.
    this.mainLayer = this.layers.length - 1;
  }

  reset() {
    this.complete = false;
    for (let layer of this.layers) {
      layer.reset();
    }
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        for (let z = 0; z < this.layers.length; z++) {
          let square = new Square(x, y, z);
          square.setPossible(this.tiles[z]);
          this.layers[z].setTileData(x, y, square);
        }
      }
    }

    // reduce the possibility of all tiles.
    // Just in case any impossible tiles are put in possible as part of setup.
    for (let z = 0; z < this.layers.length; z++) {
      for (let y = 0; y < this.height; y++) {
        for (let x = 0; x < this.width; x++) {
          let t = this.layers[z].getTile(x, y);
          this.reduceWrapper(t);
        }
      }
    }
  }

  getCollapsable(minimum) {
    let currentMin = 1000000;
    let minimalPossible = [];
    let allPossible = [];
    let onePossible = [];
    for (let z = 0; z < this.layers.length; z++) {
      for (let y = 0; y < this.height; y++) {
        for (let x = 0; x < this.width; x++) {
          let t = this.layers[z].getTile(x, y);
          let numPossible = t.getData().possible.length;
          if (t.getData().tile || numPossible === 0) {
            // already collapsed or cannot collapse to anything.
            continue;
          }
          if (numPossible === 1) {
            onePossible.push(t);
          }
          allPossible.push(t)
          if (numPossible < currentMin) {
            minimalPossible = [t];
            currentMin = numPossible;
          } else if (numPossible === currentMin) {
            minimalPossible.push(t);
          }
        }
      }
    }
    if (minimum) {
      return minimalPossible;
    } else {
      if (onePossible.length > 0) {
        // Fill in all the tiles with only one possibility first.
        return onePossible;
      }
      return allPossible;
    }
  }

  update() {
    if (this.complete) {
      return;
    }

    // Collapse will pick a tile from the possible ones.
    let collapsable = this.getCollapsable(this.useMinimum);

    if (collapsable.length > 0) {
      let loc = random(collapsable);
      loc.getData().collapse();
      try {
        this.reduceWrapper(loc);
      } catch (e) {
        loc.getData().setFailed();
        console.log("Failed to fill in", loc);
        console.error(e);
        // Stop filling in.
        this.complete = true;
      }
    } else {
      console.log("All filled in");
      this.complete = true;
    }
  }

  getMainLayer() {
    return this.layers[this.mainLayer];
  }

  getLayers() {
    return this.layers;
  }

  reduceWrapper(loc) {
    // Starting at a location which has been collapsed, reduce the possibilities for all affected tiles.
    let toReduce = [loc]
    while (toReduce.length > 0) {
      let next = [];
      for (let gridLoc of toReduce) {
        // Calls reduce to remove possibilities of, and return the set of affected tiles.
        // Adds them all to the next iteration.
        try {
          for (let x of this.reduce(gridLoc)) {
            next.push(x);
          }
        } catch (error) {
          if (error instanceof ImpossibleCollapse) {
            error.square.setFailed();
            gridLoc.getData().setFailed();
            console.log("Error while collapsing reducing ", gridLoc.getLocationString(),
                "Square", error.square.pos.x + ",", error.square.pos.y + ",", error.square.z, "has its possible set allowed", error.allowed.map(function (a) {
                  return a.name;
                })
            );
          }
          throw error;
        }
      }
      toReduce = next;
    }
  }

  reduce(loc) {
    // Reduce the possibilities of this locations neighbours based on the current state of this location.
    let possibleDirectionTiles = loc.getData().getPossibleDirectionTiles();

    let moreReductionRequired = [];
    // This handles NESW
    let neighbours = loc.getCardinalTiles();
    for (let i = 0; i < neighbours.length; i++) {
      if (this.reduceLocationsPossible(neighbours[i], possibleDirectionTiles[i])) {
        moreReductionRequired.push(neighbours[i]);
      }
    }
    // Some special handling for above/below
    // TODO needs improving
    if (this.layers.length > 1) {
      if (loc.getData().z === 0) {
        let above = this.layers[1].getTile(loc.x, loc.y);
        if (this.reduceLocationsPossible(above, possibleDirectionTiles[4])) {
          moreReductionRequired.push(above);
        }
      } else {
        let below = this.layers[0].getTile(loc.x, loc.y);
        if (this.reduceLocationsPossible(below, possibleDirectionTiles[5])) {
          moreReductionRequired.push(below);
        }
      }
    }
    return moreReductionRequired
  }

  // A tile next to loc changed, and is restricting what loc can be to something within possible.
  reduceLocationsPossible(loc, allowed) {
    if (!loc.getData()) {
      // out of bounds?
      return false;
    }
    // We should never restrict a tile to no options at all.
    if (allowed.length === 0) {
      throw new ImpossibleCollapse(loc.getData(), loc.getData().possible, allowed);
    }
    return loc.getData().reducePossible(allowed);
  }
}
