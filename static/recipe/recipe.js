
class MainController {
  wakeLock;

  constructor($scope) {
    window.ctrl = this;
    this.$scope = $scope;
    this.sleepMode = false;
    this.recipe = 0;
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
    }, {
      "source_url": "https://www.skinnytaste.com/picadillo-6-ww-pts/",
      "name": "Cuban Picadillo",
      "ingredients": [{
        name: "Onion",
        amount: "1 medium",
      }, {
        name: "Garlic",
        amount: "2 cloves",
      }, {
        name: "Tomato",
        amount: "1 medium",
      }, {
        name: "Pepper",
        amount: "1 medium",
      }, {
        name: "Ground Beef",
        amount: "~1.5lb",
      }, {
        name: "Chopped Tomatos Can",
        amount: "1 Can",
      }, {
        name: "Cumin",
        amount: "1 tsp",
      }, {
        name: "Cumin",
        amount: "1 tsp",
      // Optional stuff?
      }, {
        name: "Olives",
        amount: "2 tbsp",
      }, {
        name: "Cilantro",
        amount: "2 tbsp",
      }, {
        name: "Dried Bayleaf",
        amount: "2 leaves",
      }, {
        name: "Salt and Pepper",
        amount: "to taste",
      }]
    }, {
      "source_url": "https://www.skinnytaste.com/air-fryer-beef-empanadas/",
      "name": "Air Fryer Beef Empanadas",
      "ingredients": [{
        name: "Empanada discs",
        amount: "8+"
      }, {
        // Add options for other things.
        name: "Picadillo (Or other fillings)",
        amount: "8+"
      }, {
        name: "Egg + water",
        amount: "1 egg + 1 tsp",
        description: "for brushing/sticking discs together"
      }]
    }, {
      "source_url": "https://www.loveandlemons.com/broccoli-salad/",
      "name": "Broccoli Salad",
      "ingredients": [{
        name: "Broccoli",
        amount: "1",
      },{
        name: "Dried Cranberries",
        amount: "1 Bag",
      },{
        name: "Red Onion",
        amount: "1 small",
      },{
        // TODO support alternatives?
        // aka replacements?
        name: "Seeds/Nuts",
        description: "(sunflower, pumpkin, almonds or similar)",
        amount: "1 handful",
      },{
        name: "Dressing",
        amount: "Enough to cover",
      },{
        // TODO support optional extras?
        name: "Bacon bits",
        amount: "A sprinkle",
      },{
        name: "Cheese, (grated parmesan)",
        amount: "",
      }],
      "instructions": [
        "Chop broccoli, cutting the stems in particular into small pieces.",
        "Chop red onion finely",
        "Mix dressing? Or use a premade one?",
        "Dressing option - mayo, olive oil, vinegar, 1t dijon mustard, honey",
        // Tablespoons -> cups is ~16:1
        "Mix broccoli, red onion and cranberries into the dressing",
        "Let soak in the fridge for up to 24 hours",
        "Add seeds/nuts.",
        "Toss and serve"
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