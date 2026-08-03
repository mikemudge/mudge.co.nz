# Run all the things which are needed to deploy this code to staging.
# Lives in the pyauto checkout, but stage-mudge is its own git checkout too
# (for static/nginx config) - pass the branch that was actually deployed
# (matches the app image's code) so static/nginx reflect it as well,
# instead of always trailing whatever's on main.

set -e

BRANCH="${1:-main}"
IMAGE="registry.digitalocean.com/mikemudge/mudgeconz-app:staging"

echo "Updating stage-mudge checkout to $BRANCH."
(
  flock 9
  cd ~/projects/stage-mudge
  git fetch origin "$BRANCH"
  git checkout -B "$BRANCH" "origin/$BRANCH"
) 9>/tmp/stage-mudge-git.lock

echo 'Pulling the app image.'
docker pull "$IMAGE"

echo 'Updating database.'
docker run --rm --network host \
  -v ~/projects/stage-mudge/settings/local_config.py:/app/settings/local_config.py:ro \
  -e APP_SETTINGS=settings.staging \
  -e FLASK_APP=manage.py \
  "$IMAGE" flask db upgrade

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
