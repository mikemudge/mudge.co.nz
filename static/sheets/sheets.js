// Represents a single cell in a sheet.
var Cell = function(x, y) {
  // A human friendly way to know which cell this object represents.
  this.cellName = Sheets.letterFor(x) + (y + 1);

  this.x = x;
  this.y = y;
  this.elem = $('<div class="cell">');
  this.textElem = $('<input>');
  this.textElem.blur(this.onBlur.bind(this));
  this.textElem.focus(this.onFocus.bind(this));
  this.textElem.keypress(this.keyPress.bind(this));
  this.elem.append(this.textElem);
  this.elem.click(function(c) {
    // TODO bad use of global access to sheet.
    window.sheet.currentSelectedCell = this;
  }.bind(this))

  // Keep track of the formula if there is one.
  this.formula = null;
  // Keep track of cells which use this cell in a formula.
  // TODO this is susceptible to reference loops.
  this.dependencies = [];
}

Cell.prototype.onFocus = function() {
  // If there is a formula when the text input is focused, set it to the value so it can be edited.
  if (this.formula) {
    this.textElem.val(this.formula);
  }
}

Cell.prototype.onBlur = function(e) {
  var value = this.textElem.val();
  console.log('onBlur', this.cellName, value);
  if (value[0] == '=') {
    // Looks like a formula or function
    this.formula = value;
  } else {
    this.formula = null;
  }

  this.parseContent();
}

Cell.prototype.getValue = function() {
  // TODO this might not be the best place to default 0?
  return parseInt(this.textElem.val()) || 0;
}

// Interprets the value, formula or function in a cell.
Cell.prototype.parseContent = function() {
  if (this.formula) {
    // Look at the first letter after = to see if this is a function.
    // lowercase for function, uppercase for formula...???
    character = this.formula[1];
    // TODO there is most likely a better way to do this.
    if (character == character.toLowerCase()) {
      this.parseFunction(this.formula);
    } else {
      this.parseFormula(this.formula);
    }
  }

  // Make sure all dependent cells have a chance to update too.
  this.dependencies.forEach(function(cell) {
    // Force the cell to re parse its content.
    // TODO This could probably be more efficient as we know the formula hasn't actually changed.
    console.log('Updating dependent cell', cell);
    cell.parseContent();
  });
}

Cell.prototype.keyPress = function(e) {
  if (e.which == 13) {
    // Enter pressed.
    // This should trigger onBlur which will update the value.
    this.elem.next('div').children('input').focus();
  } else if (e.metaKey && e.which == 98) {
    // Cmd/Ctrl + b
    this.elem.toggleClass('bold')
  } else if (e.metaKey && e.which == 105) {
    // Cmd/Ctrl + i
    this.elem.toggleClass('italic')
  } else if (e.ctrlKey && e.which == 21) {
    // control + u
    this.elem.toggleClass('underline')
  } else {
    console.log('keypress', e);
  }
}

Cell.prototype.addDepCell = function(c) {
  // Only add each cell once as a dependency.
  if (this.dependencies.indexOf(c) === -1) {
    this.dependencies.push(c);
  }
}

Cell.prototype.parseFormula = function(value) {
  // Simple formula support, only works with a single operation and 2 cells.
  var result = value.match(/([A-Z]+)(\d+)([+-/*])([A-Z]+)(\d+)/);
  console.log(result);
  var col1 = Sheets.valueForLetters(result[1]);
  var row1 = result[2] - 1;
  var operation = result[3];
  var col2 = Sheets.valueForLetters(result[4]);
  var row2 = result[5] - 1;

  var c1 = window.sheet.cells[row1][col1];
  var c2 = window.sheet.cells[row2][col2];

  // TODO need to remove dependent cells if they are no longer used.

  // Make sure this cell is updated when its referenced cells are.
  c1.addDepCell(this);
  c2.addDepCell(this);

  // TODO should error check these values better.
  var v1 = c1.getValue();
  var v2 = c2.getValue();

  console.log('Updating values from ', c1, v1, c2, v2);

  if (operation == '+') {
    value = v1 + v2;
  } else if (operation == '-') {
    value = v1 - v2;
  } else if (operation == '/') {
    value = v1 / v2;
  } else if (operation == '*') {
    value = v1 * v2;
  } else {
    // Unsupported operation, TODO should throw exception?
    // Or report some kind of user friendly warning.
    this.textElem.val('###');
    return;
  }

  // Set the value into this cell's text elem.
  this.textElem.val(value);
  // Calculate the value.
  // Also need to save the formula for next edit?
}

Cell.prototype.parseFunction = function(value) {
  // Handle function name + range of cells?
  // TODO should be able to handle multiple arguments etc.
  // =sum(A1:A5)
  var result = value.match(/([a-z]+)\(([A-Z]+)(\d+):([A-Z]+)(\d+)\)/);
  console.log(result);
  var functionName = result[1];
  var col1 = Sheets.valueForLetters(result[2]);
  var row1 = result[3] - 1;
  var col2 = Sheets.valueForLetters(result[4]);
  var row2 = result[5] - 1;

  // Get an array of cells within the range?
  var cells = [];
  for (row = Math.min(row1, row2); row <= Math.max(row1, row2); row++) {
    for (col = Math.min(col1, col2); col <= Math.max(col1, col2); col++) {
      console.log(col, row);
      cells.push(window.sheet.cells[row][col]);
    }
  }

  // TODO need to remove these dependencies once they are finsihed.
  cells.forEach(function(c) {
    c.addDepCell(this);
  }.bind(this));

  value = 0;
  if (functionName == 'sum') {
    // Add all the values
    cells.forEach(function(c) {
      // TODO should error check these values better.
      value += c.getValue();
    });
  } else {
    // TODO handle unknown function better with user friendly warning.
    this.textElem.val('Unknown');
    return;
  }
  this.textElem.val(value);
}

var Sheets = function() {
  console.log('init')

  this.cells = [];
  this.tableElem = $('<div class="table">');
  var headerRow = $('<div class="row">');

  // Add the top left corner cell.
  headerRow.append($('<div class="cell title">'));

  for (x = 0; x < 100; x++) {
    var headerCell = $('<div class="cell title">');
    headerCell.text(Sheets.letterFor(x));
    headerRow.append(headerCell);
  }
  this.tableElem.append(headerRow);

  for (y = 0; y < 100; y++) {
    var rowElem = $('<div class="row">');
    var headerCell = $('<div class="cell title">');
    headerCell.text(y + 1);
    rowElem.append(headerCell);
    row = [];
    for (x = 0; x < 100; x++) {
      var cell = new Cell(x, y);
      row.push(cell);
      rowElem.append(cell.elem);
    }
    this.cells.push(row);
    this.tableElem.append(rowElem);
  }

  var menu = $('<div class="menu">');
  var boldButton = $('<div class="button">bold</div>');
  boldButton.click(function() {
    if (this.currentSelectedCell) {
      this.currentSelectedCell.elem.toggleClass('bold');
    }
  }.bind(this));
  menu.append(boldButton);
  var italicButton = $('<div class="button">italic</div>');
  italicButton.click(function() {
    if (this.currentSelectedCell) {
      this.currentSelectedCell.elem.toggleClass('italic');
    }
  }.bind(this));
  menu.append(italicButton);
  var underlineButton = $('<div class="button">underline</div>');
  underlineButton.click(function() {
    if (this.currentSelectedCell) {
      this.currentSelectedCell.elem.toggleClass('underline');
    }
  }.bind(this));
  menu.append(underlineButton);
  $('body').append(menu);
  $('body').append(this.tableElem);
}

Sheets.LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// TODO only currently works up to ZZ.
Sheets.letterFor = function(x) {
  var value = Sheets.LETTERS[x % 26];
  if (x > 25) {
    value = Sheets.LETTERS[parseInt(x / 26) - 1] + value;
  }
  return value;
}

// TODO Only handles up to ZZ
Sheets.valueForLetters = function(value) {
  var x = Sheets.LETTERS.indexOf(value[0]);
  if (value.length > 1) {
    x = (x + 1) * 26 + Sheets.LETTERS.indexOf(value[1]);
  }
  return x;
}

// Starts the app.
window.sheet = new Sheets();
