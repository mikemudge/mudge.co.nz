jack = {};

jack.MainController = function(config) {
  this.myCodeMirror = CodeMirror(document.getElementById('codeMirror'), {
    value: config.template,
    mode:  "javascript",
    lineNumbers: true,
    theme: config.theme,
    tabSize: 2
  });
  this.currentFile = 'template';
  this.config = config;
  this.myCodeMirror.setOption("keyMap", "sublime");

  CodeMirror.commands.save = angular.bind(this, this.save);
}

jack.MainController.prototype.save = function(instance) {
  console.log("save");
  if (this.currentFile == 'style') {
    var styleDiv = document.getElementById('style');
    styleDiv.innerHTML = instance.getValue();
  } else if (this.currentFile == 'template') {
    var htmlDiv = document.getElementById('html');
    htmlDiv.innerHTML = instance.getValue();
  } else {
    console.log("no update for currentFile " + this.currentFile);
  }
}

jack.MainController.prototype.changeFile = function(file) {
  var value = this.config[file];
  this.currentFile = file;
  if (!value && value!=='') {
    console.log('no content found for ' + file);
  } else {
    this.myCodeMirror.setValue(value);
  }
}

/**
 * The angular module for Code Mirror Test.
 */
jack.App = angular.module('jack', [
  'config',
  'ngResource',
  'ngRoute'
]).config(['$routeProvider', 'config',
    function($routeProvider, config) {
      $routeProvider.when('/', {
        templateUrl: config.basePath + '/templates/CodeMirror.html'
      });
    }
]).controller('MainController', ['config', jack.MainController]);
