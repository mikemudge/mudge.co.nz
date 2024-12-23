var CrudService = function($resource, config) {
  this.AdminModels = $resource('/api/admin/project/:projectName');
  this.models = {};
  // TODO should load these?
  this.projects = [
    'Tournament',
    'Tournament Json Schema'
  ];
  this.$resource = $resource;
}

// Fields like id (read only)
// Model ownership? E.g a Round belongs to a Tournament, and should not be usable outside of that tournament.
// A MatchResult belongs to a Match which belongs to a Round.
// Model sharing? E.g a Team can participate in multiple tournaments, so can be reused/shared.
// When should you be able to create nested items within a form?

// Should their be a common set of fields which every model is expected to contain?
// id is required if a model is savable.
// Some models like MatchResult are not independently savable, only saved within a Match?
// name is a human friendly representation for selectors?
// Does every model need name? Makes sense for Team, Tournament and Round? Maybe not for Match/Result
// may require endpoints to lookup names for ids? Should use batching for this?
// Relationships should be directional as well?
// E.g you can add a team to a tournament on the edit tournament page, but not the edit team page?

CrudService.prototype.loadProject = function(projectName) {
  var loadingModels = this.AdminModels.query({
    projectName: projectName
  }).$promise.then(function(response) {
    console.log('Loaded project: ' + projectName);
    for (const model of response) {
      console.log("Model", model.name, 'at', model.endpoints.crud);
      // Each model should define a schema for validation.
      // We want to convert a schema into an html form to support CRUD operations for the model.
      this.models[model.name.toLowerCase()] = model;
      parseDates = function(model, item) {
        model.fields.forEach(function(f) {
          datetype = (
            f.type == 'datetime-local' ||
            f.type == 'date'
          );
          if (datetype && item[f.name]) {
            item[f.name] = new Date(item[f.name]);
          }
        });
      }

      model.Resource = this.$resource(model.endpoints.crud, {
        'id': '@id'
      }, {
        query: {
          isArray: true,
          interceptor: {
            response: function(value) {
              value.resource.forEach(parseDates.bind(null, model));
              return value;
            }
          }
        },
        get: {
          interceptor: {
            response: function(value) {
              parseDates(model, value.resource);
              return value;
            }
          }
        },
        save: {
          method: 'POST',
          interceptor: {
            response: function(value) {
              parseDates(model, value.resource);
              return value;
            }
          }
        }
      })
    }

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
  var model = this.models[model_name.toLowerCase()];
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

  crudService.loadProject('Tournament').then(function() {
    this.model = crudService.get_model($routeParams.model_name);

    if ($routeParams.id) {
      this.item = this.model.Resource.get({id: $routeParams.id});
    } else {
      // Create new.
      this.item = new this.model.Resource();
    }

    // Load options for models.
    this.model.fields.forEach(function(f) {
      if (["id", "date_created", "date_updated"].includes(f.name)) {
        f.type = 'readonly';
      }
      if (f.model) {
        // Get them for options?
        // TODO this should happen once we attempt to edit the field.
        // Using some ajax search functionality.
        f.options = f.model.Resource.query();
        f.options.$promise.then(function() {
          console.log(f.options);
        })
      }
    });
  }.bind(this));
}

EditController.prototype.saveItem = function(item) {
  // Updates on the server.
  item.$save().then(function() {
    // Successfully saved?
    this.isSaving = false;
    // TODO redirect to list view or stay here?
    // this.$location.path('model/' + this.model.name);
  }.bind(this), function(response) {
    // Handle errors?
    console.error(response);
    return response;
  }.bind(this));
  this.isSaving = true;
}

var HomeController = function(crudService, $routeParams) {
  window.ctrl = this;
  this.project = $routeParams.project;
  if (this.project) {
    crudService.loadProject(this.project).then(function() {
      this.models = crudService.models;
    }.bind(this));
  } else {
    this.projects = crudService.projects;
  }
}

var HeaderController = function(crudService, loginService, $routeParams) {
  window.headctrl = this;
  this.models = crudService.models;
  this.project = $routeParams.project;
  this.user = loginService.user;
}

var ListController = function(crudService, $routeParams, $resource) {
  window.ctrl = this;
  this.project = $routeParams.project;
  crudService.loadProject($routeParams.project).then(function() {
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
  .when('/:project/', {
    templateUrl: '/static/admin/home.tpl.html'
  })
  .when('/:project/model/:model_name', {
    templateUrl: '/static/admin/list.tpl.html'
  })
  .when('/:project/model/:model_name/create', {
    templateUrl: '/static/admin/edit.tpl.html'
  })
  .when('/:project/model/:model_name/:id', {
    templateUrl: '/static/admin/details.tpl.html'
  })
  .when('/:project/model/:model_name/:id/edit', {
    templateUrl: '/static/admin/edit.tpl.html'
  }).otherwise({
    templateUrl: '/static/admin/lost.tpl.html'
  })
});
