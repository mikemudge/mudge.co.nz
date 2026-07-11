// Direction convention used throughout the WFC code — edges, connections, edgeScore, etc.
export const NORTH = 0;
export const EAST = 1;
export const SOUTH = 2;
export const WEST = 3;

// Sum of per-channel absolute RGB differences between two [r,g,b,a] pixels.
function rgbAbsDiff(p1, p2) {
  return Math.abs(p1[0] - p2[0]) + Math.abs(p1[1] - p2[1]) + Math.abs(p1[2] - p2[2]);
}

export class WFCTile {
  constructor(img, name) {
    this.image = img;
    this.name = name;
    // Register which tiles can be adjacent to this in various directions.
    this.left = [];
    this.right = [];
    this.up = [];
    this.down = [];
    this.below = [];
    this.above = [];
    this.edges = [[],[],[],[]];
    this.edgeTypeCounts = {};
    this.edgeTypes = [];
    this.debug = false;
    // Set by TileSetEdgeMatcher.findAllClusters() to "ground" or "object" — null until then.
    this.zLayer = null;
    // Set by TileSetEdgeMatcher.setGroundRegion() to pin this tile to ground regardless of
    // what it connects to — see findAllClusters() for how this acts as a propagation barrier.
    this.forcedGround = false;
  }
  copy() {
    let t = new WFCTile(this.image, this.name + " copy");
    t.up = [...this.up];
    t.right = [...this.right];
    t.down = [...this.down];
    t.left = [...this.left];
    t.edges = [...this.edges];
    t.edgeTypeCounts = Object.assign({}, this.edgeTypeCounts);
    t.edgeTypes = [...this.edgeTypes];
    return t;
  }

  setDebug(debug) {
    this.debug = debug;
  }
  addRight(tile) {
    if (!this.right.includes(tile)) {
      this.right.push(tile);
    }
  }
  addLeft(tile) {
    if (!this.left.includes(tile)) {
      this.left.push(tile);
    }
  }
  addUp(tile) {
    if (!this.up.includes(tile)) {
      this.up.push(tile);
    }
  }
  addDown(tile) {
    if (!this.down.includes(tile)) {
      this.down.push(tile);
    }
  }
  addAbove(tile) {
    if (!this.above.includes(tile)) {
      this.above.push(tile);
    }
  }
  addBelow(tile) {
    if (!this.below.includes(tile)) {
      this.below.push(tile);
    }
  }
  removeUp(tile) {
    const index = this.up.indexOf(tile);
    if (index !== -1) {
      this.up.splice(index, 1);
    }
  }
  removeDown(tile) {
    const index = this.down.indexOf(tile);
    if (index !== -1) {
      this.down.splice(index, 1);
    }
  }
  removeRight(tile) {
    const index = this.right.indexOf(tile);
    if (index !== -1) {
      this.right.splice(index, 1);
    }
  }
  removeLeft(tile) {
    const index = this.left.indexOf(tile);
    if (index !== -1) {
      this.left.splice(index, 1);
    }
  }

  getDirectionTiles() {
    return [
      this.up,
      this.right,
      this.down,
      this.left,
      this.above,
      this.below
    ]
  }

  getEdgeCount(type) {
    return this.edgeTypeCounts[type] || 0;
  }
  getEdgeType(dir) {
    return this.edgeTypes[dir];
  }
  setEdgeType(dir, type) {
    this.edgeTypes[dir] = type;
  }

  calculateEdges() {
    this.edges = [[], [], [], []];
    // Assuming width/height are the same.
    for (let i = 0; i < this.image.width; i++) {
      // Calculate pixel indexes for each edge for NESW.
      // These go left to right or top to bottom.
      let pi = [
        i * 4,
        (i * this.image.width + this.image.width - 1) * 4,
        ((this.image.width - 1) * this.image.width + i) * 4,
        i * this.image.width * 4
      ];
      for (let d = 0; d < 4; d++) {
        let r = this.image.pixels[pi[d]];
        let g = this.image.pixels[pi[d] + 1];
        let b = this.image.pixels[pi[d] + 2];
        let a = this.image.pixels[pi[d] + 3];
        this.edges[d].push([r, g, b, a]);
      }
    }
  }

  // Average absolute RGB gradient between adjacent pixels, ignoring transparent pixels.
  // Measures how "busy" a tile is internally — used to normalise seam comparisons.
  computeInteriorGradient() {
    let grad = 0;
    let count = 0;
    const w = this.image.width;
    const h = this.image.height;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w - 1; x++) {
        const p1 = this.getPixel(x, y);
        const p2 = this.getPixel(x + 1, y);
        if (this.isTransparent(p1) || this.isTransparent(p2)) continue;
        grad += Math.abs(p1[0]-p2[0]) + Math.abs(p1[1]-p2[1]) + Math.abs(p1[2]-p2[2]);
        count += 3;
      }
    }
    for (let y = 0; y < h - 1; y++) {
      for (let x = 0; x < w; x++) {
        const p1 = this.getPixel(x, y);
        const p2 = this.getPixel(x, y + 1);
        if (this.isTransparent(p1) || this.isTransparent(p2)) continue;
        grad += Math.abs(p1[0]-p2[0]) + Math.abs(p1[1]-p2[1]) + Math.abs(p1[2]-p2[2]);
        count += 3;
      }
    }
    this.interiorGradient = count > 0 ? grad / count : 0;
  }

  classifyEdges() {
    this.edgeTypeCounts = {};
    this.edgeTypes = ["", "", "", ""];
    for (let d = 0; d < this.edges.length; d++) {
      let edgeLength = this.edges[d].length;
      // TODO this could use a median?
      // currently using the middle of the edge.
      let averagePixel = this.edges[d][7];
      let alphaPixels = 0;
      let blankPixels = 0;
      let samePixels = 0;
      // Assuming width/height are the same.
      for (let i = 0; i < this.image.width; i++) {
        let pixel = this.edges[d][i];
        if (this.isTransparent(pixel)) {
          // Check alpha channel is empty.
          alphaPixels++;
        } else if (this.isBlank(pixel)) {
          // Check RGB against the blank edge color.
          blankPixels++;
        } else if (pixel[0] === averagePixel[0] && pixel[1] === averagePixel[1] && pixel[2] === averagePixel[2]) {
          // Check RGB against the average pixel.
          samePixels++;
        }
      }


      let type = "";
      if (alphaPixels >= edgeLength - edgeLength / 8) {
        type = "transparent"
      } else if (blankPixels > edgeLength - edgeLength / 8) {
        type = "blank";
      } else if (alphaPixels + blankPixels > edgeLength - edgeLength / 8) {
        if (blankPixels > edgeLength / 2) {
          type = "blank";
        } else {
          type = "transparent";
        }
      } else if (samePixels > edgeLength - edgeLength / 8) {
        type = "same";
      } else {
        type = "colored";
        // TODO add this edge to a cluster to help with matching.
      }
      this.edgeTypes[d] = type;
      this.edgeTypeCounts[type] = (this.edgeTypeCounts[type] || 0) + 1;
    }
  }

  hasTransparentPixel() {
    for (let y = 0; y < this.image.height; y++) {
      for (let x = 0; x < this.image.width; x++) {
        let a = this.image.pixels[(y * this.image.width + x) * 4 + 3];
        if (a === 0) {
          return true;
        }
      }
    }
    return false;
  }

  isBlank(pixel) {
    return pixel[0] === 63 && pixel[1] === 38 && pixel[2] === 49;
  }
  isTransparent(pixel) {
    return pixel[3] === 0;
  }

  // Compatibility score for placing `other` in direction `d` from this tile (0=up/N, 1=right/E,
  // 2=down/S, 3=left/W). Lower is better: 0 means the seam is invisible, 1 means the seam is as
  // rough as the tiles' own internal detail, >1 means the join stands out as a discontinuity.
  // Self-normalising, so the same score is comparable across tiles of very different busyness
  // (a noisy cliff tile and a smooth grass tile use the same scale).
  //
  // Requires calculateEdges()/classifyEdges()/computeInteriorGradient() to have been run on both
  // tiles first (TileSetEdgeMatcher.updateTileEdges() does this for a whole tileset).
  edgeScore(d, other) {
    const opp = (d + 2) % 4;
    const edge1 = this.edges[d];
    const edge2 = other.edges[opp];
    let seamDiff = 0;
    let count = 0;

    for (let i = 0; i < edge1.length; i++) {
      const p = edge1[i];
      const q = edge2[i];
      if (this.isTransparent(p) && other.isTransparent(q)) continue;
      if ((this.isBlank(p) && other.isTransparent(q)) || (this.isTransparent(p) && other.isBlank(q))) continue;

      // Absolute RGB diff with a ±1 pixel diagonal tolerance, so a one-pixel shift in a
      // diagonal pattern doesn't get penalised as a mismatch.
      let diff = rgbAbsDiff(p, q);
      if (i > 0) {
        diff = Math.min(diff, rgbAbsDiff(p, edge2[i - 1]), rgbAbsDiff(edge1[i - 1], q));
      }
      if (i < edge1.length - 1) {
        diff = Math.min(diff, rgbAbsDiff(p, edge2[i + 1]), rgbAbsDiff(edge1[i + 1], q));
      }
      seamDiff += diff;
      count += 3; // 3 channels per pixel
    }

    if (count === 0) return 0; // all transparent — compatible

    const seamAvg = seamDiff / count;
    const interiorAvg = (this.interiorGradient + other.interiorGradient) / 2;

    if (interiorAvg === 0) return seamAvg > 0 ? Infinity : 0;

    return seamAvg / interiorAvg;
  }
  isIsolated() {
    // If the number of colored and same edges is 0 then this is an isolated tile.
    return (this.edgeTypeCounts['same'] ?? 0) + (this.edgeTypeCounts['colored'] ?? 0) === 0;
  }
  anyEdgeUnconnectable() {
    let edges = this.getDirectionTiles();
    for (let d = 0; d < 4; d++) {
      if (edges[d].length === 0) {
        return true;
      }
    }
    return false;
  }

  show(size) {
    if (this.image) {
      this.showTileAt(0, 0, size, size * this.image.height / this.image.width);
    }
  }

  showTileAt(x, y, w, h) {
    if (this.image) {
      image(this.image, x, y, w, h);
    } else {
      // Show empty tile. Scoped with push/pop so the fill/stroke change here doesn't leak
      // into whatever the caller draws next (e.g. a border rect around the following tile).
      push();
      fill(255);
      noStroke();
      text("E", x + 5, y + h / 2 + 5);
      pop();
    }
  }

  getPixel(x, y) {
    let i = (y * this.image.width + x) * 4;
    return [this.image.pixels[i], this.image.pixels[i + 1], this.image.pixels[i + 2], this.image.pixels[i + 3]];
  }

  colorString(pixel) {
    if (pixel[3] === 0) {
      // Completely transparent.
      return "0";
    }
    return pixel[0]+","+pixel[1]+","+pixel[2];
  }
}

export class IsoTile extends WFCTile {
  constructor(image, name, direction) {
    super(image, name + direction);
    this.direction = direction;
  }

  show(size) {
    // h is just the image height scaled to the current size.
    let h = size * 2 * this.image.height / this.image.width;
    let dirtDepth = size * .15;
    image(this.image, 0, size / 2 - h + dirtDepth, size * 2, h);
  }

  showTileAt(x, y, w, h) {
    let h2 = w * this.image.height / this.image.width;
    image(this.image, x, y + (h - h2) / 2, w, h2);
  }
}
