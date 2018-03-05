var FilterService = function(config, poseService, $resource) {
  this.poseService = poseService;
  this.Filter = $resource(config.API_URL + '/api/v1.1/filters/:id', {'id': '@id'})

  this.SpecialFilters = $resource(config.API_URL + '/api/v1/holo-poses/:name', {
    // 'private', 'removed', 'featured', 'popular'
    name: '@name'
  });
}

FilterService.prototype.loadFilter = function(filter) {
  if (filter.action == 'tag') {
    // Load tag and show poses for it.
    return this.poseService.loadTag({
      id: filter.tag
    });
  } else if (filter.action == 'feature') {
    return this.loadFeatured();
  } else if (filter.action == 'popular') {
    return this.loadPopular();
  } else {
    console.log(filter.action + ' is not supported')
  }
}

FilterService.prototype.loadFeatured = function() {
  return this.loadSpecial('featured')
}

FilterService.prototype.loadPopular = function() {
  return this.loadSpecial('popular')
}

FilterService.prototype.loadSpecial = function(name) {
  var result = [];
  this.SpecialFilters.query({name: name}).$promise.then(function(response) {
    // Add all poses to result
    var poses = this.poseService.loadIds(response);
    poses.forEach(function(p) { result.push(p); });
  }.bind(this));
  return result;
}

var CharacterService = function(config, $resource) {
  this.Character = $resource(config.API_URL + '/api/v1.1/characters/:id', {'id': '@id'})
  this.characterMap = {};
}

CharacterService.prototype.loadAll = function() {
  var result = this.Character.query();
  result.$promise.then(function(characters) {
    characters.forEach(function(c) {
      this.characterMap[c.id] = c;
    }.bind(this));
  }.bind(this));
  // TODO should support pagination loading.
  return result;
};

CharacterService.prototype.getById = function(character_id) {
  var result = this.characterMap[character_id];
  // TODO support lookup even if character isn't loaded yet?
  return result;
};

var PromotionService = function(config, $resource) {
  this.Promotion = $resource(config.API_URL + '/api/v1/holo-promotions/:id', {'id': '@id'})

  // TODO support faking android/iOS to get constrained content.
}

var BrowseController = function(characterService, loginService, filterService, promotionService, poseService) {
  window.ctrl = this;
  this.characterService = characterService;
  this.filterService = filterService;
  this.poseService = poseService;

  this.current_user = loginService.user8i;
  if (!this.current_user.id) {
    var loginPromise = loginService.loginAnon('0425b457-bfb4-4d93-9c63-8678e1e11885');

    loginPromise.then(function(response) {
      window.location.reload();
    });
    return;
  }
  console.log('current_user', this.current_user);

  this.poseService.loadPoses();
  this.filters = filterService.Filter.query(this.filtersLoaded.bind(this));
  this.characters = characterService.loadAll();
  this.promotions = promotionService.Promotion.query(this.updatePromoStyle.bind(this));
}

BrowseController.prototype.filtersLoaded = function(filters) {
  // Select the first usable filter by default.
  var filter = filters.find(function(f) {
    return f.action != 'downloaded' && f.action != 'search';
  });
  console.log('Default filter', filter);
  this.filterClicked(filter);
}

BrowseController.prototype.promotionClicked = function(promotion) {
  this.selected = {
    promotion: promotion
  };
  this.show_characters = false;

  // TODO should load a different page for promotions?
  console.log('selected promotion', promotion);
  this.poses = this.poseService.loadIds(promotion.poses);
}

BrowseController.prototype.updatePromoStyle = function() {
  var numPromos = this.promotions.length

  var styles = [
    "@keyframes playDynamic {",
    "100% { margin-left: -" + numPromos + "00%; }",
    " }",
    '.promotions {',
    'animation-duration:' + numPromos * 2 + "s;",
    'animation-timing-function:' + "steps(" + numPromos + ", end);",
    '}'
  ];

  var promoStyle = $('#promoStyle')
  promoStyle[0].innerHTML = styles.join('');
}

BrowseController.prototype.filterClicked = function(filter) {
  this.selected = {
    filter: filter
  }

  // Character filter is a special case.
  if (filter.action == 'character') {
    this.show_characters = true;
    this.poses = null;
    return;
  }
  this.show_characters = false;
  this.poses = this.filterService.loadFilter(filter);
}

BrowseController.prototype.poseCharacterClicked = function(pose) {
  // character is incomplete here because we access it through the pose.
  // Need to get the full character from the Service.
  character = this.characterService.getById(pose.character.id);
  this.characterClicked(character);
}

BrowseController.prototype.characterClicked = function(character) {
  this.selected = {
    character: character
  }

  this.poses = this.poseService.loadIds(character.poses);
  this.show_characters = false;
}

BrowseController.prototype.hashColor = function(col) {
  if (!col) {
    return '#000000';
  }
  col = col.toString(16);
  col = "000000".substring(col.length) + col;
  return '#' + col;
}

BrowseController.prototype.verticalGradientFor = function(colorTheme) {
  if (!colorTheme) {
    return {
    };
  }
  var col1 = this.hashColor(colorTheme.top_color_int);
  var col2 = this.hashColor(colorTheme.bottom_color_int);
  return {
    'background-image': 'linear-gradient(to bottom, ' + col1 + ', ' + col2 + ')'
  }
}

BrowseController.prototype.horizontalGradientFor = function(colorTheme) {
  if (!colorTheme) {
    return {};
  }
  var col1 = this.hashColor(colorTheme.top_color_int);
  var col2 = this.hashColor(colorTheme.bottom_color_int);
  return {
    'background-image': 'linear-gradient(to right, ' + col1 + ', ' + col2 + ')'
  }
}

BrowseController.prototype.filterStyles = function(filter) {
  var color = this.hashColor(filter.color_int)
  if (this.selected.filter == filter) {
    // Use selected_color
    color = this.hashColor(filter.color_selected_int)
  }
  result = {
    'color': color,
  }
  if (this.selected.filter == filter) {
    result['border-bottom-color'] = color
  }
  return result
}

angular.module('holo_browse', [
  'config',
  'holo_pose',
  'ngRoute',
  'ngResource'
])
.controller('BrowseController', BrowseController)
.service('characterService', CharacterService)
.service('filterService', FilterService)
.service('promotionService', PromotionService)
// .service('tagService', TagService)
.config(function($routeProvider, $locationProvider) {
  $locationProvider.html5Mode(true);
  $routeProvider
      .otherwise({
        templateUrl: '/static/angular/holo_web/browse.html',
      })
})
