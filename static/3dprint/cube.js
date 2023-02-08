
loadGeometry = function() {
  const geometry = new THREE.BufferGeometry();

  const positions = [];
  const colors = [];

  const color = new THREE.Color();
  alpha = 1;

  // Red
  color.setRGB(1.0, 0, 0);
  positions.push(-20, -20, -20);
  positions.push(-20, 20, 20);
  positions.push(-20, 20, -20);
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