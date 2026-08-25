# Run all the things which are needed to deploy this code to staging.
# Runs from the stage-mudge checkout itself (already switched to the branch
# being deployed, by the SSH command that invokes this) - not the pyauto
# checkout - so a branch's own version of this script is what actually
# executes, not always whatever's on main.

set -e

IMAGE="ghcr.io/mikemudge/mudgeconz-app:staging"

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
