
class Game {
  constructor() {
    this.width = 10;
    this.height = 10;
    this.size = 20;
  }

  update() {

  }

  draw() {
  }
}
let shape;

function preload() {
  shape = loadModel('/static/p5/game/OBJTest/conveyor-bars-sides.obj', true);
  material = loadImage('/static/p5/game/OBJTest/Textures/colormap.png');
  console.log(shape);
}

function setup() {
  c = createCanvas(500, 500, WEBGL);
  describe("A Factory Game with conveyor belts");
  c.canvas.oncontextmenu = function() {
    // Support right click to open developer tools.
    return false;
  }

  // Set the camera up at an 45 degree angle on all axis.
  camera(500, -500, 500, 0, 0, 0, 0, 1, 0);

  frameRate(30);
  // game = new Game();
}

function draw() {
  background(100);

  // Enable orbiting with the mouse.
  // This orbits the scene, so it takes all the lighting with it.
  orbitControl(2, 2, 2);

  // Light which follows the mouse, centered.
  // pointLight(255, 255, 255, 0, 100, 100);
  ambientLight(255, 255, 255);

  directionalLight(255, 255, 255, 0, 1, 0)

  specularMaterial(255);
  noStroke();
  shininess(200);
  metalness(100);

  // Show a 3d grid.
  debugMode();

  push();
  rotateX(3.14); // 180 around the X axis
  translate(-100,0,100);
  // Draw the shape.
  texture(material);
  model(shape);
  pop();

  push();
  rotateX(3.14); // 180 around the X axis
  translate(100,0,-100);
  // Draw the shape.
  texture(material);
  model(shape);
  pop();

  push();
  rotateX(3.14); // 180 around the X axis
  translate(100,0,100);
  // Draw the shape.
  texture(material);
  model(shape);
  pop();

  push();
  rotateX(3.14); // 180 around the X axis
  translate(-100,0,-100);
  // Draw the shape.
  texture(material);
  model(shape);
  pop();
}
