/**
 * A javascript class to help use the gamepad controller in games.
 **/
GameControls = function(config) {
  this.config = config || {};
	if (this.config.debug) {
		console.log("Showing debug information for GamePad");
	}
}

GameControls.prototype.init = function() {
  // TODO The game should be able to register multiple human players.
  // Each could use a unique set of keys or a controller index with mappings?

  // WASD will control the direction by default.
  // TODO this could be improved to have a few custom defaults.
  // Map "action" keys to named actions etc.
  var keys = {
    left: 65,
    up: 87,
    right: 68,
    down: 83
  };
  if (this.config.keys) {
    keys = this.config.keys;
  }
  this.keyControls = new KeyControls(keys);

  // These are car racing mappings.
  var controllerSettings = {
    'up': 7,
    'down': 6,
    'left': 14,
    'right': 15
  };
  if (this.config.controller) {
    controllerSettings = this.config.controller;
    if (this.config.controller.directions === 'stick') {
      // Switch to regular direction controls
      controllerSettings = {
        'up': 12,
        'down': 13,
        'left': 14,
        'right': 15
      };
    }
  }
  controllerSettings.debug = this.config.debug;

  // Check all the gamepads immediately.
  var gamepads = navigator.getGamepads();
  if (this.debug) {
  	// Don't know why, but this can contain nulls.
  	console.log(gamepads);
	}
  if (gamepads[0]) {
    // Rumble if one is found.
    console.log("Rumble");
    gamepads[0].vibrationActuator.playEffect("dual-rumble", {
      duration: 1000,
      weakMagnitude: 1.0,
      strongMagnitude: 1.0
    });
    // Then register it to be used.
	  this.controller = new ControllerControls(controllerSettings);
  } else {
  	// TODO perhaps we should always do this, incase additional controllers are added later?
    // Add a listener for gamepad connections.
    window.addEventListener("gamepadconnected", function(event) {
      console.log("Game Pad connected", event.gamepad);
      // A little rumble to show you it connected.
      console.log("Rumble");
      event.gamepad.vibrationActuator.playEffect("dual-rumble", {
        duration: 1000,
        strongMagnitude: 1.0,
        weakMagnitude: 1.0,
      });

      // Hook up controls to use this.
		  this.controller = new ControllerControls(controllerSettings);
    }.bind(this));
  }
}

// TODO the current interface here could probably be improved on.
// Returns a map of "actions".
GameControls.prototype.get = function() {
	if (this.controller) {
		// TODO support both keys and controller at the same time?
		return this.controller.get();
	}
	return this.keyControls.get();

}

// TODO use these to map inputs to user actions.
var ControllerControls = function(controllerSettings) {
  this.controllerSettings = controllerSettings;
  this.debug = this.controllerSettings.debug;
  this.lastButton3 = false;
}

ControllerControls.prototype.get = function() {
  // Need to re-get each time, values don't change otherwise.
  var gamepad = navigator.getGamepads()[0];

  result = {
    'up': gamepad.buttons[this.controllerSettings['up']].value,
    'down': gamepad.buttons[this.controllerSettings['down']].value,
    'left': gamepad.buttons[this.controllerSettings['left']].value,
    'right': gamepad.buttons[this.controllerSettings['right']].value
  };

  // axes[0] is -1 (left) to 1 (right)
  // axes[1] is -1 (up) to 1 (down)
  // There is often some small "drift" on these, so ignore values < 0.1
  if (gamepad.axes[0] < -0.1) {
    result['left'] = -gamepad.axes[0];
  }
  if (gamepad.axes[0] > 0.1) {
    result['right'] = gamepad.axes[0];
  }
  if (gamepad.axes[1] < -0.1) {
    result['up'] = -gamepad.axes[1];
  }
  if (gamepad.axes[1] > 0.1) {
    result['down'] = gamepad.axes[1];
  }

  if (gamepad.buttons[3].pressed && !this.lastButton3) {
    // If the state of button 3 changed from off to on.
    result['toggleView'] = 1;
  }
  this.lastButton3 = gamepad.buttons[3].pressed;

  if (gamepad.buttons[9].pressed) {
    result['pause'] = 1;
  }
  // Handy for figuring out which is which.
  if (this.debug) {
    for (i=0;i<=15;i++) {
      if (gamepad.buttons[i].pressed) {
        console.log(i);
      }
    }
  }

  return result;
};


var KeyControls = function(keySettings) {
  this.keys = keySettings;
}
KeyControls.down = {};

// TODO this part should go somewhere else to support multiple players on the same keyboard?
KeyControls.prototype.get = function() {
  return {
    'up': KeyControls.down[this.keys.up],
    'down': KeyControls.down[this.keys.down],
    'left': KeyControls.down[this.keys.left],
    'right': KeyControls.down[this.keys.right]
  };
};

KeyControls.keyUp = function(e) {
  var key = e.keyCode ? e.keyCode : e.which;
  KeyControls.down[key] = false;
}
window.onkeyup = KeyControls.keyUp;

KeyControls.keyDown = function(e) {
  var key = e.keyCode ? e.keyCode : e.which;
  KeyControls.down[key] = true;
}
window.onkeydown = KeyControls.keyDown;

