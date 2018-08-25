var CrudService = function($resource, config) {
  this.AdminModels = $resource('/api/admin/Tournament');
  this.models = {};
  this.$resource = $resource;
}

CrudService.prototype.loadProject = function(projectName) {
  var loadingModels = this.AdminModels.query({
    name: projectName
  }).$promise.then(function(response) {
    console.log('Loaded project: ' + projectName);
    console.log(response);
    response.forEach(function(model) {
      this.models[model.name.toLowerCase()] = model;
      model.Resource = this.$resource(model.endpoints.crud, {
        'id': '@id'
      })
    }.bind(this));

    response.forEach(function(model) {
      model.fields.forEach(function(f) {
        // Replace field's model with a reference.
        // If it isn't already a reference.
        if (f.model && !f.model.name) {
          f.model = this.models[f.model.toLowerCase()];
        }
      }.bind(this));
    }.bind(this));
  }.bind(this));
  return loadingModels;
}

// Call after loadProject() has resolved.
CrudService.prototype.get_model = function(model_name) {
  var model_name = model_name.toLowerCase();
  var model = this.models[model_name];
  if (!model) {
    throw new Error(model_name + ' not found');
  }
  return model;
}

var DetailsController = function(crudService, $routeParams) {
  window.ctrl = this;
  crudService.loadProject('Tournament').then(function() {
    this.model = crudService.get_model($routeParams.model_name);
    this.item = this.model.Resource.get({id: $routeParams.id});
  }.bind(this));
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
  crudService.loadProject('Tournament').then(function() {
    this.models = crudService.models;
  }.bind(this));
}

var HeaderController = function(crudService, loginService) {
  window.headctrl = this;
  this.models = crudService.models;
  this.user = loginService.user;
}

var ListController = function(crudService, $routeParams, $resource) {
  window.ctrl = this;
  this.crudService = crudService;
  crudService.loadProject('Tournament').then(function() {
    this.model = crudService.get_model($routeParams.model_name);
    this.list = this.model.Resource.query();
  }.bind(this));
}

ListController.prototype.valueFor = function(field, item) {
  var field_value = item[field.name || 'name'];
  // console.log('valueFor', field.name, field, item);
  if (!field.model) {
    // Just return the value in the field for this item.
    return field_value;
  }

  if (!field_value) {
    return '<Not Set>'
  }
  // If its a model use the models name field
  var type = field.model;
  var name_field = type.name_field || 'name';
  var name_func = name_field;
  if (typeof(name_func) != 'function') {
    name_func = function(item) {
      return item[name_field];
    };
  }

  return name_func(field_value);
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
.run(function(loginService) {
  // You must be logged in to use this app.
  loginService.ensureLoggedIn();
})
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
