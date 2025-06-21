
class Tile {
  constructor(map, x, y, data) {
    this.map = map;
    this.x = x;
    this.y = y;
    this.data = data;
  }

  north() {
    return this.map.getTile(this.x, this.y - 1);
  }
  south() {
    return this.map.getTile(this.x, this.y + 1);
  }
  east() {
    return this.map.getTile(this.x + 1, this.y);
  }
  west() {
    return this.map.getTile(this.x - 1, this.y);
  }

  getOrdinalTiles() {
    return [
      this.map.getTile(this.x - 1, this.y - 1),
      this.map.getTile(this.x + 1, this.y - 1),
      this.map.getTile(this.x + 1, this.y + 1),
      this.map.getTile(this.x - 1, this.y + 1),
      this.north(),
      this.east(),
      this.south(),
      this.west(),
    ]
  }

  getCardinalTiles() {
    return [
      this.north(),
      this.east(),
      this.south(),
      this.west(),
    ]
  }

  update() {
    if (this.data) {
      this.data.update();
    }
  }

  getLocationString() {
    return this.x + "," + this.y;
  }

  getData() {
    return this.data;
  }

  setData(data) {
    this.data = data;
  }
}

// A data structure which represents a grid.
class Grid {
  constructor(width, height, size) {
    this.size = size;
    this.width = width;
    this.height = height;
    this.tiles = [];
    this.boundryTile = new Tile(this, Infinity, Infinity, null);
    this.reset();
  }
  reset() {
    for (let y = 0; y < this.height; y++) {
      this.tiles.push([]);
      for (let x = 0; x < this.width; x++) {
        let tile = new Tile(this, x, y, null);
        this.tiles[y].push(tile);
      }
    }
  }

  update() {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        this.tiles[y][x].update();
      }
    }
  }

  getRandomTile() {
    let x = floor(random(0, this.width));
    let y = floor(random(0, this.height));
    return this.getTile(x, y);
  }

  getWidth() {
    return this.width;
  }

  getHeight() {
    return this.height;
  }

  getBorder() {
    return this.boundryTile;
  }

  getOrdinalTiles(x, y) {
    let t = this.getTile(x, y);
    return t.getOrdinalTiles();
  }

  setTileData(x, y, data) {
    if (!data.show) {
      throw new Error("No show function on data" + data);
    }
    this.getTile(x, y).setData(data);
  }

  getTileAtPos(pos) {
    let gx = Math.round(pos.x / this.size);
    let gy = Math.round(pos.y / this.size);

    return this.getTile(gx, gy);
  }

  getTileAtPosFloor(pos) {
    let gx = Math.floor(pos.x / this.size);
    let gy = Math.floor(pos.y / this.size);

    return this.getTile(gx, gy);
  }

  getTile(x, y) {
    if (y < 0 || y >= this.height) {
      return this.boundryTile;
    }
    if (x < 0 || x >= this.width) {
      return this.boundryTile;
    }
    return this.tiles[y][x];
  }
}
