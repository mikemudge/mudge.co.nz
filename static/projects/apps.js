function renderTile(container, app, href) {
  var tile = document.createElement('div');
  tile.className = 'project';

  var link = document.createElement('a');
  link.href = href;

  var title = document.createElement('h4');
  title.textContent = app.title;
  link.appendChild(title);

  var image = document.createElement('div');
  image.className = 'image';
  if (app.img) {
    var img = document.createElement('img');
    img.src = '/static/img/projects/' + app.img;
    image.appendChild(img);
  } else {
    var placeholder = document.createElement('div');
    placeholder.className = 'placeholder';
    placeholder.textContent = 'WIP';
    image.appendChild(placeholder);
  }
  link.appendChild(image);

  tile.appendChild(link);
  container.appendChild(tile);
}

function loadApps() {
  var container = document.getElementById('apps-list');
  var status = container.dataset.status || 'done';
  var showApps = container.dataset.showApps === 'true';
  // Finished apps must have an image to be shown; work-in-progress ones
  // fall back to a placeholder instead.
  var requireImg = status === 'done';

  fetch('/api/projects/apps?status=' + status)
    .then(function(response) { return response.json(); })
    .then(function(data) {
      data.games.forEach(function(game) {
        if (requireImg && !game.img) {
          return;
        }
        renderTile(container, game, '/games/' + (game.path || ('p5/' + game.key)));
      });

      if (showApps) {
        data.apps.forEach(function(app) {
          if (requireImg && !app.img) {
            return;
          }
          renderTile(container, app, '/projects/' + app.key);
        });
      }
    });
}

loadApps();
