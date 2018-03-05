var SnowEffect = {};
SnowEffect.createSnow = function (camera, offsetPosition) {

    var snowVertexShader = [
        'precision mediump float;',
        'uniform float mobile;',
        'uniform float snowHeight;',
        'uniform float winHeight;',
        'uniform float devicePixelRatio;',
        'uniform vec3 cameraDirection;',
        'uniform float time;',
        'uniform sampler2D noiseTex;',
        'attribute float loop;',
        'attribute float size;',
        'attribute float radius;',
        'attribute float height;',
        'attribute float angle;',
        'attribute float rotationalSpeed;',
        'attribute float verticalSpeed;',
        'attribute vec3 turbulence;',
        'attribute float timeFinal;',
        'attribute vec3 posFinal;',
        'varying vec2 vTexOffset;',
        'varying float vDistance;',
        'varying float minDistance;',
        'vec3 newPosition()',
        '{',
            'vec3 pos = vec3(0.0);',
            'float rotSpeedOffset = 0.0;',
            'if (time < 0.0) ',
            '{',
                'rotSpeedOffset = time * time / 40.0;',
            '}',
            'pos.x = radius * cos((rotationalSpeed + rotSpeedOffset) * time + angle);',
            'pos.z = radius * sin((rotationalSpeed + rotSpeedOffset) * time + angle);',
            'pos.y = height + verticalSpeed * time;',
            'vec3 turb = turbulence * sin(turbulence * time + turbulence) * atan(time - timeFinal);',
            '//vec3 turb = 10.0 * turbulence * (texture2D(noiseTex, 0.02 * time * turbulence.xy).rgb - 0.5) * atan(time - timeFinal);',
            'pos += turb;',
            'if (time > timeFinal)',
            '{',
                'if (mobile==0.0 && loop==1.0) ',
                '{',
                    'pos.y = mod(pos.y, snowHeight);',
                '}',
                'else',
                '{',
                    'pos = posFinal;',
                '}',
            '}',
            'pos.y += size * 2.0;',
            'return pos;',
        '}',
        'void main() ',
        '{',
            'vec3 newPos = newPosition();',
            'minDistance = 20.0;',
            'vDistance = dot( newPos - cameraPosition, normalize(cameraDirection) );',
            'if (vDistance > minDistance)',
            '{',
                'gl_Position = projectionMatrix * modelViewMatrix * vec4(newPos, 1.0);',
                'gl_PointSize = size * winHeight * projectionMatrix[1][1] * devicePixelRatio / gl_Position.w; ',
            '}',
            'else',
            '{',
                'gl_Position.z = -1.0;',
            '}',
            'vTexOffset = 0.5 * vec2(height, angle);',
        '} '
    ].join("\n");

    snowFragmentShader = [
        'precision mediump float;',
        'const float alphaDecayBegin = 20.0;',
        'uniform sampler2D noiseTex;',
        'varying vec2 vTexOffset;',
        'varying float vDistance;',
        'varying float minDistance;',
        'void main()',
        '{',
            'float radius = length(vec2(gl_PointCoord.x-0.5, gl_PointCoord.y-0.5));',
            'float a = (1.0 - 4.0 * radius*radius);',
            'float n = sqrt(texture2D( noiseTex, 0.5 * gl_PointCoord + vTexOffset ).r);',
            'gl_FragColor = vec4( 1.0, 1.0, 1.0, n * a * exp(-vDistance/300.0) );',
        '} ',
      ].join("\n")

    var snowHeight = 250;
    var snowWidth = 100;
    var snowSpeed = 10;
    var snowTurbulence = 1.5;
    var particleCount = 1000;
    var particles = new THREE.Geometry();

    var maxFinalTime = 0;

    finalTimes = [];
    finalPositions = [];

    rotationalSpeeds = [];
    verticalSpeeds = [];
    turbulences = [];

    loops = [];
    sizes = [];
    radii = [];
    heights = [];
    angles = [];

    for (var i = 0; i < particleCount; i++) 
    {        
        var rotSpeed = ((Math.random() - 0.5) * snowSpeed/2) / 50;
        var vertSpeed = -(Math.random()/2 + 0.5) * snowSpeed;

        rotationalSpeeds.push(rotSpeed);
        verticalSpeeds.push(vertSpeed);

        var size = (new THREE.Vector2(rotSpeed, vertSpeed)).length() / snowSpeed;

        turbX = (Math.random()/2 + 0.5) * snowTurbulence / size;
        turbZ = (Math.random()/2 + 0.5) * snowTurbulence / size;
        turbY = (Math.random()/2 + 0.5) * snowTurbulence / size;
        turbulences.push(new THREE.Vector3(turbX, turbY, turbZ));

        // summation of random variables for Gaussian approximation (more summations, better Gaussian)
        // var radius = (Math.random()/3 + Math.random()/3 + Math.random()/3) * snowWidth;
        var radius = (Math.random()/2 + Math.random()/2) * snowWidth;
        var angle = Math.random() * 2 * Math.PI;
        var height = Math.random() * snowHeight * 2;

        var pX = radius * Math.cos(angle);
        var pZ = radius * Math.sin(angle);
        var pY = Math.random() * snowHeight * 2;

        var position = new THREE.Vector3(pX, pY, pZ)

        particles.vertices.push(position);

        var loop = 0; //Math.random() < 0.1;

        loops.push(loop);
        sizes.push(size);
        radii.push(radius);
        heights.push(height);
        angles.push(angle);

        var tFinal = height / (-vertSpeed);
        finalTimes.push(tFinal);

        pfX = radius * Math.cos(rotSpeed * tFinal + angle);
        pfZ = radius * Math.sin(rotSpeed * tFinal + angle);
        pfY = height + vertSpeed * tFinal;
        pFinal = new THREE.Vector3 (pfX, pfY, pfZ);
        finalPositions.push(pFinal);

        maxFinalTime = maxFinalTime < tFinal ? tFinal : maxFinalTime;
    };

    var noiseTexture = THREE.ImageUtils.loadTexture('/static/Snow/perlin-512.png');
    noiseTexture.wrapS = THREE.MirroredRepeatWrapping;
    noiseTexture.wrapT = THREE.MirroredRepeatWrapping;

    var uniforms = {
        mobile : { type: "f", value: jQuery.browser.mobile },
        snowHeight : { type: "f", value: snowHeight },
        winHeight : { type: "f", value: window.innerHeight },
        devicePixelRatio : { type: "f", value: window.devicePixelRatio },
        cameraDirection : { type: "v3", value: camera.getWorldDirection() },
        time : { type: "f", value: 0 },
        noiseTex : { type: "t", value: noiseTexture },
    };
    var attributes = {
        loop : { type: "f", value: loops },
        rotationalSpeed : { type: "f", value: rotationalSpeeds },
        verticalSpeed : { type: "f", value: verticalSpeeds },
        turbulence : { type: "v3", value: turbulences },
        size : { type: "f", value: sizes },
        radius : { type: "f", value: radii },
        height : { type: "f", value: heights },
        angle : { type: "f", value: angles },
        timeFinal : { type: "f", value: finalTimes },
        posFinal : { type: "v3", value: finalPositions },
    };
    var particleShaderMaterial = new THREE.ShaderMaterial({
        uniforms: uniforms,
        attributes: attributes,
        vertexShader: snowVertexShader,
        fragmentShader: snowFragmentShader,
        blending: THREE.AdditiveBlending, //NormalBlending,
        transparent: true,
        depthWrite: false,
    });
    var particlePointMaterial = new THREE.PointCloudMaterial();

    var particleSystem = new THREE.PointCloud( particles, particleShaderMaterial );

    particleSystem.position.copy(offsetPosition);

    particleSystem.camera = camera;

    particleSystem.clock = new THREE.Clock(true);

    var targetTime = 0;
    var actualTime = 0;
    var timeDifference = 0;
    var timeSpeed = 2.5;
    var delta = 0;
    var updateFunction = function () 
    {
        this.material.uniforms["cameraDirection"].value = this.camera.getWorldDirection();
        delta = this.clock.getDelta();
        this.material.uniforms["time"].value += timeSpeed * delta;
        this.material.uniforms["time"].value = Math.min(maxFinalTime, this.material.uniforms["time"].value);
    };
    particleSystem.update = updateFunction;

    var resizeFunction = function (width, height) 
    {
        this.material.uniforms["winHeight"].value = height;
    };
    particleSystem.resize = resizeFunction;

    function shake (force, thres) 
    {        
        if (force > thres)
        {

            particleSystem.material.uniforms["time"].value -= force;
            particleSystem.material.uniforms["time"].value = Math.max( -5 , particleSystem.material.uniforms["time"].value );
        }
    }

    //accelerometer DC offset variables
    var prevAcc = new THREE.Vector3( 0, 0, 0 );
    var prevOut = new THREE.Vector3( 0, 0, 0 );
    var currAcc = new THREE.Vector3( 0, 0, 0 );
    var currOut = new THREE.Vector3( 0, 0, 0 );
    var alpha = 0.9; //DC offset constant
    var beta = 0.7; //LPF constant
    var prevMagnitude = 0;
    var currMagnitude = 0;
    var accThreshold = 0;
    window.addEventListener('devicemotion', function(event) {

        currAcc.x = event.acceleration.x ? event.acceleration.x : 0;
        currAcc.y = event.acceleration.y ? event.acceleration.y : 0;
        currAcc.z = event.acceleration.z ? event.acceleration.z : 0;
        
        // DC offset removal
        currOut.x = currAcc.x - prevAcc.x + alpha * prevOut.x;
        currOut.y = currAcc.y - prevAcc.y + alpha * prevOut.y;
        currOut.z = currAcc.z - prevAcc.z + alpha * prevOut.z;

        // LPF
        currOut.x = beta * currOut.x + (1-beta) * prevOut.x;
        currOut.y = beta * currOut.y + (1-beta) * prevOut.y;
        currOut.z = beta * currOut.z + (1-beta) * prevOut.z;

        prevAcc.copy(currAcc);
        prevOut.copy(currOut);

        currMagnitude = currOut.length();

        accThreshold = 0.04 * Math.abs(maxFinalTime - particleSystem.material.uniforms["time"].value);
        shake(currMagnitude, accThreshold);
    });

    // mouse shake
    var mouseFlag = false;
    var currVelocity = new THREE.Vector2(0, 0);
    var prevVelocity = new THREE.Vector2(0, 0);
    var mAccel = new THREE.Vector2(0, 0);
    var mouseThreshold = 0;
    document.addEventListener('mousedown', function(event) {
        if (event.button == 0) { mouseFlag = true; };
    });
    document.addEventListener('mousemove', function(event) {
        if (mouseFlag) 
        {
            currVelocity.x = event.movementX;
            currVelocity.y = event.movementY;

            mAccel = currVelocity.sub(prevVelocity);

            mouseThreshold = 0.04 * ( Math.abs(maxFinalTime - particleSystem.material.uniforms["time"].value) );
            shake(mAccel.length()/20, mouseThreshold);
        }
    });
    document.addEventListener('mouseup', function(event) {
        if (event.button == 0) { mouseFlag = false; };
    });

    return particleSystem;
};
