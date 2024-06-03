
class MainController {
  wakeLock;

  constructor($scope) {
    window.ctrl = this;
    this.$scope = $scope;
    this.sleepMode = false;
    this.recipes = [{
      "name": "Dim's Vege Nachoes",
      "ingredients": [{
        name: "Refried Beans",
        amount: "1 Can (~15oz/425g)",
      },{
        name: "Salsa",
        amount: "1 Jar (~15oz/425g)",
      },{
        name: "Corn chips",
        amount: "1 Bag (~18oz/510g)",
      },{
        name: "Sour Cream",
        amount: "1 Tub (~8oz/225g)",
      },{
        name: "Cheese",
        amount: "As much as you want",
      }],
      "instructions": [
        "Heat beans",
        "Mix beans and salsa",
        "Spread corn chips across baking dish",
        "Add globs of bean mix and sour cream",
        "Grate cheese and add on top",
        "Bake for 15-20 minutes, longer for more char on chips."
      ]
    }]
  }

  async toggleNoSleepMode() {
    if (!"wakeLock" in navigator) {
      alert("Wake lock is not supported by this browser.");
      return;
    }

    if (!this.sleepMode) {
      // Attempt to prevent the screen from sleeping using the screen wake lock API.
      // https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API
      try {
        this.wakeLock = await navigator.wakeLock.request("screen");
        console.log("Wake Lock is active!");
      } catch (err) {
        console.error(err);
      }

      this.wakeLock.addEventListener("release", () => {
        // the wake lock has been released.
        this.wakeLock = null;
        if (this.sleepMode) {
          console.log("Wake Lock is released (External request)");
          // possibly due to user navigating away from the current window/tab.
          // TODO can we reenable when the user returns to the tab?
          this.sleepMode = false;
          this.$scope.$apply();
        } else {
          console.log("Wake Lock is released (User requested)");
          this.sleepMode = false;
        }
      });
      this.sleepMode = true;
      this.$scope.$apply();
    } else {
      // Release the lock so the screen can sleep again, invokes the event listener above.
      this.sleepMode = false;
      this.wakeLock.release();
    }
  }
}


angular.module('recipe', [
  'api',
  'config',
  'mmLogin',
  'ngResource',
  'ngRoute',
])
.controller('MainController', ($scope) => new MainController($scope))
.config(function($locationProvider, $routeProvider, config) {
  $locationProvider.html5Mode(true);
  $routeProvider.otherwise({
    templateUrl: '/static/recipe/recipe.tpl.html?v=' + config.version
  });
})