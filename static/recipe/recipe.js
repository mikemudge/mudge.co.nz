
class MainController {


  constructor() {
    window.ctrl = this;
    this.recipes = [{
      "name": "Dim's Vege Nachoes",
      "ingredients": [
        "Corn Chips",
        "Refried Beans",
        "Salsa",
        "Sour Cream",
        "Cheese",
      ],
      "instructions": [
        "Heat Beans",
        "Mix Beans and Salsa",
        "Spread Corn chips across baking dish",
        "Add globs of Bean Mix and Sour Cream",
        "Grate And Add Cheese on top",
        "Bake for 15-20 minutes, longer for more char on chips."
      ]
    }]
  }
}


angular.module('recipe', [
  'api',
  'config',
  'mmLogin',
  'ngResource',
  'ngRoute',
])
.controller('MainController', () => new MainController())
.config(function($locationProvider, $routeProvider, config) {
  $locationProvider.html5Mode(true);
  $routeProvider.otherwise({
    templateUrl: '/static/recipe/recipe.tpl.html?v=' + config.version
  });
})