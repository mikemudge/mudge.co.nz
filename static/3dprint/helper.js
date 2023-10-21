class Shape {
  constructor() {
    this.positions = [];
    this.colors = [];
    this.color = [1.0, 0, 0, 1.0];
  }

  addTriangle(a, b, c) {
    // TODO this is a hack way to reorientate the corner.
    // Should update all the calls below instead.
    this.positions.push(b.x, b.y, b.z);
    this.positions.push(a.x, a.y, a.z);
    this.positions.push(c.x, c.y, c.z);
    this.colors.push(this.color[0], this.color[1], this.color[2], this.color[3]);
    this.colors.push(this.color[0], this.color[1], this.color[2], this.color[3]);
    this.colors.push(this.color[0], this.color[1], this.color[2], this.color[3]);
  }

  addQuad(a, b, c, d) {
    this.addTriangle(a, b, c);
    this.addTriangle(a, c, d);
  }

  asGeometry() {
    let positions = this.positions;
    let colors = this.colors;
    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
    geometry.computeVertexNormals();
    return geometry;
  }
}

generateFromCrossSection = function (crossSection, path) {
  // TODO fidelity for pathing?
  shape = new Shape();

  // Scale x's by the crossSections x
  points = [];
  for (let r=0;r < path.length - 2;r++) {
    // TODO should r wrap?
    let r1 = r + 1;
    // Create relative x based on path direction.
    let x = path[r1].copy().sub(path[r]);
    // Make x perpendicular to the path.
    // TODO could rotate by PI/2 aka HALF_PI?
    x.set(-x.y, x.x).normalize();
    // y of crossSection is applied in the z direction to make a 3d shape.
    let y = createVector(0, 0, 1);

    let x1 = path[r1 + 1].copy().sub(path[r1]);
    // Make x perpendicular to the path.
    x1.set(-x1.y, x1.x).normalize();
    // y of crossSection is applied in the z direction to make a 3d shape.
    let y1 = createVector(0, 0, 1);

    for (let i = 0; i < crossSection.length; i++) {
      let i1 = (i + 1) % crossSection.length;
      c = crossSection[i];
      c1 = crossSection[i1];
      // Swap x and y, with negative y to calculate a perpendicular vector.

      p = [
        x.copy().mult(c.x).add(path[r]).add(y.copy().mult(c.y)),
        x.copy().mult(c1.x).add(path[r]).add(y.copy().mult(c1.y)),
        x1.copy().mult(c1.x).add(path[r1]).add(y1.copy().mult(c1.y)),
        x1.copy().mult(c.x).add(path[r1]).add(y1.copy().mult(c.y))
      ]
      shape.addTriangle(p[0], p[2], p[1]);
      shape.addTriangle(p[0], p[3], p[2]);
    }
  }
  return shape;

}

loadGeometry = function() {
  track_height = 3;
  track_width = 18.5;
  wall_height = 3;
  wall_width = 1.5;
  radius = 50;

  crossSection = [
    createVector(wall_width + track_width, 0),
    createVector(wall_width + track_width, wall_height + track_height),
    createVector(track_width, wall_height + track_height),
    createVector(track_width, track_height),
    createVector(-track_width, track_height),
    createVector(-track_width, wall_height + track_height),
    createVector(-wall_width - track_width, wall_height + track_height),
    createVector(-wall_width - track_width, 0),
  ];

  let path = [];
  let unit = createVector(0, radius);
  for (let r = 0; r <= 101; r++) {
    let angle = r / 100 * HALF_PI;
    path.push(unit.copy().rotate(angle).copy());
  }

  let shape = generateFromCrossSection(crossSection, path);

  // TODO end plates.

  // TODO complex end plates (with joiners), will need to modify the top/bottom as well?

  return shape.asGeometry();
}