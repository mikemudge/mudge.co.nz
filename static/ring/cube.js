
const scene = new THREE.Scene();
scene.background = new THREE.Color( 0x555555 );
const camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );

// These are measured as mm in cura.
// This makes a simple box at 20x20x20mm
// const geometry = new THREE.BoxGeometry( 20, 20, 20 );

const geometry = new THREE.BufferGeometry();

const positions = [];
const colors = [];

const color = new THREE.Color();
alpha = 1;

// Red
color.setRGB(1.0, 0, 0);
positions.push( -20, -20, -20 );
positions.push( -20, 20, 20 );
positions.push( -20, 20, -20 );
colors.push( color.r, color.g, color.b, alpha );
colors.push( color.r, color.g, color.b, alpha );
colors.push( color.r, color.g, color.b, alpha );

positions.push( -20, -20, -20 );
positions.push( -20, -20, 20 );
positions.push( -20, 20, 20 );
colors.push( color.r, color.g, color.b, alpha );
colors.push( color.r, color.g, color.b, alpha );
colors.push( color.r, color.g, color.b, alpha );

// Yellow
color.setRGB(1.0, 1.0, 0);
positions.push( -20, -20, -20 );
positions.push( 20, 20, -20 );
positions.push( 20, -20, -20 );
colors.push( color.r, color.g, color.b, alpha );
colors.push( color.r, color.g, color.b, alpha );
colors.push( color.r, color.g, color.b, alpha );

positions.push( -20, -20, -20 );
positions.push( -20, 20, -20 );
positions.push( 20, 20, -20 );
colors.push( color.r, color.g, color.b, alpha );
colors.push( color.r, color.g, color.b, alpha );
colors.push( color.r, color.g, color.b, alpha );

// Purple
color.setRGB(1.0, 0, 1.0);
positions.push( -20, -20, -20 );
positions.push( 20, -20, -20 );
positions.push( 20, -20, 20 );
colors.push( color.r, color.g, color.b, alpha );
colors.push( color.r, color.g, color.b, alpha );
colors.push( color.r, color.g, color.b, alpha );

positions.push( -20, -20, -20 );
positions.push( 20, -20, 20 );
positions.push( -20, -20, 20 );
colors.push( color.r, color.g, color.b, alpha );
colors.push( color.r, color.g, color.b, alpha );
colors.push( color.r, color.g, color.b, alpha );


// Green
color.setRGB(0, 1.0, 0);
positions.push( 20, -20, -20 );
positions.push( 20, 20, -20 );
positions.push( 20, 20, 20 );
colors.push( color.r, color.g, color.b, alpha );
colors.push( color.r, color.g, color.b, alpha );
colors.push( color.r, color.g, color.b, alpha );

positions.push( 20, -20, -20 );
positions.push( 20, 20, 20 );
positions.push( 20, -20, 20 );
colors.push( color.r, color.g, color.b, alpha );
colors.push( color.r, color.g, color.b, alpha );
colors.push( color.r, color.g, color.b, alpha );

// Blue
color.setRGB(0, 0, 1.0);
positions.push( -20, -20, 20 );
positions.push( 20, -20, 20 );
positions.push( 20, 20, 20 );
colors.push( color.r, color.g, color.b, alpha );
colors.push( color.r, color.g, color.b, alpha );
colors.push( color.r, color.g, color.b, alpha );

positions.push( -20, -20, 20 );
positions.push( 20, 20, 20 );
positions.push( -20, 20, 20 );
colors.push( color.r, color.g, color.b, alpha );
colors.push( color.r, color.g, color.b, alpha );
colors.push( color.r, color.g, color.b, alpha );

// Light Blue
color.setRGB(0, 1.0, 1.0);
positions.push( -20, 20, -20 );
positions.push( 20, 20, 20 );
positions.push( 20, 20, -20 );
colors.push( color.r, color.g, color.b, alpha );
colors.push( color.r, color.g, color.b, alpha );
colors.push( color.r, color.g, color.b, alpha );

positions.push( -20, 20, -20 );
positions.push( -20, 20, 20 );
positions.push( 20, 20, 20 );
colors.push( color.r, color.g, color.b, alpha );
colors.push( color.r, color.g, color.b, alpha );
colors.push( color.r, color.g, color.b, alpha );


geometry.setAttribute( 'position', new THREE.Float32BufferAttribute( positions, 3 ) );
geometry.setAttribute( 'color', new THREE.Float32BufferAttribute( colors, 4 ));
geometry.computeVertexNormals();


const material = new THREE.MeshBasicMaterial( {
	// color: 0xaaaaaa, specular: 0xffffff, shininess: 250,
	side: THREE.FrontSide, vertexColors: true, transparent: true
} );

// const material = new THREE.MeshBasicMaterial( { color: 0x00ff00 } );
// material.side = THREE.FrontSide;
const cube = new THREE.Mesh( geometry, material );
scene.add( cube );

camera.position.z = 100;


// Instantiate an exporter
const exporter = new OBJExporter();

// Parse the input and generate the OBJ output
const data = exporter.parse( scene );

var linkText = document.createTextNode("Download obj");
var a = document.createElement('a');
a.appendChild(linkText);
a.download='Cube.obj';
a.href = 'data:application/x-json;base64,' + btoa(data);
document.body.appendChild(a);

// Render the thing locally
const renderer = new THREE.WebGLRenderer();
renderer.setSize( window.innerWidth, window.innerHeight - 20 );
document.body.appendChild( renderer.domElement );

function animate() {
	requestAnimationFrame( animate );
	cube.rotation.x += 0.01;
	cube.rotation.y += 0.03;
	renderer.render( scene, camera );
}
animate();
