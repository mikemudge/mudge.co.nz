function shuffle(array) {
  var currentIndex = array.length, temporaryValue, randomIndex;

  // While there remain elements to shuffle...
  while (0 !== currentIndex) {

    // Pick a remaining element...
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex -= 1;

    // And swap it with the current element.
    temporaryValue = array[currentIndex];
    array[currentIndex] = array[randomIndex];
    array[randomIndex] = temporaryValue;
  }

  return array;
}

var MainController = function($resource, $location) {
  var data = [
    'Trust',
    'Regret',
    'Uncertain',
    'Refocus',
    'Strong',
    'Lean',
    'Redundant',
    'Disestablish',
    'Consultation',
    'One team',
    'Teach',
    'Learn',
    'Discuss',
    'Debate',
    'Commit',
    'Decide',
    'Technology',
    'Real-time',
    'Calendar',
    'Rumours',
    'Leaks',
    'The Board',
    'Runway',
    'Forward',
    'Investors',
    'Fundraising',
    'C-round',
    'Demo',
    'Slack',
    '#music (any ref)',
    'Thor',
    'Engine',
    'Contractor',
    'Rubix-cube',
    'Finance',
    'Leadership',
    'Exec-team',
    'Step-back/down',
    'Mobile',
    'Cloud',
    'Compression',
    'Help',
    'Communication',
    'Valuable',
    'Product',
    'Market fit',
    'Mission Critical',
    'Vision',
    'VR',
    'AR',
    'Belief',
    'Prodctive',
    'Competition',
    'Honest',
    'LA offices',
    'Holo',
    'Studio/Content-Platform',
    'Streaming',
  ];

  this.bonus = [
    'Seb uses the fire Extinguisher.',
    'Isaac does a speech',
  ];

  var values = shuffle(data);
  this.rows = [];
  for(var i=0;i<5;i++) {
    var values = [];
    for(var ii=0;ii<5;ii++) {
      values.push(data[i * 5 + ii])
    }
    this.rows.push({
      values: values
    });
  }
}

/**
 * The angular module
 */
angular.module('ceo_bingo', [
  'config',
  'ngResource',
  'ngRoute',
])
.config(function($locationProvider, $routeProvider, config) {
  $locationProvider.html5Mode(true).hashPrefix('!');
  $routeProvider.otherwise({
    templateUrl: '/static/ceo_bingo/ceo_bingo.tpl.html'
  });
})
.controller('MainController', MainController)
;