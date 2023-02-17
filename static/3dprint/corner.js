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

  track_height = 3;
  track_width = 18.5;
  wall_height = 3;
  wall_width = 1.5;
  radius = 50;

  // The "hole" connector.
  connector_inset = 6.1;
  connector_width = 10.25;
  // The width of the connector at the edge of the track.
  // Based on a depth of 10.5 with 6.1 inset (4.4 out).
  // 4.4 / 10.5 * connector_width.
  edge_connector_width = 4.3;

  // The triangle connector
  triangle_outset = 6;
  triangle_edge_width = 4;
  triangle_long_width = 10;

  outer_track = track_width + wall_width;

  y = track_height;
  z = length;

  // Top of the track
  segments = 20;
  lzs = [];
  rzs = [];
  lxs = [];
  rxs = [];
  locs = [];
  for (let r=0;r <= segments;r++) {
    lxs.push(radius - (radius - track_width) * Math.cos(Math.PI * r / 2 / segments));
    lzs.push(radius - (radius - track_width) * Math.sin(Math.PI * r / 2 / segments));
    rxs.push(radius - (radius + track_width) * Math.cos(Math.PI * r / 2 / segments));
    rzs.push(radius - (radius + track_width) * Math.sin(Math.PI * r / 2 / segments));

    xs = [
      radius - (radius + wall_width + track_width) * Math.cos(Math.PI * r / 2 / segments),
      radius - (radius + track_width) * Math.cos(Math.PI * r / 2 / segments),
      radius - (radius - track_width) * Math.cos(Math.PI * r / 2 / segments),
      radius - (radius - wall_width - track_width) * Math.cos(Math.PI * r / 2 / segments),
    ];
    zs = [
      radius - (radius + wall_width + track_width) * Math.sin(Math.PI * r / 2 / segments),
      radius - (radius + track_width) * Math.sin(Math.PI * r / 2 / segments),
      radius - (radius - track_width) * Math.sin(Math.PI * r / 2 / segments),
      radius - (radius - wall_width - track_width) * Math.sin(Math.PI * r / 2 / segments),
    ];
    locs.push([
      createVector(xs[0], 0, zs[0]),
      createVector(xs[3], 0, zs[3]),
      createVector(xs[3], track_height + wall_height, zs[3]),
      createVector(xs[2], track_height + wall_height, zs[2]),
      createVector(xs[2], track_height, zs[2]),
      createVector(xs[1], track_height, zs[1]),
      createVector(xs[1], track_height + wall_height, zs[1]),
      createVector(xs[0], track_height + wall_height, zs[0]),
      createVector(xs[0], 0, zs[0])
    ]);
  }

  for (let r=1;r <= segments;r++) {
    for (let i=1; i < locs[r].length; i++) {
      if (r > segments - 2 && (i === 5 || i === 1)) {
        // Don't render the top/bottom track for the inset.
        // TODO We do need to fill in this area someway.
        continue;
      }
      a = locs[r][i - 1];
      b = locs[r][i];
      c = locs[r - 1][i];
      d = locs[r - 1][i - 1];
      shape.addTriangle(a, b, c);
      shape.addTriangle(a, c, d);
    }
  }

  // End plates.
  // TODO should think about the order of these, could be easier to render?
  locs2 = [
    createVector(-triangle_edge_width, 0, radius),
    createVector(-triangle_edge_width, y, radius),
    createVector(triangle_edge_width, y, radius),
    createVector(triangle_edge_width, 0, radius),
    createVector(triangle_long_width, 0, radius + triangle_outset),
    createVector(triangle_long_width, y, radius + triangle_outset),
    createVector(-triangle_long_width, y, radius + triangle_outset),
    createVector(-triangle_long_width, 0, radius + triangle_outset),
  ]
  r = 0;
  shape.addTriangle(locs[r][0], locs2[0], locs[r][5]);
  shape.addTriangle(locs2[0], locs2[1], locs[r][5]);
  shape.addTriangle(locs[r][1], locs[r][2], locs[r][4]);
  shape.addTriangle(locs[r][2], locs[r][3], locs[r][4]);
  shape.addTriangle(locs[r][1], locs[r][4], locs2[2]);
  shape.addTriangle(locs[r][1], locs2[2], locs2[3]);
  shape.addTriangle(locs[r][5], locs[r][6], locs[r][7]);
  shape.addTriangle(locs[r][0], locs[r][5], locs[r][7]);

  // Top of triangle
  shape.addQuad(locs2[6], locs2[5], locs2[2], locs2[1]);
  // Bottom of triangle
  shape.addQuad(locs2[0], locs2[3], locs2[4], locs2[7]);
  // Sides
  shape.addQuad(locs2[7], locs2[6], locs2[1], locs2[0]);
  shape.addQuad(locs2[5], locs2[4], locs2[3], locs2[2]);
  // End
  shape.addQuad(locs2[4], locs2[5], locs2[6], locs2[7]);

  locs2 = [
    createVector(radius, 0, -edge_connector_width),
    createVector(radius, y, -edge_connector_width),
    createVector(radius, y, edge_connector_width),
    createVector(radius, 0, edge_connector_width),
    createVector(radius - connector_inset, 0, connector_width),
    createVector(radius - connector_inset, y, connector_width),
    createVector(radius - connector_inset, y, -connector_width),
    createVector(radius - connector_inset, 0, -connector_width),
  ]
  r = segments;
  shape.addTriangle(locs[r][5], locs2[0], locs[r][0]);
  shape.addTriangle(locs[r][5], locs2[1], locs2[0]);
  shape.addTriangle(locs[r][4], locs[r][2], locs[r][1]);
  shape.addTriangle(locs[r][4], locs[r][3], locs[r][2]);
  shape.addTriangle(locs2[2], locs[r][4], locs[r][1]);
  shape.addTriangle(locs2[3], locs2[2], locs[r][1]);
  shape.addTriangle(locs[r][7], locs[r][6], locs[r][5]);
  shape.addTriangle(locs[r][7], locs[r][5], locs[r][0]);

  // Sides
  shape.addQuad(locs2[0], locs2[1], locs2[6], locs2[7]);
  shape.addQuad(locs2[2], locs2[3], locs2[4], locs2[5]);
  // End
  shape.addQuad(locs2[7], locs2[6], locs2[5], locs2[4]);

  // Add top surface.
  shape.addQuad(locs[r - 1][4], locs[r][4], locs2[2], locs2[5]);
  // This quad is a little risky, it can be a dart so order is important.
  shape.addQuad(locs[r - 2][4], locs[r - 1][4], locs2[5], locs[r - 2][5]);

  shape.addQuad(locs2[6], locs2[1], locs[r][5], locs[r - 1][5]);
  // This quad is a little risky, it can be a dart so order is important.
  shape.addQuad(locs2[6], locs[r - 1][5], locs[r - 2][5], locs2[5]);

  // bottom surface.
  shape.addQuad(locs[r - 1][1], locs2[4], locs2[3], locs[r][1]);
  // This quad is a little risky, it can be a dart so order is important.
  shape.addQuad(locs[r - 2][1], locs[r - 2][0], locs2[4], locs[r - 1][1]);

  shape.addQuad(locs2[7], locs[r - 1][0], locs[r][0], locs2[0]);
  // This quad is a little risky, it can be a dart so order is important.
  shape.addQuad(locs2[7], locs2[4], locs[r - 2][0], locs[r - 1][0]);

  // Top of triangle
  // shape.addQuad(locs2[6], locs2[5], locs2[2], locs2[1]);
  // Bottom of triangle
  // shape.addQuad(locs2[0], locs2[3], locs2[4], locs2[7]);

  // y = track_height + wall_height;
  // // End wall
  // positions.push(z, y, outer_track);
  // positions.push(z, 0, outer_track);
  // positions.push(z, 0, track_width);
  // colors.push(color.r, color.g, color.b, alpha);
  // colors.push(color.r, color.g, color.b, alpha);
  // colors.push(color.r, color.g, color.b, alpha);
  // positions.push(z, y, outer_track);
  // positions.push(z, 0, track_width);
  // positions.push(z, y, track_width);
  // colors.push(color.r, color.g, color.b, alpha);
  // colors.push(color.r, color.g, color.b, alpha);
  // colors.push(color.r, color.g, color.b, alpha);
  //
  // y = track_height;
  // // End wall 2
  // positions.push(z, y, track_width);
  // positions.push(z, 0, track_width);
  // positions.push(z, 0, triangle_edge_width);
  // colors.push(color.r, color.g, color.b, alpha);
  // colors.push(color.r, color.g, color.b, alpha);
  // colors.push(color.r, color.g, color.b, alpha);
  // positions.push(z, y, track_width);
  // positions.push(z, 0, triangle_edge_width);
  // positions.push(z, y, triangle_edge_width);
  // colors.push(color.r, color.g, color.b, alpha);
  // colors.push(color.r, color.g, color.b, alpha);
  // colors.push(color.r, color.g, color.b, alpha);
  //
  // y = track_height;
  // // End wall 3
  // positions.push(z, y, -triangle_edge_width);
  // positions.push(z, 0, -triangle_edge_width);
  // positions.push(z, 0, -track_width);
  // colors.push(color.r, color.g, color.b, alpha);
  // colors.push(color.r, color.g, color.b, alpha);
  // colors.push(color.r, color.g, color.b, alpha);
  // positions.push(z, y, -triangle_edge_width);
  // positions.push(z, 0, -track_width);
  // positions.push(z, y, -track_width);
  // colors.push(color.r, color.g, color.b, alpha);
  // colors.push(color.r, color.g, color.b, alpha);
  // colors.push(color.r, color.g, color.b, alpha);
  //
  // y = track_height + wall_height;
  // // End wall 4
  // positions.push(z, y, -track_width);
  // positions.push(z, 0, -track_width);
  // positions.push(z, 0, -outer_track);
  // colors.push(color.r, color.g, color.b, alpha);
  // colors.push(color.r, color.g, color.b, alpha);
  // colors.push(color.r, color.g, color.b, alpha);
  // positions.push(z, y, -track_width);
  // positions.push(z, 0, -outer_track);
  // positions.push(z, y, -outer_track);
  // colors.push(color.r, color.g, color.b, alpha);
  // colors.push(color.r, color.g, color.b, alpha);
  // colors.push(color.r, color.g, color.b, alpha);
  //
  // y = track_height + wall_height;
  // // End wall
  // positions.push(-z, y, track_width);
  // positions.push(-z, 0, track_width);
  // positions.push(-z, 0, outer_track);
  // colors.push(color.r, color.g, color.b, alpha);
  // colors.push(color.r, color.g, color.b, alpha);
  // colors.push(color.r, color.g, color.b, alpha);
  // positions.push(-z, y, track_width);
  // positions.push(-z, 0, outer_track);
  // positions.push(-z, y, outer_track);
  // colors.push(color.r, color.g, color.b, alpha);
  // colors.push(color.r, color.g, color.b, alpha);
  // colors.push(color.r, color.g, color.b, alpha);
  //
  // y = track_height;
  // // End wall 2
  // positions.push(-z + connector_inset, y, -connector_width);
  // positions.push(-z + connector_inset, 0, -connector_width);
  // positions.push(-z + connector_inset, 0, connector_width);
  // colors.push(color.r, color.g, color.b, alpha);
  // colors.push(color.r, color.g, color.b, alpha);
  // colors.push(color.r, color.g, color.b, alpha);
  // positions.push(-z + connector_inset, y, -connector_width);
  // positions.push(-z + connector_inset, 0, connector_width);
  // positions.push(-z + connector_inset, y, connector_width);
  // colors.push(color.r, color.g, color.b, alpha);
  // colors.push(color.r, color.g, color.b, alpha);
  // colors.push(color.r, color.g, color.b, alpha);
  //
  // y = track_height + wall_height;
  // // End wall 3
  // positions.push(-z, y, -outer_track);
  // positions.push(-z, 0, -outer_track);
  // positions.push(-z, 0, -track_width);
  // colors.push(color.r, color.g, color.b, alpha);
  // colors.push(color.r, color.g, color.b, alpha);
  // colors.push(color.r, color.g, color.b, alpha);
  // positions.push(-z, y, -outer_track);
  // positions.push(-z, 0, -track_width);
  // positions.push(-z, y, -track_width);
  // colors.push(color.r, color.g, color.b, alpha);
  // colors.push(color.r, color.g, color.b, alpha);
  // colors.push(color.r, color.g, color.b, alpha);
  //
  //
  // y = track_height;
  // z = length;
  // // Connector triangle
  // positions.push(z + triangle_outset, y, triangle_long_width);
  // positions.push(z + triangle_outset, y, -triangle_long_width);
  // positions.push(z, y, triangle_edge_width);
  // colors.push(color.r, color.g, color.b, alpha);
  // colors.push(color.r, color.g, color.b, alpha);
  // colors.push(color.r, color.g, color.b, alpha);
  // positions.push(z + triangle_outset, y, -triangle_long_width);
  // positions.push(z, y, -triangle_edge_width);
  // positions.push(z, y, triangle_edge_width);
  // colors.push(color.r, color.g, color.b, alpha);
  // colors.push(color.r, color.g, color.b, alpha);
  // colors.push(color.r, color.g, color.b, alpha);
  //
  // positions.push(z + triangle_outset, 0, -triangle_long_width);
  // positions.push(z + triangle_outset, 0, triangle_long_width);
  // positions.push(z, 0, triangle_edge_width);
  // colors.push(color.r, color.g, color.b, alpha);
  // colors.push(color.r, color.g, color.b, alpha);
  // colors.push(color.r, color.g, color.b, alpha);
  // positions.push(z, 0, -triangle_edge_width);
  // positions.push(z + triangle_outset, 0, -triangle_long_width);
  // positions.push(z, 0, triangle_edge_width);
  // colors.push(color.r, color.g, color.b, alpha);
  // colors.push(color.r, color.g, color.b, alpha);
  // colors.push(color.r, color.g, color.b, alpha);
  //
  // // Connector end wall.
  // positions.push(z + triangle_outset, 0, -triangle_long_width);
  // positions.push(z + triangle_outset, 3, triangle_long_width);
  // positions.push(z + triangle_outset, 0, triangle_long_width);
  // colors.push(color.r, color.g, color.b, alpha);
  // colors.push(color.r, color.g, color.b, alpha);
  // colors.push(color.r, color.g, color.b, alpha);
  // positions.push(z + triangle_outset, 0, -triangle_long_width);
  // positions.push(z + triangle_outset, 3, -triangle_long_width);
  // positions.push(z + triangle_outset, 3, triangle_long_width);
  // colors.push(color.r, color.g, color.b, alpha);
  // colors.push(color.r, color.g, color.b, alpha);
  // colors.push(color.r, color.g, color.b, alpha);
  //
  // // Connector side wall 1
  // positions.push(z + triangle_outset, 0, -triangle_long_width);
  // positions.push(z, 0, -triangle_edge_width);
  // positions.push(z + triangle_outset, 3, -triangle_long_width);
  // colors.push(color.r, color.g, color.b, alpha);
  // colors.push(color.r, color.g, color.b, alpha);
  // colors.push(color.r, color.g, color.b, alpha);
  // positions.push(z + triangle_outset, 3, -triangle_long_width);
  // positions.push(z, 0, -triangle_edge_width);
  // positions.push(z, 3, -triangle_edge_width);
  // colors.push(color.r, color.g, color.b, alpha);
  // colors.push(color.r, color.g, color.b, alpha);
  // colors.push(color.r, color.g, color.b, alpha);
  //
  // // Connector side wall 2
  // positions.push(z + triangle_outset, 0, triangle_long_width);
  // positions.push(z + triangle_outset, 3, triangle_long_width);
  // positions.push(z, 0, triangle_edge_width);
  // colors.push(color.r, color.g, color.b, alpha);
  // colors.push(color.r, color.g, color.b, alpha);
  // colors.push(color.r, color.g, color.b, alpha);
  // positions.push(z + triangle_outset, 3, triangle_long_width);
  // positions.push(z, 3, triangle_edge_width);
  // positions.push(z, 0, triangle_edge_width);
  // colors.push(color.r, color.g, color.b, alpha);
  // colors.push(color.r, color.g, color.b, alpha);
  // colors.push(color.r, color.g, color.b, alpha);
  //
  // y = track_height;
  // // In connector side wall 1
  // positions.push(-z, y, -track_width);
  // positions.push(-z, 0, -track_width);
  // positions.push(-z, 0, -edge_connector_width);
  // colors.push(color.r, color.g, color.b, alpha);
  // colors.push(color.r, color.g, color.b, alpha);
  // colors.push(color.r, color.g, color.b, alpha);
  // positions.push(-z, y, -track_width);
  // positions.push(-z, 0, -edge_connector_width);
  // positions.push(-z, y, -edge_connector_width);
  // colors.push(color.r, color.g, color.b, alpha);
  // colors.push(color.r, color.g, color.b, alpha);
  // colors.push(color.r, color.g, color.b, alpha);
  //
  // y = track_height;
  // // In connector side wall 2
  // positions.push(-z, y, -edge_connector_width);
  // positions.push(-z, 0, -edge_connector_width);
  // positions.push(-z + connector_inset, 0, -connector_width);
  // colors.push(color.r, color.g, color.b, alpha);
  // colors.push(color.r, color.g, color.b, alpha);
  // colors.push(color.r, color.g, color.b, alpha);
  // positions.push(-z, y, -edge_connector_width);
  // positions.push(-z + connector_inset, 0, -connector_width);
  // positions.push(-z + connector_inset, y, -connector_width);
  // colors.push(color.r, color.g, color.b, alpha);
  // colors.push(color.r, color.g, color.b, alpha);
  // colors.push(color.r, color.g, color.b, alpha);
  //
  // y = track_height;
  // // In connector side wall 3
  // positions.push(-z, y, edge_connector_width);
  // positions.push(-z + connector_inset, 0, connector_width);
  // positions.push(-z, 0, edge_connector_width);
  // colors.push(color.r, color.g, color.b, alpha);
  // colors.push(color.r, color.g, color.b, alpha);
  // colors.push(color.r, color.g, color.b, alpha);
  // positions.push(-z, y, edge_connector_width);
  // positions.push(-z + connector_inset, y, connector_width);
  // positions.push(-z + connector_inset, 0, connector_width);
  // colors.push(color.r, color.g, color.b, alpha);
  // colors.push(color.r, color.g, color.b, alpha);
  // colors.push(color.r, color.g, color.b, alpha);
  //
  // y = track_height;
  // // In connector side wall 4
  // positions.push(-z, y, edge_connector_width);
  // positions.push(-z, 0, edge_connector_width);
  // positions.push(-z, 0, track_width);
  // colors.push(color.r, color.g, color.b, alpha);
  // colors.push(color.r, color.g, color.b, alpha);
  // colors.push(color.r, color.g, color.b, alpha);
  // positions.push(-z, y, edge_connector_width);
  // positions.push(-z, 0, track_width);
  // positions.push(-z, y, track_width);
  // colors.push(color.r, color.g, color.b, alpha);
  // colors.push(color.r, color.g, color.b, alpha);
  // colors.push(color.r, color.g, color.b, alpha);
  //
  // y = track_height;
  // // In connector top 1
  // positions.push(-z, y, -track_width);
  // positions.push(-z, y, -edge_connector_width);
  // positions.push(-z + connector_inset, y, -connector_width);
  // colors.push(color.r, color.g, color.b, alpha);
  // colors.push(color.r, color.g, color.b, alpha);
  // colors.push(color.r, color.g, color.b, alpha);
  // positions.push(-z, y, -track_width);
  // positions.push(-z + connector_inset, y, -connector_width);
  // positions.push(-z + connector_inset, y, -track_width);
  // colors.push(color.r, color.g, color.b, alpha);
  // colors.push(color.r, color.g, color.b, alpha);
  // colors.push(color.r, color.g, color.b, alpha);
  //
  // y = track_height;
  // // In connector top 2
  // positions.push(-z, y, track_width);
  // positions.push(-z + connector_inset, y, connector_width);
  // positions.push(-z, y, edge_connector_width);
  // colors.push(color.r, color.g, color.b, alpha);
  // colors.push(color.r, color.g, color.b, alpha);
  // colors.push(color.r, color.g, color.b, alpha);
  // positions.push(-z, y, track_width);
  // positions.push(-z + connector_inset, y, track_width);
  // positions.push(-z + connector_inset, y, connector_width);
  // colors.push(color.r, color.g, color.b, alpha);
  // colors.push(color.r, color.g, color.b, alpha);
  // colors.push(color.r, color.g, color.b, alpha);
  //
  // y = track_height;
  // // In connector bottom 1
  // positions.push(-z, 0, -outer_track);
  // positions.push(-z + connector_inset, 0, -connector_width);
  // positions.push(-z, 0, -edge_connector_width);
  // colors.push(color.r, color.g, color.b, alpha);
  // colors.push(color.r, color.g, color.b, alpha);
  // colors.push(color.r, color.g, color.b, alpha);
  // positions.push(-z, 0, -outer_track);
  // positions.push(-z + connector_inset, 0, -outer_track);
  // positions.push(-z + connector_inset, 0, -connector_width);
  // colors.push(color.r, color.g, color.b, alpha);
  // colors.push(color.r, color.g, color.b, alpha);
  // colors.push(color.r, color.g, color.b, alpha);
  //
  // y = track_height;
  // // In connector bottom 2
  // positions.push(-z, 0, outer_track);
  // positions.push(-z, 0, edge_connector_width);
  // positions.push(-z + connector_inset, 0, connector_width);
  // colors.push(color.r, color.g, color.b, alpha);
  // colors.push(color.r, color.g, color.b, alpha);
  // colors.push(color.r, color.g, color.b, alpha);
  // positions.push(-z, 0, outer_track);
  // positions.push(-z + connector_inset, 0, connector_width);
  // positions.push(-z + connector_inset, 0, outer_track);
  // colors.push(color.r, color.g, color.b, alpha);
  // colors.push(color.r, color.g, color.b, alpha);
  // colors.push(color.r, color.g, color.b, alpha);


  let positions = shape.positions;
  let colors = shape.colors;
  const geometry = new THREE.BufferGeometry();

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  geometry.computeVertexNormals();
  return geometry;
}