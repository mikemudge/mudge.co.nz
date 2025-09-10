
export class NeuralNet {
  constructor(ins, hiddens, outs) {
    this.weights1 = [];
    for (let i = 0; i < ins + 1; i++) {
      this.weights1.push([]);
      for (let h = 0; h < hiddens; h++) {
        this.weights1[i].push(10 * Math.random() - 5);
      }
    }
    this.weights2 = [];
    for (let h = 0; h < hiddens + 1; h++) {
      this.weights2.push([]);
      for (let o = 0; o < outs; o++) {
        this.weights2[h].push(10 * Math.random() - 5);
      }
    }
  }
  sigmoid(x) {
    return 1 / (1 + Math.exp(-x));
  }

  randomMutation() {
    // Pick a random hidden node and replace it.
    let h = int(random(this.weights2.length));
    // If the bias was selected, there is nothing to update in weights1.
    if (h < this.weights2.length - 1) {
      for (let i = 0; i < this.weights1.length; i++) {
        this.weights1[i][h] = 10 * Math.random() - 5;
      }
    }

    for (let o = 0; o < this.weights2[h].length; o++) {
      this.weights2[h][o] = 10 * Math.random() - 5;
    }
  }

  copyAll(nn) {
    for (let h = 0; h < this.weights2.length; h++) {
      this.copySingle(h, nn);
    }
  }

  randomCopy(nn) {
    let h = int(random(this.weights2.length));
    this.copySingle(h, nn);
  }

  copySingle(h, nn) {
    // If the bias was selected, there is nothing to update in weights1.
    if (h < this.weights2.length - 1) {
      for (let i = 0; i < this.weights1.length; i++) {
        this.weights1[i][h] = nn.weights1[i][h];
      }
    }
    for (let o = 0; o < this.weights2[h].length; o++) {
      this.weights2[h][o] = nn.weights2[h][o];
    }
  }

  // Given an input, produce an output.
  play(inputs) {
    this.normalInputs = [0, 0, 0];
    for (let i = 0; i < inputs.length; i++) {
      this.normalInputs[i] = this.sigmoid(inputs[i] / 200);
    }

    if (this.verbose) {
      console.log("ins", this.normalInputs);
    }
    this.hiddens = [];
    for (let h = 0; h < this.weights1[inputs.length].length; h++) {
      var sum = this.weights1[inputs.length][h];
      for (let i = 0; i < inputs.length; i++) {
        sum += this.weights1[i][h] * this.normalInputs[i];
      }
      this.hiddens.push(this.sigmoid(sum));
    }
    if (this.verbose) {
      console.log("hiddens", this.hiddens);
    }

    var result = [0, 0];
    // TODO bias
    for (let o = 0; o < result.length; o++) {
      result[o] = this.weights2[this.hiddens.length][o];
      for (let h = 0; h < this.hiddens.length; h++) {
        result[o] += this.weights2[h][o] * this.hiddens[h];
      }
      result[o] = this.sigmoid(result[o]);
    }

    if (this.verbose) {
      console.log("result", result);
    }

    return result;
  }

}

export class NeuralNetRender {
  constructor() {
  }

  draw(x, y, nn) {
    strokeWeight(2);

    for (var i = 0; i < nn.weights1.length; i++) {
      for (var h = 0; h < nn.weights1[i].length; h++) {
        let colStrength = nn.weights1[i][h] * 10 + 127;
        // Limit the col between 0-255
        let g = Math.min(Math.max(colStrength, 0), 255);
        stroke(255 - g, g, 0);
        line(x + 20 + i * 20, y + 15, x + 10 + h * 15 , y + 55);
      }
    }


    for (var h = 0; h < nn.weights2.length; h++) {
      for (var o = 0; o < nn.weights2[h].length; o++) {
        let colStrength = nn.weights2[h][o] * 10 + 127;
        // Limit the col between 0-255
        let g = Math.min(Math.max(colStrength, 0), 255);
        stroke(255 - g, g, 0);
        line(x + 10 + h * 15, y + 55, x + 30 + o * 40 , y + 90);
      }
    }
  }
}