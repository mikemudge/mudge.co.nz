
loadGeometry = function() {
  const geometry = new THREE.BufferGeometry();

  const positions = [];
  const colors = [];

  const color = new THREE.Color();
  alpha = 1;

  track_height = 3;
  track_width = 18.5;
  wall_height = 3;
  wall_width = 1.5;
  length = 40;

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

  // Red
  color.setRGB(1.0, 0, 0);
  positions.push(-z + connector_inset, y, -track_width);
  positions.push(-z + connector_inset, y, track_width);
  positions.push(z, y, track_width);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  positions.push(-z + connector_inset, y, -track_width);
  positions.push(z, y, track_width);
  positions.push(z, y, -track_width);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);

  y = track_height + wall_height;

  // Top right
  positions.push(-z, y, track_width);
  positions.push(-z, y, outer_track);
  positions.push(z, y, outer_track);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  positions.push(-z, y, track_width);
  positions.push(z, y, outer_track);
  positions.push(z, y, track_width);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);

  // Top left
  positions.push(-z, y, -outer_track);
  positions.push(-z, y, -track_width);
  positions.push(z, y, -track_width);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  positions.push(-z, y, -outer_track);
  positions.push(z, y, -track_width);
  positions.push(z, y, -outer_track);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);

  // Bottom
  positions.push(-z + connector_inset, 0, outer_track);
  positions.push(-z + connector_inset, 0, -outer_track);
  positions.push(z, 0, -outer_track);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  positions.push(-z + connector_inset, 0, outer_track);
  positions.push(z, 0, -outer_track);
  positions.push(z, 0, outer_track);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);

  y = track_height + wall_height;
  // Outer wall left
  positions.push(-z, 0, -outer_track);
  positions.push(-z, y, -outer_track);
  positions.push(z, y, -outer_track);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  positions.push(-z, 0, -outer_track);
  positions.push(z, y, -outer_track);
  positions.push(z, 0, -outer_track);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);

  y = track_height + wall_height;
  // Inner wall left
  positions.push(-z, y, -track_width);
  positions.push(-z, 3, -track_width);
  positions.push(z, 3, -track_width);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  positions.push(-z, y, -track_width);
  positions.push(z, 3, -track_width);
  positions.push(z, y, -track_width);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);

  y = track_height + wall_height;
  // Inner wall right
  positions.push(-z, 3, track_width);
  positions.push(-z, y, track_width);
  positions.push(z, y, track_width);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  positions.push(-z, 3, track_width);
  positions.push(z, y, track_width);
  positions.push(z, 3, track_width);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);

  y = track_height + wall_height;
  // Inner wall right
  positions.push(-z, y, outer_track);
  positions.push(-z, 0, outer_track);
  positions.push(z, 0, outer_track);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  positions.push(-z, y, outer_track);
  positions.push(z, 0, outer_track);
  positions.push(z, y, outer_track);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);

  y = track_height + wall_height;
  // End wall
  positions.push(z, y, outer_track);
  positions.push(z, 0, outer_track);
  positions.push(z, 0, track_width);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  positions.push(z, y, outer_track);
  positions.push(z, 0, track_width);
  positions.push(z, y, track_width);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);

  y = track_height;
  // End wall 2
  positions.push(z, y, track_width);
  positions.push(z, 0, track_width);
  positions.push(z, 0, triangle_edge_width);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  positions.push(z, y, track_width);
  positions.push(z, 0, triangle_edge_width);
  positions.push(z, y, triangle_edge_width);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);

  y = track_height;
  // End wall 3
  positions.push(z, y, -triangle_edge_width);
  positions.push(z, 0, -triangle_edge_width);
  positions.push(z, 0, -track_width);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  positions.push(z, y, -triangle_edge_width);
  positions.push(z, 0, -track_width);
  positions.push(z, y, -track_width);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);

  y = track_height + wall_height;
  // End wall 4
  positions.push(z, y, -track_width);
  positions.push(z, 0, -track_width);
  positions.push(z, 0, -outer_track);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  positions.push(z, y, -track_width);
  positions.push(z, 0, -outer_track);
  positions.push(z, y, -outer_track);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);

  y = track_height + wall_height;
  // End wall
  positions.push(-z, y, track_width);
  positions.push(-z, 0, track_width);
  positions.push(-z, 0, outer_track);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  positions.push(-z, y, track_width);
  positions.push(-z, 0, outer_track);
  positions.push(-z, y, outer_track);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);

  y = track_height;
  // End wall 2
  positions.push(-z + connector_inset, y, -connector_width);
  positions.push(-z + connector_inset, 0, -connector_width);
  positions.push(-z + connector_inset, 0, connector_width);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  positions.push(-z + connector_inset, y, -connector_width);
  positions.push(-z + connector_inset, 0, connector_width);
  positions.push(-z + connector_inset, y, connector_width);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);

  y = track_height + wall_height;
  // End wall 3
  positions.push(-z, y, -outer_track);
  positions.push(-z, 0, -outer_track);
  positions.push(-z, 0, -track_width);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  positions.push(-z, y, -outer_track);
  positions.push(-z, 0, -track_width);
  positions.push(-z, y, -track_width);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);


  y = track_height;
  z = length;
  // Connector triangle
  positions.push(z + triangle_outset, y, triangle_long_width);
  positions.push(z + triangle_outset, y, -triangle_long_width);
  positions.push(z, y, triangle_edge_width);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  positions.push(z + triangle_outset, y, -triangle_long_width);
  positions.push(z, y, -triangle_edge_width);
  positions.push(z, y, triangle_edge_width);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);

  positions.push(z + triangle_outset, 0, -triangle_long_width);
  positions.push(z + triangle_outset, 0, triangle_long_width);
  positions.push(z, 0, triangle_edge_width);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  positions.push(z, 0, -triangle_edge_width);
  positions.push(z + triangle_outset, 0, -triangle_long_width);
  positions.push(z, 0, triangle_edge_width);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);

  // Connector end wall.
  positions.push(z + triangle_outset, 0, -triangle_long_width);
  positions.push(z + triangle_outset, 3, triangle_long_width);
  positions.push(z + triangle_outset, 0, triangle_long_width);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  positions.push(z + triangle_outset, 0, -triangle_long_width);
  positions.push(z + triangle_outset, 3, -triangle_long_width);
  positions.push(z + triangle_outset, 3, triangle_long_width);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);

  // Connector side wall 1
  positions.push(z + triangle_outset, 0, -triangle_long_width);
  positions.push(z, 0, -triangle_edge_width);
  positions.push(z + triangle_outset, 3, -triangle_long_width);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  positions.push(z + triangle_outset, 3, -triangle_long_width);
  positions.push(z, 0, -triangle_edge_width);
  positions.push(z, 3, -triangle_edge_width);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);

  // Connector side wall 2
  positions.push(z + triangle_outset, 0, triangle_long_width);
  positions.push(z + triangle_outset, 3, triangle_long_width);
  positions.push(z, 0, triangle_edge_width);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  positions.push(z + triangle_outset, 3, triangle_long_width);
  positions.push(z, 3, triangle_edge_width);
  positions.push(z, 0, triangle_edge_width);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);

  y = track_height;
  // In connector side wall 1
  positions.push(-z, y, -track_width);
  positions.push(-z, 0, -track_width);
  positions.push(-z, 0, -edge_connector_width);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  positions.push(-z, y, -track_width);
  positions.push(-z, 0, -edge_connector_width);
  positions.push(-z, y, -edge_connector_width);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);

  y = track_height;
  // In connector side wall 2
  positions.push(-z, y, -edge_connector_width);
  positions.push(-z, 0, -edge_connector_width);
  positions.push(-z + connector_inset, 0, -connector_width);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  positions.push(-z, y, -edge_connector_width);
  positions.push(-z + connector_inset, 0, -connector_width);
  positions.push(-z + connector_inset, y, -connector_width);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);

  y = track_height;
  // In connector side wall 3
  positions.push(-z, y, edge_connector_width);
  positions.push(-z + connector_inset, 0, connector_width);
  positions.push(-z, 0, edge_connector_width);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  positions.push(-z, y, edge_connector_width);
  positions.push(-z + connector_inset, y, connector_width);
  positions.push(-z + connector_inset, 0, connector_width);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);

  y = track_height;
  // In connector side wall 4
  positions.push(-z, y, edge_connector_width);
  positions.push(-z, 0, edge_connector_width);
  positions.push(-z, 0, track_width);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  positions.push(-z, y, edge_connector_width);
  positions.push(-z, 0, track_width);
  positions.push(-z, y, track_width);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);

  y = track_height;
  // In connector top 1
  positions.push(-z, y, -track_width);
  positions.push(-z, y, -edge_connector_width);
  positions.push(-z + connector_inset, y, -connector_width);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  positions.push(-z, y, -track_width);
  positions.push(-z + connector_inset, y, -connector_width);
  positions.push(-z + connector_inset, y, -track_width);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);

  y = track_height;
  // In connector top 2
  positions.push(-z, y, track_width);
  positions.push(-z + connector_inset, y, connector_width);
  positions.push(-z, y, edge_connector_width);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  positions.push(-z, y, track_width);
  positions.push(-z + connector_inset, y, track_width);
  positions.push(-z + connector_inset, y, connector_width);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);

  y = track_height;
  // In connector bottom 1
  positions.push(-z, 0, -outer_track);
  positions.push(-z + connector_inset, 0, -connector_width);
  positions.push(-z, 0, -edge_connector_width);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  positions.push(-z, 0, -outer_track);
  positions.push(-z + connector_inset, 0, -outer_track);
  positions.push(-z + connector_inset, 0, -connector_width);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);

  y = track_height;
  // In connector bottom 2
  positions.push(-z, 0, outer_track);
  positions.push(-z, 0, edge_connector_width);
  positions.push(-z + connector_inset, 0, connector_width);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  positions.push(-z, 0, outer_track);
  positions.push(-z + connector_inset, 0, connector_width);
  positions.push(-z + connector_inset, 0, outer_track);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  geometry.computeVertexNormals();
  return geometry;
}