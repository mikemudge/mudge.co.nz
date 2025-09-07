/**
 * A javascript class to help use the gamepad controller in games.
 **/
class GameControls {
  constructor(config) {

    this.config = config || {};
    if (this.config.debug) {
      console.log("Showing debug information for GamePad");
    }
  }

  init() {
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

    window.onkeyup = this.keyControls.keyUp.bind(this.keyControls);
    window.onkeydown = this.keyControls.keyDown.bind(this.keyControls);


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

    this.controllers = [];

    // Check all the gamepads immediately.
    var gamepads = navigator.getGamepads();
    if (this.config.debug) {
      // Don't know why, but this can contain nulls.
      console.log(gamepads);
    }
    if (gamepads[0]) {
      // Rumble if one is found.
      this.rumble(gamepads[0]);
      // Then register it to be used.
      this.controllers.push(new ControllerControls(0, controllerSettings));
    } else {
      // TODO perhaps we should always do this, incase additional controllers are added later?
      // Add a listener for gamepad connections.
      window.addEventListener("gamepadconnected", function (event) {
        console.log("Game Pad connected", event.gamepad);

        // standard is good, anything else we might need to calibrate keys.
        if (event.gamepad.mapping !== 'standard') {
          console.log("Game Pad mapping is not standard '" + event.gamepad.mapping + "'");
          // Support other controllers?
          controllerSettings = {
            // These aren't correct, but we can't use 15 if that index doesn't exist.
            // I think the axes are used for d-pad on this controller.
            'up': 1,
            'down': 2,
            'left': 3,
            'right': 4,
            'debug': this.config.debug
          }
        }

        // A little rumble to show you it connected.
        this.rumble(event.gamepad);

        // Hook up controls to use this.
        // TODO support a list of controllers?
        console.log("Setting controller", event.gamepad.id);
        this.controllers[0] = (new ControllerControls(event.gamepad.index, controllerSettings));
      }.bind(this));
    }
  }

  rumble(gamepad) {
    if (!gamepad.vibrationActuator) {
      console.log("This gamepad doesn't support rumble");
      return;
    }
    console.log("Rumble");
    gamepad.vibrationActuator.playEffect("dual-rumble", {
      duration: 1000,
      weakMagnitude: 1.0,
      strongMagnitude: 1.0
    });
  }

  // TODO the current interface here could probably be improved on.
  // Returns a map of "actions".
  get() {
    if (this.controllers.length) {
      // TODO support both keys and controllers at the same time?
      var result = {};
      this.controllers.forEach((c) => {
        // TODO combine all results?
        result = c.get();
      })
      return result;
    }
    return this.keyControls.get();
  }
}

// TODO use these to map inputs to user actions.
class ControllerControls {
  constructor(gamepadIndex, controllerSettings) {
    this.controllerSettings = controllerSettings;
    this.gamepadIndex = gamepadIndex;
    this.debug = this.controllerSettings.debug || true;
    this.lastButton3 = false;

    // There is a standard controller button mapping.
    // See https://w3c.github.io/gamepad/#remapping
    // Not all controllers use this, so may need to support calibration for some?
    this.standardButtons = [
      'A',
      'B',
      'X',
      'Y',
      'L1',
      'R1',
      'L2',
      'R2',
      'select',
      'start',
      'L3',
      'R3',
      'up',
      'down',
      'left',
      'right'
    ];

    // Negative is up/left, positive is down/right.
    this.standardAxes = [
      'horizontal-left',
      'vertical-left',
      'horizontal-right',
      'vertical-right',
    ];

    // Non standard?
    this.nonStandardButtons = [
      'A',
      'B',
      '?', // Nothing at 2
      'X',
      'Y',
      '?', // Nothing at 5
      'L1',
      'R1',
      'L2',
      'R2',
      'select',
      'start',
      '?', // Nothing at 12
      'L3',
      'R3',
    ];
    // Dpad is handled in axes.

    this.nonStandardAxes = [
      'horizontal-left',
      'vertical-left',
      'horizontal-right',
      'L2 strength', // -1 nothing, 0 medium, 1 full.
      'R2 strength', // -1 nothing, 0 medium, 1 full.
      'vertical-right',
      '6', // Always 0
      '7', // Always 0
      '8', // Always 0
      'D-Pad somehow?'
    ];

    // D-Pad values (axes[9])
    // -1 is up.
    // 1 is up + left
    // 0.714 is left
    // 0.429 is left down
    // 0.1428 is down
    // -0.1428 is down right
    // -0.429 is right
    // -0.714 is up right
    // 3.286 is center.


  }

  get() {
    // In chrome, the gamepad objects change, so re-get each time.
    var gamepad = navigator.getGamepads()[this.gamepadIndex];

    let result = {
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
    // Different controllers have different button mappings?
    if (this.debug) {
      for (let i = 0; i < gamepad.axes.length; i++) {
        if (gamepad.axes[i] == 1 || gamepad.axes[i] == -1) {
          if (i != 3 && i != 4) {
            console.log("axes", i, this.standardAxes[i], "=", gamepad.axes[i])
          }
        }
      }

      for (let i = 0; i < gamepad.buttons.length; i++) {
        if (gamepad.buttons[i].pressed) {
          console.log("button", i, this.standardButtons[i], "pressed", gamepad.buttons[i].value);
        }
      }
    }

    return result;
  }
}


class KeyControls {
  constructor(keySettings) {
    this.keys = keySettings;
    this.down = {};
  }

// TODO this part should go somewhere else to support multiple players on the same keyboard?
  get() {
    return {
      'up': this.down[this.keys.up],
      'down': this.down[this.keys.down],
      'left': this.down[this.keys.left],
      'right': this.down[this.keys.right]
    }
  }

  keyUp(e) {
    var key = e.keyCode ? e.keyCode : e.which;
    this.down[key] = false;
  }

  keyDown = function (e) {
    var key = e.keyCode ? e.keyCode : e.which;
    this.down[key] = true;
  }
}
