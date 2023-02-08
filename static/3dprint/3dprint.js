
const scene = new THREE.Scene();
scene.background = new THREE.Color( 0x000000 );
const camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );

params = new URLSearchParams(window.location.search);


const material = new THREE.MeshPhongMaterial( {
	color: 0xaaaaaa, specular: 0xffffff, shininess: 250,
	side: THREE.FrontSide, vertexColors: true, transparent: true
} );

geometry = loadGeometry();
// const material = new THREE.MeshBasicMaterial( { color: 0x00ff00 } );
// material.side = THREE.FrontSide;
const cube = new THREE.Mesh( geometry, material );
cube.rotation.z = Math.PI / 2;
cube.rotation.y = Math.PI / 2;
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
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minPolarAngle = 0.25; // radians
controls.maxPolarAngle = Math.PI - 0.5; // radians


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

angular.module('3dprint', [
	'config',
	'ngRoute'
])
.config(function($routeProvider, config) {
	$routeProvider
	.otherwise({
		templateUrl: '/static/3dprint/3dprint.tpl.html',
	});
});
