var CrudService = function($resource, config) {

  // TODO should load from admin end points?
  var models = [{
    name: 'Tournament',
    fields: [{
      name: 'name'
    }],
    'endpoints': {
      'crud': '/api/tournament/tournament/:id'
    }
  }, {
    name: 'Team',
    name_field: 'name',
    fields: [{
      name: 'name'
    }],
    'endpoints': {
      'crud': '/api/tournament/team/:id'
    }
  }, {
    name: 'Round',
    fields: [{
      name: 'name'
    }, {
      name: 'matches',
      list: true,
      model: 'Match'
    }],
    'endpoints': {
      'crud': '/api/tournament/round/:id'
    }
  }, {
    name: 'Match',
    name_field: function(item) {
      return item.homeTeam.name + ' v ' + item.awayTeam.name;
    },
    fields: [{
      name: 'homeTeam',
      type: 'select',
      model: 'Team',
    }, {
    //   name: 'result',
    //   type: 'nested',
    //   model: 'MatchResult',
    // }, {
      name: 'awayTeam',
      type: 'select',
      model: 'Team',
    }],
    'endpoints': {
      'crud': '/api/tournament/match/:id'
    }
  }, {
    name: 'MatchResult',
    name_field: function(item) {
      return item.homeScore + ' - ' + item.awayScore;
    },
    fields: [{
      name: 'homeScore',
      type: 'number',
    }, {
      name: 'match',
      type: 'select',
      model: 'Match',
    }, {
      name: 'awayScore',
      type: 'number',
    }],
    'endpoints': {
      'crud': '/api/tournament/matchresult/:id'
    }
  }];

  this.models = {};
  models.forEach(function(model) {
    this.models[model.name.toLowerCase()] = model;
    model.Resource = $resource(model.endpoints.crud, {
      'id': '@id'
    })
  }.bind(this));
}

CrudService.prototype.get_model = function(model_name) {
  var model_name = model_name.toLowerCase();

  var model = this.models[model_name];

  model.fields.forEach(function(f) {
    // Replace field's model with a reference.
    // If it isn't already a reference.
    if (f.model && !f.model.name) {
      f.model = this.get_model(f.model.toLowerCase());
    }
  }.bind(this));

  return model;
}

var DetailsController = function(crudService, $routeParams) {
  window.ctrl = this;
  this.model = crudService.get_model($routeParams.model_name);
  this.item = this.model.Resource.get({id: $routeParams.id});
}

var EditController = function(crudService, $location, $routeParams) {
  window.ctrl = this;
  this.$location = $location;
  this.model = crudService.get_model($routeParams.model_name);

  if ($routeParams.id) {
    this.item = this.model.Resource.get({id: $routeParams.id});
  } else {
    // Create new.
    this.item = new this.model.Resource();
  }
  // Load options for models.
  this.model.fields.forEach(function(f) {
    if (f.model) {
      // Get them for options?
      // TODO this should happen once we attempt to edit the field.
      // Using some ajax search functionality.
      f.options = f.model.Resource.query();
    }
  });
}

EditController.prototype.saveItem = function(item) {
  // Updates on the server.
  item.$save().then(function() {
    // TODO redirect to list view or stay here?
    this.$location.path('model/' + this.model.name);
  }.bind(this), function(response) {
    // Handle errors?
    console.error(response);
    return response;
  }.bind(this));
}

var HomeController = function(crudService) {
  window.ctrl = this;
  this.models = crudService.models;
}

var HeaderController = function(crudService, loginService) {
  window.headctrl = this;
  this.models = crudService.models;
  this.user = loginService.user;
}

var ListController = function(crudService, $routeParams, $resource) {
  window.ctrl = this;
  this.crudService = crudService;
  this.model = crudService.get_model($routeParams.model_name);
  this.list = this.model.Resource.query();
}

ListController.prototype.nameFor = function(field, item) {
  var field_value = item[field.name];

  if (!field.model) {
    // Just return the value in the field for this item.
    return field_value;
  }

  if (!field_value) {
    return '<Not Set>'
  }
  // If its a model use the models name field
  var type = field.model;
  var name_field = type.name_field || 'id';
  var name_func = name_field;
  if (typeof(name_func) != 'function') {
    name_func = function(item) {
      // Prefix the type of the model to the name of it?
      return type.name + ": " + item[name_field];
    };
  }

  if (field.list) {
    var value = []
    field_value.forEach(function(item) {
      value.push(name_func(item))
    });
    return value.join(", ");
  } else {
    return name_func(field_value);
  }
}

ListController.prototype.deleteItem = function(item) {
  item.$delete();
}

angular.module('admin', [
  'api',
  'config',
  'mmLogin',
  'ngResource',
  'ngRoute',
])
.controller('DetailsController', DetailsController)
.controller('EditController', EditController)
.controller('HeaderController', HeaderController)
.controller('HomeController', HomeController)
.controller('ListController', ListController)
.service('crudService', CrudService)
.config(function($locationProvider, $routeProvider) {
  $locationProvider.html5Mode(true);
  $routeProvider.when('/', {
    templateUrl: '/static/admin/home.tpl.html'
  })
  .when('/model/:model_name', {
    templateUrl: '/static/admin/list.tpl.html'
  })
  .when('/model/:model_name/create', {
    templateUrl: '/static/admin/edit.tpl.html'
  })
  .when('/model/:model_name/:id', {
    templateUrl: '/static/admin/details.tpl.html'
  })
  .when('/model/:model_name/:id/edit', {
    templateUrl: '/static/admin/edit.tpl.html'
  })
});
