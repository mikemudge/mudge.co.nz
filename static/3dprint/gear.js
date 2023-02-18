class Shape {
  constructor() {
    this.positions = [];
    this.colors = [];
    this.color = [1.0, 0, 0, 1.0];
  }

  addTriangle(a, b, c) {
    this.positions.push(a.x, a.y, a.z);
    this.positions.push(b.x, b.y, b.z);
    this.positions.push(c.x, c.y, c.z);
    this.colors.push(this.color[0], this.color[1], this.color[2], this.color[3]);
    this.colors.push(this.color[0], this.color[1], this.color[2], this.color[3]);
    this.colors.push(this.color[0], this.color[1], this.color[2], this.color[3]);
  }

  addQuad(a, b, c, d) {
    this.addTriangle(a, b, c);
    this.addTriangle(a, c, d);
  }
}

loadGeometry = function() {
  shape = new Shape();

  repeats = 32;
  radius1 = 20;
  radius2 = 25;
  depth = 5;

  for (let r=0;r < repeats;r++) {

    lx = Math.cos(Math.PI * (r - 0.5) * 2 / repeats);
    ly = Math.sin(Math.PI * (r - 0.5) * 2 / repeats);
    x = Math.cos(Math.PI * r * 2 / repeats);
    y = Math.sin(Math.PI * r * 2 / repeats);
    nx = Math.cos(Math.PI * (r + 0.5) * 2 / repeats);
    ny = Math.sin(Math.PI * (r + 0.5) * 2 / repeats);

    locs = [
      createVector(0, 0, 0),
      createVector(radius2 * lx, radius2 * ly, 0),
      createVector(radius1 * x, radius1 * y, 0),
      createVector(radius2 * nx, radius2 * ny, 0),
      createVector(0, 0, depth),
      createVector(radius2 * lx, radius2 * ly, depth),
      createVector(radius1 * x, radius1 * y, depth),
      createVector(radius2 * nx, radius2 * ny, depth),
    ]
    shape.addQuad(locs[2], locs[1], locs[0], locs[3]);
    shape.addQuad(locs[4], locs[5], locs[6], locs[7]);

    // Sides
    shape.addQuad(locs[5], locs[1], locs[2], locs[6]);
    shape.addQuad(locs[6], locs[2], locs[3], locs[7]);
  }

  let positions = shape.positions;
  let colors = shape.colors;
  const geometry = new THREE.BufferGeometry();

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  geometry.computeVertexNormals();
  return geometry;
}