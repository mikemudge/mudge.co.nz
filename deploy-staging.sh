# Run all the things which are needed to deploy this code to staging.
# Lives only in the pyauto checkout - stage-mudge is no longer a git
# checkout, just a plain directory holding local_config.py and the
# assets extracted from the image below.

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

echo 'Extracting static assets and nginx config from the image.'
mkdir -p ~/projects/stage-mudge/nginx
docker create --name mudgeconz-staging-extract "$IMAGE" > /dev/null
rm -rf ~/projects/stage-mudge/static-new
docker cp mudgeconz-staging-extract:/app/static ~/projects/stage-mudge/static-new
docker cp mudgeconz-staging-extract:/app/nginx/stage.mudge.co.nz.conf ~/projects/stage-mudge/nginx/stage.mudge.co.nz.conf
docker rm mudgeconz-staging-extract > /dev/null

mkdir -p ~/projects/stage-mudge/static
rsync -a --delete --exclude=.well-known ~/projects/stage-mudge/static-new/ ~/projects/stage-mudge/static/
rm -rf ~/projects/stage-mudge/static-new

echo 'Updating nginx config.'
# Source path matches the existing /etc/sudoers.d/<username> NOPASSWD grant.
sudo cp ~/projects/stage-mudge/nginx/stage.mudge.co.nz.conf /etc/nginx/sites-available/stage-mudge
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
