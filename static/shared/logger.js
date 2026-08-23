/**
 * A javascript class to help log on mobile devices (with no developer tools).
 **/

const LOG_LEVELS = {debug: 0, info: 1, warn: 2, error: 3};

function currentLogLevel() {
  // Debug logging is noisy during normal play, but handy to flip on live via
  // a query param (e.g. ?debug) rather than editing code.
  let params = new URLSearchParams(window.location.search);
  return params.has('debug') ? LOG_LEVELS.debug : LOG_LEVELS.warn;
}

export class Logger {

  constructor() {
    this.logs = [];
    this.level = currentLogLevel();
  }

  emit(level, message) {
    if (LOG_LEVELS[level] < this.level) {
      return;
    }
    console[level](message);
    this.addLog(message);
  }

  info(message) {
    this.emit('info', message);
  }

  debug(message) {
    this.emit('debug', message);
  }

  warn(message) {
    this.emit('warn', message);
  }

  error(message) {
    this.emit('error', message);
  }

  addLog(message) {
    this.logs.push(message);
    if (this.logs.length > 10) {
      this.logs.splice(0, 1);
    }
  }

  vectorf(pos) {
    return this.numberf(pos.x) + "," + this.numberf(mousePos.y);
  }

  numberf(num) {
    return "" + Math.round(num * 100) / 100;
  }

  draw(x, y) {
    noStroke();
    fill("white");
    textSize(15);
    textAlign(LEFT);
    for (let i = 0; i < this.logs.length; i++) {
      let log = this.logs[i];
      text(log, x, y + 15 * i);
    }
  }
}