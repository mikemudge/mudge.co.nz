/* goes through a tileset and creates WFCTile's with possible tiles in each direction */
import {Grid} from "../jslib/grid.js";
import {WFCTile, NORTH, EAST, SOUTH, WEST} from "./tile.js";

export class TileSetEdgeMatcher {

  constructor(tileset, tileWidth, tileHeight) {
    let tilesAcross = tileset.width / tileWidth;
    let tilesDown = tileset.height / tileHeight;
    this.tileWidth = tileWidth;
    this.tileHeight = tileHeight;
    if (tileWidth !== tileHeight) {
      console.warn("non square tiles are not currently well supported");
    }
    this.tiles = new Grid(tilesAcross, tilesDown);
    console.log("Tile set loaded", tilesAcross, tilesDown);
    for (var y = 0; y < tilesDown; y += 1) {
      for (var x = 0; x < tilesAcross; x += 1) {
        let img = tileset.get(x * tileWidth, y * tileHeight, tileWidth, tileHeight);
        let tile = new WFCTile(img, x +"," + y);
        this.tiles.setTileData(x, y, tile);
      }
    }

    this.allTiles = [];
    this.clusters = [];
    this.ground = [];
    this.items = [];
    this.objects = [];
    for (var y = 0; y < this.tiles.getHeight(); y++) {
      for (var x = 0; x < this.tiles.getWidth(); x++) {
        this.allTiles.push(this.tiles.getTile(x, y).getData());
      }
    }

    this.edgeDetectionImage = createImage(this.tileWidth + this.tileWidth, this.tileHeight);
    this.tileEdgeAverage = 0;
    this.totalEdgeAverage = 0;
    console.log("Tiles loaded", this.tiles);
  }

  get(x, y) {
    return this.tiles.getTile(x, y);
  }

  getData(x, y) {
    return this.tiles.getTile(x, y).getData();
  }

  debug(x, y) {
    this.getData(x, y).setDebug(true);
  }

  // Pin a rectangular region of the original tileset (grid coordinates, inclusive) to
  // always be classified as ground — see findAllClusters() for what this guarantees.
  // Call before findAllClusters() runs. Useful for e.g. a strip of solid ground tiles that
  // happen to sit adjacent to a sprite in the sheet and would otherwise get swept into the
  // object layer by the object-connectivity propagation.
  setGroundRegion(x1, y1, x2, y2) {
    for (let tile of this.getRect(x1, y1, x2, y2)) {
      tile.forcedGround = true;
    }
  }

  // Manual overrides for individual pairs that automatic detection got wrong. Coordinates
  // are grid positions in the original tileset (same convention as debug()/getData()); d is
  // NORTH/EAST/SOUTH/WEST (from tile.js), from the (x1,y1) tile's perspective. Call after
  // detectEdgesByOtsu (or whichever detector ran) and before findAllClusters(), so the
  // override is reflected in clustering/ground-object classification too.
  forceMatch(x1, y1, d, x2, y2) {
    this.connectDirection(d, this.getData(x1, y1), this.getData(x2, y2));
  }

  forceNonMatch(x1, y1, d, x2, y2) {
    this.disconnectDirection(d, this.getData(x1, y1), this.getData(x2, y2));
  }

  // d is NORTH/EAST/SOUTH/WEST (from tile.js) — b sits in that direction from a.
  connectDirection(d, a, b) {
    if (d === NORTH) {
      this.connectY(b, a);
    } else if (d === EAST) {
      this.connectX(a, b);
    } else if (d === SOUTH) {
      this.connectY(a, b);
    } else if (d === WEST) {
      this.connectX(b, a);
    }
  }

  disconnectDirection(d, a, b) {
    if (d === NORTH) {
      this.disconnectY(b, a);
    } else if (d === EAST) {
      this.disconnectX(a, b);
    } else if (d === SOUTH) {
      this.disconnectY(a, b);
    } else if (d === WEST) {
      this.disconnectX(b, a);
    }
  }

  multiConnectX(a, b) {
    for (let a1 of a) {
      for (let b1 of b) {
        this.connectX(a1, b1);
      }
    }
  }

  connectX(a, b) {
    a.addRight(b);
    b.addLeft(a);
  }
  disconnectX(a, b) {
    a.removeRight(b);
    b.removeLeft(a);
  }
  multiConnectY(a, b) {
    for (let a1 of a) {
      for (let b1 of b) {
        this.connectY(a1, b1);
      }
    }
  }
  multiDisconnectY(a, b) {
    for (let a1 of a) {
      for (let b1 of b) {
        this.disconnectY(a1, b1);
      }
    }
  }
  disconnectY(a, b) {
    a.removeDown(b);
    b.removeUp(a);
  }
  connectY(a, b) {
    a.addDown(b);
    b.addUp(a);
  }
  multiConnectZ(a, b) {
    for (let a1 of a) {
      for (let b1 of b) {
        this.connectZ(a1, b1);
      }
    }
  }
  connectZ(a, b) {
    a.addAbove(b);
    b.addBelow(a);
  }

  connectLayersZ(ground, objects) {
    for (let t of objects) {
      if (t.below.length === 0) {
        this.multiConnectZ(ground, [t]);
      }
    }
  }

  interchangable(arr) {
    for (let t1 of arr) {
      for (let t2 of arr) {
        this.connectX(t1, t2);
        this.connectY(t1, t2);
      }
    }
  }

  removeConnections(tiles) {
    for (let t of tiles) {
      for (let t1 of t.up) {
        t1.down.splice(t1.down.indexOf(t), 1);
      }
      for (let t1 of t.left) {
        t1.right.splice(t1.right.indexOf(t), 1);
      }
      for (let t1 of t.down) {
        t1.up.splice(t1.up.indexOf(t), 1);
      }
      for (let t1 of t.right) {
        t1.left.splice(t1.left.indexOf(t), 1);
      }
      t.up = [];
      t.down = [];
      t.left = [];
      t.right = [];
    }
  }

  updateTileEdges() {
    // Find edges which look like they join.
    for (let i1 = 0; i1 < this.allTiles.length; i1++) {
      let t1 = this.allTiles[i1];
      t1.image.loadPixels();
      t1.calculateEdges();
      t1.classifyEdges();
      t1.computeInteriorGradient();
    }
  }

  // Uses each tile's position in the spritesheet as a hint: tiles placed near each other
  // by the artist are likely meant to connect. Checks all tiles within `radius` steps
  // (Manhattan distance, default 1 = immediate cardinal neighbours only) and validates
  // each candidate pair with the gradient ratio.
  //
  // This replaces manual tile grouping entirely for most tilesets — the spritesheet
  // layout does the grouping implicitly.
  detectEdgesByPosition(ratioThreshold = 0.8, allowedEdges = [], radius = 1) {
    const w = this.tiles.getWidth();
    const h = this.tiles.getHeight();

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const t1 = this.getData(x, y);
        if (t1.isIsolated()) continue;

        // Only iterate the "forward" half of the neighbourhood to avoid checking
        // each pair twice. dy=0 starts dx at 1 (same row, to the right).
        for (let dy = 0; dy <= radius; dy++) {
          for (let dx = (dy === 0 ? 1 : -radius); dx <= radius; dx++) {
            if (Math.abs(dx) + Math.abs(dy) > radius) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const t2 = this.getData(nx, ny);
            if (t2.isIsolated()) continue;

            const match = [false, false, false, false];
            for (let d = 0; d < 4; d++) {
              const opp = (d + 2) % 4;
              if (this.checkAllowedEdges(d, t1, t2, allowedEdges)) {
                match[d] = true;
                continue;
              }
              if (t1.getEdgeType(d) !== 'colored' && t1.getEdgeType(d) !== 'same') continue;
              if (t2.getEdgeType(opp) !== 'colored' && t2.getEdgeType(opp) !== 'same') continue;
              if (this._compareEdgesGradientRatio(d, t1, t2) <= ratioThreshold) {
                match[d] = true;
              }
            }
            this.connectMatches(match, t1, t2);
          }
        }
      }
    }
  }

  // Like detectEdges but uses the gradient ratio instead of a raw pixel threshold.
  // ratioThreshold is self-normalising across tilesets — 0.8 is a good starting point.
  detectEdgesByGradient(tiles, ratioThreshold, allowedEdges) {
    for (let i1 = 0; i1 < tiles.length; i1++) {
      if (tiles[i1].isIsolated()) continue;
      for (let i2 = i1; i2 < tiles.length; i2++) {
        if (tiles[i2].isIsolated()) continue;
        let match = [false, false, false, false];
        for (let d = 0; d < 4; d++) {
          const opp = (d + 2) % 4;
          if (this.checkAllowedEdges(d, tiles[i1], tiles[i2], allowedEdges)) {
            match[d] = true;
            continue;
          }
          if (tiles[i1].getEdgeType(d) !== 'colored' && tiles[i1].getEdgeType(d) !== 'same') continue;
          if (tiles[i2].getEdgeType(opp) !== 'colored' && tiles[i2].getEdgeType(opp) !== 'same') continue;
          if (this._compareEdgesGradientRatio(d, tiles[i1], tiles[i2]) <= ratioThreshold) {
            match[d] = true;
          }
        }
        this.connectMatches(match, tiles[i1], tiles[i2]);
      }
    }
  }

  detectEdges(tiles, threshold, allowedEdges) {
    // Check if ground tiles can join to each other?
    for (let i1 = 0; i1 < tiles.length; i1++) {
      if (tiles[i1].isIsolated()) {
        // Skip over tiles which are isolated (no cluster)
        continue;
      }
      for (let i2 = i1; i2 < tiles.length; i2++) {
        if (tiles[i2].isIsolated()) {
          // Skip over tiles which are isolated (no cluster)
          continue;
        }
        let match = [0, 0, 0, 0];
        for (let d = 0; d < 4; d++) {
          match[d] = this.edgeMatching(d, tiles[i1], tiles[i2], threshold, allowedEdges);
        }
        this.connectMatches(match, tiles[i1], tiles[i2]);
      }
    }
  }

  connectMatches(match, t1, t2) {
    if (match[0]) {
      this.connectY(t2, t1);
    }
    if (t1 !== t2 && match[2]) {
      this.connectY(t1, t2);
    }
    if (match[3]) {
      this.connectX(t2, t1);
    }
    // If tiles are the same, we already connected them above.
    if (t1 !== t2 && match[1]) {
      this.connectX(t1, t2);
    }
  }

  getLayers() {
    return [this.ground, this.objects];
  }

  findImpossibilities(cluster) {
    for (let t of cluster) {
      // Assume t is the bottom left corner of a 2x2 grid.
      // Search for up/right's which cause impossible states?
      for (let t1 of t.up) {
        // t1 is the top left corner.
        for (let t2 of t1.right) {
          // t2 is the top right corner.
          if (!this.intersection(t2.down, t.right)) {
            // t, t1, t2 makes an impossible situation?
            console.log("Can't do", t, t1, t2);
            this.impossible = [t, t1, t2];
            // While debugging just find the first impossibility.
            return;
          }
        }
      }
    }
  }

  intersection(tiles1, tiles2) {
    return tiles1.filter(value => tiles2.includes(value));
  }

  findAllClusters() {
    this.ground = [];
    this.items = [];
    this.objects = [];
    for (let t of this.allTiles) {
      if (t.cluster) {
        // Already in an existing cluster
        continue;
      }
      // t is not yet in a cluster.
      let cluster = [t];
      t.cluster = cluster;
      let toCluster = [t];
      let iteration = 0;
      while (toCluster.length > 0) {
        let next = [];
        for (let t1 of toCluster) {
          let neighbours = t1.getDirectionTiles();
          for (let tiles of neighbours) {
            for (let t2 of tiles) {
              if (!t2.cluster) {
                t2.cluster = cluster;
                cluster.push(t2);
                next.push(t2);
              }
            }
          }
        }
        toCluster = next;
        iteration++;
      }
      if (cluster.length > 1) {
        this.clusters.push(cluster);
      } else {
        // Solo tiles which have no connections?
        this.items.push(cluster[0]);
      }
    }

    // Classify each tile as ground or objects.
    // A tile with any transparent pixel is definitely an object (a sprite drawn on top of
    // ground). Any tile connected — directly or transitively, via the detected adjacency
    // graph — to an object tile is treated as an object too, since it's effectively part
    // of the same visual thing (e.g. a solid "cap" tile that only ever sits beside a
    // semi-transparent sprite). A tile pinned with setGroundRegion() is excluded from this
    // entirely: it never becomes an object itself, and — just as importantly — propagation
    // never continues through it, so a pinned strip of tiles acts as a firebreak that keeps
    // an unrelated object elsewhere in the tileset from flooding into real ground.
    const isObject = new Set();
    const queue = [];
    for (let t of this.allTiles) {
      if (!t.forcedGround && t.hasTransparentPixel()) {
        isObject.add(t);
        queue.push(t);
      }
    }
    while (queue.length > 0) {
      let t = queue.shift();
      for (let tiles of t.getDirectionTiles()) {
        for (let neighbour of tiles) {
          if (neighbour.forcedGround || isObject.has(neighbour)) continue;
          isObject.add(neighbour);
          queue.push(neighbour);
        }
      }
    }

    for (let cluster of this.clusters) {
      for (let tile of cluster) {
        if (isObject.has(tile)) {
          tile.zLayer = "object";
          this.objects.push(tile);
        } else {
          tile.zLayer = "ground";
          this.ground.push(tile);
        }
      }
    }
    return this.clusters;
  }

  getItems() {
    return this.items;
  }

  findCluster(x, y) {
    let t = this.get(x, y).getData();
    return t.cluster;
  }

  addTile(t) {
    this.allTiles.push(t);
    this.objects.push(t);
  }

  blankEdges(edges) {
    for (let i1 = 0; i1 < this.allTiles.length; i1++) {
      let t1 = this.allTiles[i1];
      for (let d = 0; d < 4; d++) {
        if (t1.getEdgeType(d) === "blank") {
          for (let e of edges) {
            this.connectDirection(d, t1, e);
          }
        }
      }
    }
  }

  transparentEdges(edges) {
    for (let i1 = 0; i1 < this.allTiles.length; i1++) {
      let t1 = this.allTiles[i1];
      for (let d = 0; d < 4; d++) {
        if (t1.getEdgeType(d) === "transparent") {
          for (let e of edges) {
            this.connectDirection(d, t1, e);
          }
        }
      }
    }
  }

  edgeMatching(d, t1, t2, threshold, allowedEdges) {
    let verbose = t1.debug && t2.debug;
    if (t1 === t2) {
      // Don't debug matching with the same tile.
      verbose = false;
    }
    if (this.checkAllowedEdges(d, t1, t2, allowedEdges)) {
      // console.log("Allowed edge match", t1, t2);
      return true;
    }

    // We only do full edge detection on colored/same edges?
    let opp = (d + 2) % 4;
    if (t1.getEdgeType(d) !== "colored" && t1.getEdgeType(d) !== "same") {
      // This detector only works with colored/same edges.
      if (verbose) {
        console.log(t1.name, d, t2.name, "non coloured edges");
      }
      return false;
    }
    if (t2.getEdgeType(opp) !== "colored" && t2.getEdgeType(opp) !== "same") {
      // Don't connect to tiles which are not also colored or same.
      if (verbose) {
        console.log(t1.name, d, t2.name, "non coloured edges");
      }
      return false;
    }

    // Check the color difference
    let diff = this.compareEdgesDifference(d, t1, t2, verbose);
    if (diff < threshold) {
      return true;
    }
    return false;
  }

  checkAllowedEdges(d, t1, t2, allowedEdges) {
    let opp = (d + 2) % 4;
    return allowedEdges.includes(t1.getEdgeType(d)) && t1.getEdgeType(d) === t2.getEdgeType(opp);
  }

  compareEdges(d, t1, t2) {
    // TODO new Edge Detection based check?
    if (d !== EAST) {
      // TODO support other directions?
      return;
    }

    // Load the image's pixels into memory.
    this.edgeDetectionImage.loadPixels();


    let height = t1.image.height;
    let width = t1.image.width;
    if (d === SOUTH || d === NORTH) {
      height += t2.image.height;
    } else {
      width += t2.image.width
    }
    let imageHelper = new DoubleImage(t1, t2);
    let tileEdge = 0;
    let totalEdge = 0;
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        let edgeValue = imageHelper.getEdgeDetectionValue(x, y);
        this.edgeDetectionImage.set(x, y, edgeValue);
        totalEdge += edgeValue;
        if (x === t1.image.width || x === t1.image.width - 1) {
          tileEdge += edgeValue;
        }
      }
    }
    // Convert to averages
    tileEdge /= t1.image.height * 2;
    totalEdge /= t1.image.height * (t1.image.width + t2.image.width);

    this.tileEdgeAverage = tileEdge;
    this.totalEdgeAverage = totalEdge;

    // Update the image's pixel values.
    this.edgeDetectionImage.updatePixels();

    // If the tileEdge is less of an edge than the average, we suspect continuity between images.
    return tileEdge < totalEdge;
  }

  getPixelAverage(t1, x, y) {
    let pixel = t1.getPixel(x, y);
    // TODO handle transparent pixels?
    return (pixel[0] + pixel[1] + pixel[2])
  }

  compareEdgesDifference(d, t1, t2, verbose) {
    let opp = (d + 2) % 4;
    let edge = t1.edges[d];
    // The opposite direction for t2. 0 -> 2, 1 -> 3, 2 -> 0, 3 -> 1
    let edge2 = t2.edges[opp];
    let edgeDiff = 0;
    let pixelsMatched = 0;
    for (let i = 0; i < edge.length; i++) {
      // All pixel colors (RGBA)
      let pixelDiff = this.pixelColorDistance(edge[i], edge2[i]);
      if (i > 0) {
        // check against 1 pixel after this one, use that if it's a better match (diagonal match)
        pixelDiff = Math.min(pixelDiff, this.pixelColorDistance(edge[i], edge2[i - 1]));
        pixelDiff = Math.min(pixelDiff, this.pixelColorDistance(edge[i - 1], edge2[i]));
      }
      if (i < edge.length - 1) {
        pixelDiff = Math.min(pixelDiff, this.pixelColorDistance(edge[i], edge2[i + 1]));
        pixelDiff = Math.min(pixelDiff, this.pixelColorDistance(edge[i + 1], edge2[i]));
      }
      // Ignore blank edges which meet transparent ones?
      if ((t1.isBlank(edge[i]) && t2.isTransparent(edge2[i])) || (t1.isTransparent(edge[i]) && t2.isBlank(edge2[i]))) {
        pixelDiff = 0;
      }
      if (pixelDiff === 0) {
        pixelsMatched++
      }
      edgeDiff += pixelDiff;
    }
    if (verbose) {
      console.log(t1.name, d, t2.name, "pixelsMatched",pixelsMatched, "edgeDiff", edgeDiff);
    }

    if (pixelsMatched < edge.length / 8) {
      // Not a match if 1 or less in 8 pixels match?
    }
    return edgeDiff;
  }

  pixelColorDistance(p1, p2) {
    let diff = 0
    for (let ii = 0; ii < 4; ii++) {
      // Use the distance between colors in rgba.
      diff += Math.pow(p1[ii] - p2[ii], 2);
    }
    return diff;
  }

  setDefaultBelow(below) {
    // Everything with no requirement under them, should be allowed on the below set.
    for (let t of this.allTiles) {
      if (below.includes(t)) {
        // below is the bottom layer, so need nothing below them.
        continue;
      }
      if (t.below.length === 0) {
        this.multiConnectZ(below, [t]);
      }
    }
  }

  connectLayers(layers) {
    // Top layer is blank above.
    layers[0].left.setEdgeType(NORTH, "blank");
    layers[0].middle.setEdgeType(NORTH, "blank");
    layers[0].right.setEdgeType(NORTH, "blank");

    // Bottom layer is blank below
    let bottomIdx = layers.length - 1;
    layers[bottomIdx].left.setEdgeType(SOUTH, "blank");
    layers[bottomIdx].middle.setEdgeType(SOUTH, "blank");
    layers[bottomIdx].right.setEdgeType(SOUTH, "blank");
    for(let d of layers[bottomIdx].decor) {
      d.setEdgeType(SOUTH, "blank");
    }
    for(let double of layers[bottomIdx].doubleDecor) {
      double[0].setEdgeType(SOUTH, "blank");
      double[1].setEdgeType(SOUTH, "blank");
    }

    // Connect each layer to the one below it.
    for (let l = 0; l < layers.length - 1; l++) {
      this.connectY(layers[l].left, layers[l + 1].left);

      // The middle and decor and double decor all connect.
      this.connectY(layers[l].middle, layers[l + 1].middle);
      this.multiConnectY(layers[l].decor, layers[l + 1].decor);
      this.multiConnectY(layers[l].decor, [layers[l + 1].middle]);
      this.multiConnectY([layers[l].middle], layers[l + 1].decor);

      // TODO this only supports doubleDecor below other layers.
      if (layers[l + 1].doubleDecor) {
        for (let double of layers[l + 1].doubleDecor) {
          this.multiConnectY([layers[l].middle], double);
          this.multiConnectY(layers[l].decor, double);
        }
      }

      this.connectY(layers[l].right, layers[l + 1].right);
    }

    // Connect each tile within the layer horizontally.
    for (let l of layers) {
      l.left.setEdgeType(WEST, "blank");
      this.connectX(l.left, l.middle);

      this.multiConnectX([l.left, l.middle], l.decor);
      this.multiConnectX(l.decor, [l.right, l.middle]);

      this.connectX(l.middle, l.right);
      l.right.setEdgeType(EAST, "blank");

      // All doubleDecorations connect to the left/middle and right/middle and each other.
      if (l.doubleDecor) {
        for (let double of l.doubleDecor) {
          this.multiConnectX([l.left, l.middle], [double[0]]);
          this.connectX(double[0], double[1]);
          this.multiConnectX([double[1]], [l.right, l.middle]);
        }
      }
    }
  }

  // --- Automatic adjacency detection ---

  // RGB-only squared distance between two pixels (excludes alpha).
  _rgbDist(p1, p2) {
    return Math.pow(p1[0] - p2[0], 2) + Math.pow(p1[1] - p2[1], 2) + Math.pow(p1[2] - p2[2], 2);
  }

  // Compares the average colour difference at the shared edge (the "seam") against
  // the average interior gradient of both tiles.
  //
  // A ratio < 1 means the seam is less prominent than the tiles' own internal detail —
  // the join is invisible. A ratio >> 1 means the seam creates a harsh discontinuity.
  // This is self-normalising: a noisy cliff tile tolerates a rougher seam than a smooth
  // grass tile, so the same threshold works across very different tile styles.
  _compareEdgesGradientRatio(d, t1, t2) {
    return t1.edgeScore(d, t2);
  }

  // Like compareEdgesDifference but returns RGB diff and alpha diff separately.
  // Preserves the existing diagonal-tolerance (±1 pixel) logic.
  _compareEdgesSplit(d, t1, t2) {
    const opp = (d + 2) % 4;
    const edge = t1.edges[d];
    const edge2 = t2.edges[opp];
    let rgbDiff = 0;
    let alphaDiff = 0;
    let pixelsMatched = 0;

    for (let i = 0; i < edge.length; i++) {
      const p = edge[i];
      const q = edge2[i];

      let bestRgb = this._rgbDist(p, q);
      if (i > 0) {
        bestRgb = Math.min(bestRgb, this._rgbDist(p, edge2[i - 1]), this._rgbDist(edge[i - 1], q));
      }
      if (i < edge.length - 1) {
        bestRgb = Math.min(bestRgb, this._rgbDist(p, edge2[i + 1]), this._rgbDist(edge[i + 1], q));
      }

      let alphaPixelDiff = Math.pow(p[3] - q[3], 2);

      // Blank-meets-transparent counts as a perfect match (same as existing logic).
      if ((t1.isBlank(p) && t2.isTransparent(q)) || (t1.isTransparent(p) && t2.isBlank(q))) {
        bestRgb = 0;
        alphaPixelDiff = 0;
      }

      if (bestRgb === 0 && alphaPixelDiff === 0) pixelsMatched++;
      rgbDiff += bestRgb;
      alphaDiff += alphaPixelDiff;
    }
    return { rgbDiff, alphaDiff, pixelsMatched };
  }

  // Otsu's method: finds the threshold that maximises between-class variance in a 1D distribution.
  // Returns the threshold value in the original scale of the input values.
  _otsu1D(values) {
    if (values.length === 0) return Infinity;
    let maxVal = 0;
    for (const v of values) if (v > maxVal) maxVal = v;
    if (maxVal === 0) return 0;

    const BINS = 256;
    const histogram = new Array(BINS).fill(0);
    for (const v of values) {
      histogram[Math.min(BINS - 1, Math.floor(v * BINS / (maxVal + 1)))]++;
    }

    const total = values.length;
    const sumAll = histogram.reduce((s, h, i) => s + h * i, 0);
    let sumB = 0, wB = 0, maxVar = 0, threshBin = 0;
    for (let t = 0; t < BINS; t++) {
      wB += histogram[t];
      if (wB === 0) continue;
      const wF = total - wB;
      if (wF === 0) break;
      sumB += t * histogram[t];
      const mB = sumB / wB;
      const mF = (sumAll - sumB) / wF;
      const v = wB * wF * Math.pow(mB - mF, 2);
      if (v > maxVar) { maxVar = v; threshBin = t; }
    }
    return threshBin * maxVal / (BINS - 1);
  }

  // Automatically detect all tile adjacency rules without manual threshold tuning.
  //
  // Two-pass approach:
  //   Pass 1 — Edge fingerprinting: quantize each edge pixel to 4-bit colour (rounds to
  //             nearest `hashQuantize`) and build a string fingerprint. Tiles whose opposite
  //             edges share the same fingerprint are connected with zero false positives.
  //             Works best for tilesets designed for WFC with exact-match edges.
  //
  //   Pass 2 — Otsu adaptive threshold: for remaining colored/same edge pairs, compute
  //             RGB-only and alpha-only diffs across all tile pairs, then use Otsu's method
  //             to automatically find the natural gap between matching and non-matching pairs.
  //             Separating alpha from RGB prevents semi-transparent sprites from inflating scores.
  //
  // options:
  //   hashQuantize   {number}   Quantisation step for fingerprint (default 16 = 4-bit per channel)
  //   ratioThreshold {number}   Max seam/interior gradient ratio to allow a connection (default 1.5).
  //                             Lower = stricter. 1.0 means the seam must be no harsher than the
  //                             tile's own internal detail. Try 1.5–2.5 for most tilesets.
  //   allowedEdges   {string[]} Edge types to connect by type equality (e.g. ['transparent'])
  autoDetectAllEdges(options = {}) {
    const { hashQuantize = 16, ratioThreshold = 1.5, allowedEdges = [] } = options;

    this.updateTileEdges();

    // --- Pass 1: fingerprint matching ---
    const fps = this.allTiles.map(t =>
      [0, 1, 2, 3].map(d => {
        const tokens = t.edges[d].map(pixel => {
          if (t.isTransparent(pixel)) return 'T';
          if (t.isBlank(pixel)) return 'B';
          return `${Math.round(pixel[0] / hashQuantize)},${Math.round(pixel[1] / hashQuantize)},${Math.round(pixel[2] / hashQuantize)}`;
        });
        return tokens.join('|');
      })
    );

    for (let i1 = 0; i1 < this.allTiles.length; i1++) {
      for (let i2 = i1; i2 < this.allTiles.length; i2++) {
        const match = [false, false, false, false];
        for (let d = 0; d < 4; d++) {
          if (fps[i1][d] === fps[i2][(d + 2) % 4]) match[d] = true;
          // Also apply allowedEdges type matching (e.g. transparent-transparent)
          if (this.checkAllowedEdges(d, this.allTiles[i1], this.allTiles[i2], allowedEdges)) match[d] = true;
        }
        this.connectMatches(match, this.allTiles[i1], this.allTiles[i2]);
      }
    }


    // --- Pass 2: gradient ratio matching ---
    let pass2Connections = 0;
    for (let i1 = 0; i1 < this.allTiles.length; i1++) {
      const t1 = this.allTiles[i1];
      if (t1.isIsolated()) continue;
      for (let i2 = i1; i2 < this.allTiles.length; i2++) {
        const t2 = this.allTiles[i2];
        if (t2.isIsolated()) continue;
        const match = [false, false, false, false];
        for (let d = 0; d < 4; d++) {
          const opp = (d + 2) % 4;
          if (t1.getEdgeType(d) !== 'colored' && t1.getEdgeType(d) !== 'same') continue;
          if (t2.getEdgeType(opp) !== 'colored' && t2.getEdgeType(opp) !== 'same') continue;
          if (this._compareEdgesGradientRatio(d, t1, t2) <= ratioThreshold) {
            match[d] = true;
            pass2Connections++;
          }
        }
        this.connectMatches(match, t1, t2);
      }
    }
    console.log('autoDetect — pass2 connections found:', pass2Connections, '(ratioThreshold:', ratioThreshold + ')');

    this.findAllClusters();
    console.log('autoDetect — clusters:', this.clusters.length, 'ground:', this.ground.length, 'objects:', this.objects.length);
  }

  // Automatically detect adjacency using a per-edge Otsu threshold.
  //
  // For each (tile, direction) pair, WFCTile.edgeScore is computed against every tile
  // in the opposite direction, producing an edge-specific spectrum of scores. Otsu's
  // method finds the natural gap between matching and non-matching tiles in that
  // distribution — no global threshold needed.
  //
  // A connection is made only when BOTH sides approve: t1's per-edge threshold allows
  // t2, and t2's per-edge threshold (in the opposite direction) allows t1. This prevents
  // one-sided false positives where a uniform edge would accept everything.
  //
  // allowedEdges: edge types to always connect by type equality (e.g. ['transparent']).
  // scoreThreshold: hard cap on WFCTile.edgeScore (0 = seamless, 1 = as rough as the
  // tiles' own interior detail) — a connection is never made above this regardless of
  // what the per-tile Otsu thresholds would otherwise allow.
  detectEdgesByOtsu(allowedEdges = [], scoreThreshold = 1.0) {
    const tileIndex = new Map(this.allTiles.map((t, i) => [t, i]));

    // Note: we deliberately don't gate matches on whole-tile transparency (hasTransparentPixel).
    // A tile with any transparent pixel anywhere still gets classified as "ground" or "object"
    // for z-layering (see findAllClusters), but that's independent of whether THIS edge can join
    // another tile's edge — an object tile can easily have solid/colored edges that legitimately
    // match a ground tile's edges. A genuinely transparent edge is already excluded below because
    // its classifyEdges() type is 'transparent', not 'colored'/'same'.
    const candidates = this.allTiles.filter(t => !t.isIsolated());

    // Step 1: compute an Otsu threshold for every (tile, direction).
    // For each edge, the ratio distribution over all candidate opposite edges determines
    // where the "matching" cluster ends and the "non-matching" cluster begins.
    const thresholds = new Map(); // key: "${tileIndex}-${dir}"
    for (const t1 of candidates) {
      const i1 = tileIndex.get(t1);

      for (let d = 0; d < 4; d++) {
        if (t1.getEdgeType(d) !== 'colored' && t1.getEdgeType(d) !== 'same') continue;
        const opp = (d + 2) % 4;

        const ratios = [];
        for (const t2 of candidates) {
          if (t2.getEdgeType(opp) !== 'colored' && t2.getEdgeType(opp) !== 'same') continue;
          ratios.push(t1.edgeScore(d, t2));
        }

        // Need at least 2 values for a meaningful threshold.
        thresholds.set(`${i1}-${d}`, ratios.length >= 2 ? this._otsu1D(ratios) : Infinity);
      }
    }

    // Step 2: connect pairs where both sides' per-edge Otsu thresholds approve.
    for (let i1 = 0; i1 < this.allTiles.length; i1++) {
      const t1 = this.allTiles[i1];
      if (t1.isIsolated()) continue;

      for (let i2 = i1; i2 < this.allTiles.length; i2++) {
        const t2 = this.allTiles[i2];
        if (t2.isIsolated()) continue;

        const verbose = t1.debug && t2.debug;
        const match = [false, false, false, false];
        for (let d = 0; d < 4; d++) {
          const opp = (d + 2) % 4;
          if (this.checkAllowedEdges(d, t1, t2, allowedEdges)) {
            match[d] = true;
            continue;
          }
          if (t1.getEdgeType(d) !== 'colored' && t1.getEdgeType(d) !== 'same') {
            if (verbose) console.log('Otsu', t1.name, 'd' + d, '->', t2.name, 'skipped: t1 edge type is', t1.getEdgeType(d));
            continue;
          }
          if (t2.getEdgeType(opp) !== 'colored' && t2.getEdgeType(opp) !== 'same') {
            if (verbose) console.log('Otsu', t1.name, 'd' + d, '->', t2.name, 'skipped: t2 opposite edge type is', t2.getEdgeType(opp));
            continue;
          }

          const thresh1 = thresholds.get(`${i1}-${d}`);
          const thresh2 = thresholds.get(`${i2}-${opp}`);
          if (thresh1 === undefined || thresh2 === undefined) {
            if (verbose) console.log('Otsu', t1.name, 'd' + d, '->', t2.name, 'skipped: no threshold computed', {thresh1, thresh2});
            continue;
          }

          const score = t1.edgeScore(d, t2);
          const accepted = score <= thresh1 && score <= thresh2 && score <= scoreThreshold;
          if (verbose) {
            console.log('Otsu', t1.name, 'd' + d, '->', t2.name,
              'score=' + score.toFixed(3), 'thresh1=' + thresh1.toFixed(3), 'thresh2=' + thresh2.toFixed(3),
              'cap=' + scoreThreshold, '->', accepted ? 'CONNECTED' : 'rejected');
          }
          if (accepted) {
            match[d] = true;
          }
        }
        this.connectMatches(match, t1, t2);
      }
    }
  }

  getRect(x1, y1, x2, y2) {
    let list = [];
    for (let y = y1; y <= y2; y++) {
      for (let x = x1; x <= x2; x++) {
        list.push(this.getData(x, y));
      }
    }
    return list;
  }
}

class DoubleImage {
  constructor(t1, t2) {
    this.t1 = t1;
    this.t2 = t2;
  }

  getEdgeDetectionValue(x, y) {
    let edgeDetectionValue = 0;
    for (let rgb = 0; rgb < 3; rgb++) {
      edgeDetectionValue += -2 * this.getPixelChannel(x - 1, y, rgb);
      edgeDetectionValue += 2 * this.getPixelChannel(x + 1, y, rgb);
      edgeDetectionValue += -1 * this.getPixelChannel(x - 1, y - 1, rgb);
      edgeDetectionValue += 1 * this.getPixelChannel(x + 1, y - 1, rgb);
      edgeDetectionValue += -1 * this.getPixelChannel(x - 1, y + 1, rgb);
      edgeDetectionValue += 1 * this.getPixelChannel(x + 1, y + 1, rgb);
    }

    // divide by 3 channels for rgb.
    edgeDetectionValue /= 3;

    return Math.abs(edgeDetectionValue);
  }

  getPixelAverage(x, y) {
    let pixel = this.getPixel(x, y);
    return (pixel[0] + pixel[1] + pixel[2]) / 3;
  }

  getPixelChannel(x, y, i) {
    return this.getPixel(x, y)[i];
  }

  getPixel(x, y) {
    if (x < this.t1.image.width) {
      return this.t1.getPixel(x, y);
    }
    return this.t2.getPixel(x - this.t1.image.width, y);
  }
}
