
const scene = new THREE.Scene();
scene.background = new THREE.Color( 0x000000 );
const camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );

const geometry = new THREE.BufferGeometry();

const positions = [];
const colors = [];

const color = new THREE.Color();
alpha = 1;
// red
color.setRGB(1.0, 0, 0);
// gold
// color.setRGB(1, .78, .21);
// silver
// color.setRGB(.75, .75, .75);

let ringRadius = 1.5;
let radius = 17/2 + ringRadius * 0.5;
let ptsA = 100;
let ptsB = 50;
let pts = [];
for (r = 0; r < ptsB; r ++) {
	ang1 = Math.PI * 2 * r / ptsB;
	y = Math.cos(ang1) * ringRadius;
	extraR = Math.sin(ang1) * ringRadius;
	if (extraR < 0) extraR *= 0.5;
	actualRadius = radius + extraR;
	pts.push([]);
	for (i = 0; i < ptsA; i ++) {
		ang2 = Math.PI * 2 * i / ptsA;
		z = Math.sin(ang2) * actualRadius;
		x = Math.cos(ang2) * actualRadius;
		pts[r].push({
			x: x,
			y: y * 2,
			z: z,
		});
	}
}

for (r = 0; r < ptsB; r ++) {
	for (i = 0; i < ptsA; i ++) {
		ni = (i + 1) % ptsA;
		nr = (r + 1) % ptsB;
		p = pts[r][i];
		p1 = pts[r][ni];
		p2 = pts[nr][i];
		p3 = pts[nr][ni];

		positions.push(p.x, p.y, p.z);
		colors.push( color.r, color.g, color.b, alpha );
		positions.push(p1.x, p1.y, p1.z);
		colors.push( color.r, color.g, color.b, alpha );
		positions.push(p2.x, p2.y, p2.z);
		colors.push( color.r, color.g, color.b, alpha );

		positions.push(p3.x, p3.y, p3.z);
		colors.push( color.r, color.g, color.b, alpha );
		positions.push(p2.x, p2.y, p2.z);
		colors.push( color.r, color.g, color.b, alpha );
		positions.push(p1.x, p1.y, p1.z);
		colors.push( color.r, color.g, color.b, alpha );
	}
}


geometry.setAttribute( 'position', new THREE.Float32BufferAttribute( positions, 3 ) );
geometry.setAttribute( 'color', new THREE.Float32BufferAttribute( colors, 4 ));
geometry.computeVertexNormals();


const material = new THREE.MeshPhongMaterial( {
	color: 0xaaaaaa, specular: 0xffffff, shininess: 250,
	side: THREE.FrontSide, vertexColors: true, transparent: true
} );

// const material = new THREE.MeshBasicMaterial( { color: 0x00ff00 } );
// material.side = THREE.FrontSide;
const cube = new THREE.Mesh( geometry, material );
scene.add( cube );

camera.position.z = 100;
camera.position.y = 50;

scene.add( new THREE.AmbientLight(0xC0C0C0) );

const light1 = new THREE.PointLight(0x404040);
light1.position.set( 20, 20, 20 );
scene.add( light1 );

const light2 = new THREE.PointLight(0x404040);
light2.position.set( -20, 20, -20 );
scene.add( light2 );

controls = new THREE.OrbitControls(camera);

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
	controls.update();
	renderer.render( scene, camera );
}
animate();
