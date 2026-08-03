# Run all the things which are needed to deploy this code in production.

set -e

IMAGE="registry.digitalocean.com/mikemudge/mudgeconz-app:prod"

cd ~/projects/pyauto

echo 'Pulling the app image.'
docker pull "$IMAGE"

echo 'Updating database.'
docker run --rm --network host \
  -v ~/projects/pyauto/settings/local_config.py:/app/settings/local_config.py:ro \
  -e APP_SETTINGS=settings.production \
  -e FLASK_APP=manage.py \
  "$IMAGE" flask db upgrade

echo 'Extracting static assets and nginx config from the image.'
mkdir -p ~/projects/pyauto/nginx
docker create --name mudgeconz-extract "$IMAGE" > /dev/null
rm -rf ~/projects/pyauto/static-new
docker cp mudgeconz-extract:/app/static ~/projects/pyauto/static-new
docker cp mudgeconz-extract:/app/nginx/mudge.co.nz.conf ~/projects/pyauto/nginx/mudge.co.nz.conf
docker rm mudgeconz-extract > /dev/null

mkdir -p ~/projects/pyauto/static
rsync -a --delete --exclude=.well-known ~/projects/pyauto/static-new/ ~/projects/pyauto/static/
rm -rf ~/projects/pyauto/static-new

echo 'Updating nginx config.'
# Source path matches the existing /etc/sudoers.d/<username> NOPASSWD grant.
sudo cp ~/projects/pyauto/nginx/mudge.co.nz.conf /etc/nginx/sites-available/mudgeconz
sudo nginx -t

echo 'Restarting the app container.'
docker stop mudgeconz-app || true
docker rm mudgeconz-app || true
docker run -d --name mudgeconz-app \
  --restart unless-stopped \
  --network host \
  -v ~/projects/pyauto/settings/local_config.py:/app/settings/local_config.py:ro \
  "$IMAGE" uwsgi --ini /app/mudgeconz.ini

echo 'Restart nginx to serve the new static files.'
# These commands are allowed passwordless due to changes to /etc/sudoers.d/<username>
sudo /etc/init.d/nginx reload
