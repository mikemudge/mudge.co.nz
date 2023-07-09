
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

  getData() {
    return this.data;
  }

  setData(data) {
    this.data = data;
  }
}

// A data structure which represents a grid.
class Grid {
  constructor(width, height) {
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

  getRandomTile() {
    let x = floor(random(0, this.width));
    let y = floor(random(0, this.height));
    return this.getTile(x, y);
  }

  getBorder() {
    return this.boundryTile;
  }

  getOrdinalTiles(x, y) {
    let t = this.getTile(x, y);
    return t.getOrdinalTiles();
  }

  setTileData(x, y, data) {
    this.getTile(x, y).setData(data);
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
