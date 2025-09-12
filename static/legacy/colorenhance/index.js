function ClusterFinder(maxClusters) {
  this.clusters = [];
  for (var i = 0; i < maxClusters; i++) {
    this.addCluster();
  }
}

ClusterFinder.prototype.addCluster = function() {
  this.clusters.push({
    r: Math.random() * 256,
    g: Math.random() * 256,
    b: Math.random() * 256,
    population: 0,
  });
}

ClusterFinder.prototype.update = function(data) {
  let l = data.length / 4;
  // for each point find the cluster which is closest.
  closestCluster = []
  for (let i = 0; i < l; i++) {
    best = null;
    this.clusters.forEach(function(c, ii) {
      a1 = c.r - data[i * 4 + 0];
      a2 = c.g - data[i * 4 + 1];
      a3 = c.b - data[i * 4 + 2];
      dis = Math.abs(a1) + Math.abs(a2) + Math.abs(a3);
      if (best == null || dis < best) {
        best = dis;
        bestIndex = ii;
      }
    });
    if (best == null) {
      throw new Error('nope');
    }
    closestCluster[i] = this.clusters[bestIndex];
  }

  // Iterate the data again and update the clusters to represent their assigned data better.
  this.clusters.forEach(function(c, ii) {
    c.r = 0;
    c.g = 0;
    c.b = 0;
    c.population = 0;
  });
  for (let i = 0; i < l; i++) {
    c = closestCluster[i];
    c.population += 1;

    c.r += data[i * 4 + 0];
    c.g += data[i * 4 + 1];
    c.b += data[i * 4 + 2];
  }
  this.clusters.forEach(function(c) {
    if (c.population) {
      c.r /= c.population;
      c.g /= c.population;
      c.b /= c.population;
    }
  });

  // Now update the colors to be the best cluster color.
  for (let i = 0; i < l; i++) {
    c = closestCluster[i];
    data[i * 4 + 0] = c.r;
    data[i * 4 + 1] = c.g;
    data[i * 4 + 2] = c.b;
  }
}

var myChart = null;
function showChart(data) {
  var ctx = document.getElementById('myChart').getContext('2d');
  labels = [];
  for (var i = 0; i < data.length; i++)
    labels[i] = i;

  if (myChart) {
    myChart.destroy();
  }
  myChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Color enancer',
        data: data,
        borderWidth: 1
      }]
    },
    options: {
      scales: {
          yAxes: [{
              ticks: {
                  beginAtZero: true,
                  suggestedMin: 0,
                  suggestedMax: 256
              }
          }],
          xAxes: [{
              ticks: {
                  beginAtZero: true,
                  suggestedMin: 0,
                  suggestedMax: 256
              }
          }]
      },
      elements: {
        point:{
          radius: 0
        }
      }
    }
  });    
}

function main() {
  const constraints = {
    video: true,
  };

  const video = document.querySelector("video");

  navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
    video.srcObject = stream;
  });

  const screenshotButton = document.querySelector("#screenshot-button");
  const playPauseButton = document.querySelector("#play-button");
  const enhanceButton = document.querySelector("#enhance-button");
  const enhanceLevel = document.querySelector("#enhance-level");

  const canvas = document.querySelector("canvas");
  // Downsized to 1/2 in each direction to reduce the number of pixels to manipulate.
  canvas.width = 640;
  canvas.height = 360;

  screenshotButton.onclick = video.onclick = function () {
    renderImage();
  };

  playPauseButton.onclick = video.onclick = function () {
    looping = !looping;
    loop();
  };

  enhancement = null;
  setEnhancement = function() {
    enhancement = [];
    scale = parseInt(enhanceLevel.value);
    for (i = 0; i < 256; i++) {
      enhancement[i] = i
      // if (i > 128) {
        val = Math.round(256 * (1 / (1 + Math.exp((127 - i) / scale))));
        enhancement[i] = (Math.min(255, val));
      // }
    }

    showChart(enhancement);
  }
  enhanceLevel.onchange = setEnhancement;


  enhanceButton.onclick = function () {
    if (enhancement) {
      enhancement = null;
      return;
    }
    setEnhancement();
  }

  cluster = new ClusterFinder(5);

  const ctx = canvas.getContext('2d')
  rotateRed = true;
  rotateBlue = false;
  function renderImage() {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      let frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let l = frame.data.length / 4;

      // cluster.update(frame.data);

      for (let i = 0; i < l; i++) {
        let r = frame.data[i * 4 + 0];
        let g = frame.data[i * 4 + 1];
        let b = frame.data[i * 4 + 2];
        // When blue is the most prominent color, change it.
        if (rotateBlue && b > r && b > g) {
          frame.data[i * 4 + 0] = b;
          frame.data[i * 4 + 1] = r;
          frame.data[i * 4 + 2] = g;
        }
        if (rotateRed && r > b && r > g) {
          frame.data[i * 4 + 0] = g;
          frame.data[i * 4 + 1] = b;
          frame.data[i * 4 + 2] = r;
        }
        r = frame.data[i * 4 + 0];
        g = frame.data[i * 4 + 1];
        b = frame.data[i * 4 + 2];
        // Should be a 0-1 value.
        intensity = (r * r + g * g + b * b) / 195075;
        if (enhancement) {
          frame.data[i * 4 + 0] = enhancement[frame.data[i * 4 + 0]];
          frame.data[i * 4 + 1] = enhancement[frame.data[i * 4 + 1]];
          frame.data[i * 4 + 2] = enhancement[frame.data[i * 4 + 2]];
        }
      }
      ctx.putImageData(frame, 0, 0);  
  }

  var looping = true;
  function loop() {
    if (canvas.width) {
      renderImage();    
    }
    if (looping) {
      requestAnimationFrame(loop);
    }
  }
  loop();
}

main();
