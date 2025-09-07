/**
 * A javascript class to help log on mobile devices (with no developer tools).
 **/
export class Logger {

  constructor() {
    this.logs = [];
  }

  info(message) {
    console.log(message);
    this.addLog(message);
  }

  debug(message) {
    console.debug(message);
    this.addLog(message);
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