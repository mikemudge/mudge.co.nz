/**
 * Basic Player Implementation
 */
var StandargPlayer = function() {
    /**
     * Document
     */

    this.canvas = document.getElementById('canvas');
    this.width = window.innerWidth;
    this.height = window.innerHeight;

    this.playerElement = document.getElementById('player');
    this.fullscreenbuttonElement = document.getElementById('fullscreen');
    this.playPauseButtonElement = document.getElementById('play-pause');
    this.muteButtonElement = document.getElementById('mute');
    this.timeDisplayElement = document.getElementById('position-duration');

    this.settingsElement = document.getElementById('settings');
    this.settingsButtonElement = document.getElementById('settings-toggle');
    this.settingsqualityElements = [
        document.getElementById('settings-quality-0'),
        document.getElementById('settings-quality-1'),
        document.getElementById('settings-quality-2'),
        document.getElementById('settings-quality-3')
    ];

    this.timelineElement = document.getElementById('timeline');
    this.timelineHoverElement = document.getElementById('timeline-hover');
    this.timelinePlayBarElement = document.getElementById('timeline-play-bar');
    this.timelineBufferBarElement = document.getElementById('timeline-buffer-bar');

    this.playerElement.requestFullScreen = this.playerElement['requestFullScreen'] ||
        this.playerElement['mozRequestFullScreen'] ||
        this.playerElement['msRequestFullscreen'] ||
        (this.playerElement['webkitRequestFullScreen'] ? function () {
            this.playerElement['webkitRequestFullScreen'](Element['ALLOW_KEYBOARD_INPUT'])
        }.bind(this) : null);
    this.requestFullScreen = function() { this.playerElement.requestFullScreen();}.bind(this);
    this.exitFullScreen = document['cancelFullScreen'] ||
        document['mozCancelFullScreen'] ||
        document['webkitCancelFullScreen'] ||
        document['msExitFullscreen'] ||
        document['exitFullscreen'] ||
        function() {};
    this.exitFullScreen = this.exitFullScreen.bind(document);

    /**
     * THREE JS
     */
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 1000);

    this.controls = new THREE.OrbitControls(this.camera);
    this.threeScene = new THREE.Scene();

    this.webglRenderer = new THREE.WebGLRenderer({canvas: this.canvas});

    /**
     *  EightI
     */
    this.assetURL = null;
    this.frameRate = 15.0;
    this.tranform = new THREE.Matrix4();
    this.bufferTime = 4.0;
    this.loadAssetOnEnvInitialise = false;

    this.isMute = false;
    this.isPlaying = false;
    this.isBuffering = true;
    this.viewport = null;
    this.frameBuffer = null;
    this.player = new EightI.Player(this.canvas, this.webglRenderer.context);
    this.player.onReady = function() { this.onPlayerReady_();}.bind(this);
    this.scene = null;
    this.asset = null;

    this.inFullscreen = false;

    this.viewportChanged = true;
    this.firstFrameDisplayed = false;
};

StandargPlayer.prototype = {
    constructor: StandargPlayer,

    initialise: function (dah_url) {
        this.initialiseTHREEJS();
        this.initialiseEightI(dah_url);

        // Hook to fullscreen change event
        var fllscreenChange = function() {
            this.fullscreenbuttonElement.classList.toggle('icon-size-fullscreen');
            this.fullscreenbuttonElement.classList.toggle('icon-size-actual');
        }.bind(this);
        document.addEventListener("fullscreenchange", fllscreenChange, false);
        document.addEventListener("webkitfullscreenchange", fllscreenChange, false);
        document.addEventListener("mozfullscreenchange", fllscreenChange, false);

        // Hook to resize event
        window.addEventListener('resize', function() { this.resize(); }.bind(this), false);

        // update hover text on timeline
        this.timelineElement.addEventListener("mousemove", function(event) {
            var left = event.pageX - this.timelineElement.offsetLeft;
            var percent = Math.max(Math.min(left / this.timelineElement.offsetWidth, 1.0), 0.0);
            left = left - (this.timelineHoverElement.offsetWidth / 2);
            this.timelineHoverElement.style.left = left + 'px';
            var text = '0:00';
            if (this.asset) {
                text = EightI.Helpers.timeToString(this.asset.getDuration() * percent);
            }
            this.timelineHoverElement.innerHTML = text;
        }.bind(this));

        this.timelineElement.addEventListener('click', function(event) {
            if(this.asset) {
                console.log("Jumping to new time on timeline");
                //if( this.playPauseButtonElement.classList.contains('icon-control-pause') ) {
                    //this.asset.pause();
                //}
                var left = event.pageX - this.timelineElement.offsetLeft;
                var percent = Math.max(Math.min(left / this.timelineElement.offsetWidth, 1.0), 0.0);
                var duration = this.asset.getDuration();
                this.seek(duration * percent);
                if( this.playPauseButtonElement.classList.contains('icon-reload') ) {
                    this.playPauseButtonElement.classList.remove('icon-reload');
                    this.playPauseButtonElement.classList.add('icon-control-pause');
                    this.play();
                }
            }
        }.bind(this));

        // Change to and from fullscreen mode
        this.fullscreenbuttonElement.addEventListener('click',function() {
            var goFullscreen = this.fullscreenbuttonElement.classList.contains('icon-size-fullscreen');
            if (goFullscreen) {
                this.requestFullScreen();
            } else {
                this.exitFullScreen();
            }
        }.bind(this));

        // Play / Pause the sequence
        this.playPauseButtonElement.addEventListener("click", function() {
            if( this.playPauseButtonElement.classList.contains('icon-reload') ) {
                this.playPauseButtonElement.classList.remove('icon-reload');
                this.playPauseButtonElement.classList.add('icon-control-pause');
                this.seek(0.0);
                this.play();
            } else if(this.asset && this.asset.getDuration() > 0.0) {
                if (this.playPauseButtonElement.classList.contains('icon-control-play')) {
                    this.play();
                } else {
                    this.pause();
                }
                this.playPauseButtonElement.classList.toggle('icon-control-play');
                this.playPauseButtonElement.classList.toggle('icon-control-pause');
            }
        }.bind(this));

        // Mute / UnMute sound
        this.muteButtonElement.addEventListener('click', function() {
            this.isMute = this.muteButtonElement.classList.contains('icon-volume-2');
            this.muteButtonElement.classList.toggle('icon-volume-2');
            this.muteButtonElement.classList.toggle('icon-volume-off');
        }.bind(this));

        // Show / Hide settings
        this.settingsButtonElement.addEventListener('click', function() {
            if(this.settingsElement.style.display === 'none' || this.settingsElement.style.display === '') {
                this.settingsElement.style.display = 'block';
            } else {
                this.settingsElement.style.display = 'none';
            }
        }.bind(this));

        // Need callback wrapper to capture i
        var settingsQualityChange = function(thiz, idx) {
            /*thiz.settingsqualityElements[idx].addEventListener('click', function() {
                thiz.settingsElement.style.display = 'none';
                if(thiz.asset) {
                    console.log('switching to quality level ' + idx);
                    thiz.asset.setQualityLevel(idx);
                }
            }.bind(thiz));*/
        };
        //for(var i = 0; i < this.settingsqualityElements.length; ++i) {
        //    settingsQualityChange(this, i);
        //}
    },

    onPlayerReady: undefined,

    run: function() {
        var animate = function() {
            window.requestAnimationFrame(animate);
            this.update();
        }.bind(this);
        animate();
    },

    update: function () {
        this.controls.update();
        var duration = 0.0;
        var currentTime = 0.0;
        var bufferDuration = 0.0;
        var partialDuration = 0.0;

        if(this.asset) {
            duration = this.asset.getDuration();
            currentTime = this.asset.getCurrentTime();
            bufferDuration = this.asset.getBufferEndPoint();
            partialDuration = this.asset.getPartialBufferDuration();
            // Hack to display the first loaded frame, should be removed when event systems goes in.
            if(!this.firstFrameDisplayed && bufferDuration > 0.0) {
                this.viewportChanged = true;
                this.firstFrameDisplayed = true;
            }

            if(this.isPlaying) {
                if (bufferDuration <= currentTime && !this.isBuffering) {
                    this.asset.pause();
                    this.isBuffering = true;
                } else if (bufferDuration > currentTime && this.isBuffering) {
                    this.asset.play();
                    this.isBuffering = false;
                }
            }
        }

        var now = Date.now() * 0.001;
        if (window.performance) {
            // Use performance when available.
            now = window.performance.now() * 0.001
        }
        this.player.update(now);

        if ( this.camera.parent === undefined ) this.camera.updateMatrixWorld();
		this.camera.matrixWorldInverse.getInverse( this.camera.matrixWorld );

        if (duration > 0.0 && currentTime >= duration) {
            this.pause();
            this.playPauseButtonElement.classList.remove('icon-control-play');
            this.playPauseButtonElement.classList.remove('icon-control-pause');
            this.playPauseButtonElement.classList.add('icon-reload');
            this.player.garbageCollect();
        }

        if (this.viewport && this.viewport.isValid()) {
            this.viewportChanged |= this.viewport.setViewMatrix(this.camera.matrixWorldInverse);
            this.viewportChanged |= this.viewport.setProjMatrix(this.camera.projectionMatrix);
            this.viewportChanged |= this.viewport.setNearFarPlane(this.camera.near, this.camera.far);
            this.viewportChanged |= this.viewport.setDimensions(0, 0, this.width * window.devicePixelRatio, this.height * window.devicePixelRatio);
            this.frameBuffer.setSize(new THREE.Vector2(this.width, this.height));
        } else {
            this.viewportChanged = true;
        }

        this.player.prepareRender();

        if(this.isPlaying || this.viewportChanged) {
            this.webglRenderer.resetGLState();
            this.webglRenderer.render(this.threeScene, this.camera);
            this.player.render();
            this.viewportChanged = false;
        }

        // Update html elements

        this.timeDisplayElement.innerHTML = EightI.Helpers.timeToString(currentTime) + " / " + EightI.Helpers.timeToString(duration);

        var playPercent = (currentTime / duration) * 100;
        playPercent = Math.min(100, Math.max(0, playPercent));
        this.timelinePlayBarElement.style.width = playPercent + "%";
        var bufferPercent = 0;
        if (duration > 0.0) {
            bufferPercent = ((bufferDuration + partialDuration) / duration) * 100;
            bufferPercent = Math.min(100, Math.max(0, bufferPercent));
        }
        this.timelineBufferBarElement.style.width = bufferPercent + "%";
    },

    play: function() {
        if(this.asset) {
            this.asset.play();
        }
        this.isPlaying = true;
    },

    pause: function() {
        if(this.asset) {
            this.asset.pause();
        }
        this.isPlaying = false;
        this.viewportChanged = true; // Make sure last frame is rendered
    },

    seek: function(time) {
        if(this.asset) {
            this.asset.seek(time);
        }
        this.viewportChanged = true;
    },

    loadAsset: function() {
        if( EightI.Env.is_initialised) {
            this.loadAssetOnEnvInitialise = false;
            this.asset = new EightI.Asset(this.assetURL, this.frameRate, this.bufferTime);
            var actor = new EightI.Actor();
            actor.setVisible(true);
            actor.setAsset(this.asset);

            actor.setTransform(this.tranform);
            this.scene = new EightI.Scene();
            this.scene.attachActor(actor);

            this.player.setScene(this.scene);
        } else {
            this.loadAssetOnEnvInitialise = true;
        }
    },

    initialiseTHREEJS: function () {
        this.camera.position.y = 170;
        this.camera.position.z = 200;
        this.controls.target.y = 170;

        var geometry = new THREE.SphereGeometry(5, 12, 12);
        var material = new THREE.MeshLambertMaterial({color: 0xffffff, shading: THREE.SmoothShading});

        for (var i = 0; i < 50; i++) {
            var mesh = new THREE.Mesh(geometry, material);
            mesh.position.x = ( Math.random() - 0.5 ) * 1000;
            mesh.position.y = ( Math.random() - 0.5 ) * 1000;
            mesh.position.z = ( Math.random() - 0.5 ) * 1000;
            mesh.updateMatrix();
            mesh.matrixAutoUpdate = false;
            this.threeScene.add(mesh);

        }
        var light = new THREE.DirectionalLight(0x223366);
        light.position.set(1, 1, 1);
        this.threeScene.add(light);

        light = new THREE.DirectionalLight(0x001144);
        light.position.set(-1, -1, -1);
        this.threeScene.add(light);

        light = new THREE.AmbientLight(0x222222);
        this.threeScene.add(light);

        this.webglRenderer.setPixelRatio(window.devicePixelRatio);
        this.webglRenderer.setSize(this.width, this.height, true);
        this.webglRenderer.shadowMap.enabled = false;
        this.webglRenderer.shadowMap.cullFace = THREE.CullFaceBack;
        this.webglRenderer.setClearColor('#111111');
    },

    initialiseEightI: function(dah_url) {
        var dah = new EightI.DAHParser(dah_url);
        dah.onLoaded = function() {
            var representation = dah.getRepresentation(0, 'hvr_stream', 0);
            if(representation) {
                this.assetURL = representation.url;
                this.frameRate = representation.framerate;
                this.tranform = dah.getTransformationMatrix();
                this.loadAsset();
            }
        }.bind(this);
        dah.parse();
    },
    resize: function() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.camera.aspect = this.width / this.height;
        this.camera.updateProjectionMatrix();
        this.webglRenderer.setSize(this.width, this.height, true);
    },
    onPlayerReady_: function() {

        this.viewport = new EightI.Viewport();
        this.frameBuffer = new EightI.FrameBuffer({'object': 0});
        this.viewport.setFrameBuffer(this.frameBuffer);
        this.player.addViewport(this.viewport);

        if(this.loadAssetOnEnvInitialise) {
            this.loadAsset();
        }

        if(this.onPlayerReady) {
            this.onPlayerReady();
        }
    }
};
