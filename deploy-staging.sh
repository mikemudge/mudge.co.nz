# Run all the things which are needed to deploy this code to staging.
# Lives only in the pyauto checkout - stage-mudge is not a git checkout,
# just a plain directory holding staging's local_config.py. static/ and
# nginx config are shared from pyauto's checkout (same as prod's), since
# they're not meaningfully different per-environment content.

set -e

IMAGE="registry.digitalocean.com/mikemudge/mudgeconz-app:staging"

echo 'Pulling the app image.'
docker pull "$IMAGE"

echo 'Updating database.'
docker run --rm --network host \
  -v ~/projects/stage-mudge/settings/local_config.py:/app/settings/local_config.py:ro \
  -e APP_SETTINGS=settings.staging \
  -e FLASK_APP=manage.py \
  "$IMAGE" flask db upgrade

echo 'Updating nginx config.'
# Source path matches the /etc/sudoers.d/<username> NOPASSWD grant - update
# it if this path ever changes.
sudo cp ~/projects/pyauto/nginx/stage.mudge.co.nz.conf /etc/nginx/sites-available/stage-mudge
sudo nginx -t

echo 'Restarting the app container.'
docker stop mudgeconz-app-staging || true
docker rm mudgeconz-app-staging || true
docker run -d --name mudgeconz-app-staging \
  --restart unless-stopped \
  --network host \
  -v ~/projects/stage-mudge/settings/local_config.py:/app/settings/local_config.py:ro \
  "$IMAGE" uwsgi --ini /app/staging.ini

echo 'Restart nginx to serve the new static files.'
# These commands are allowed passwordless due to changes to /etc/sudoers.d/<username>
sudo /etc/init.d/nginx reload
