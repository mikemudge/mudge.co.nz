
loadGeometry = function() {
  const geometry = new THREE.BufferGeometry();

  const positions = [];
  const colors = [];

  const color = new THREE.Color();
  alpha = 1;

  track_height = 3;
  track_width = 20;
  wall_height = 3;
  wall_width = 1.5;
  length = 100;

  // Red
  color.setRGB(1.0, 0, 0);
  positions.push(-length/2, 0, -track_width / 2 - wall_width);
  positions.push(-length/2, 3, track_width / 2 + wall_width);
  positions.push(-length/2, 3, -track_width / 2 - wall_width);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);

  positions.push(-20, -20, -20);
  positions.push(-20, -20, 20);
  positions.push(-20, 20, 20);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);

  // Yellow
  color.setRGB(1.0, 1.0, 0);
  positions.push(-20, -20, -20);
  positions.push(20, 20, -20);
  positions.push(20, -20, -20);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);

  positions.push(-20, -20, -20);
  positions.push(-20, 20, -20);
  positions.push(20, 20, -20);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);

  // Purple
  color.setRGB(1.0, 0, 1.0);
  positions.push(-20, -20, -20);
  positions.push(20, -20, -20);
  positions.push(20, -20, 20);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);

  positions.push(-20, -20, -20);
  positions.push(20, -20, 20);
  positions.push(-20, -20, 20);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);


  // Green
  color.setRGB(0, 1.0, 0);
  positions.push(20, -20, -20);
  positions.push(20, 20, -20);
  positions.push(20, 20, 20);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);

  positions.push(20, -20, -20);
  positions.push(20, 20, 20);
  positions.push(20, -20, 20);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);

  // Blue
  color.setRGB(0, 0, 1.0);
  positions.push(-20, -20, 20);
  positions.push(20, -20, 20);
  positions.push(20, 20, 20);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);

  positions.push(-20, -20, 20);
  positions.push(20, 20, 20);
  positions.push(-20, 20, 20);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);

  // Light Blue
  color.setRGB(0, 1.0, 1.0);
  positions.push(-20, 20, -20);
  positions.push(20, 20, 20);
  positions.push(20, 20, -20);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);

  positions.push(-20, 20, -20);
  positions.push(-20, 20, 20);
  positions.push(20, 20, 20);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);
  colors.push(color.r, color.g, color.b, alpha);


  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  geometry.computeVertexNormals();
  return geometry;
}