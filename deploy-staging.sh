# Run all the things which are needed to deploy this code to staging.

set -e

cd ~/projects/stage-mudge

# put the git hash in a file, used for caching.
git --git-dir=.git --work-tree=. rev-parse HEAD > .commithash

echo 'Building the app image.'
docker build -t mudgeconz-app-staging .

echo 'Updating database.'
docker run --rm --network host \
  -v ~/projects/stage-mudge:/app \
  -e APP_SETTINGS=settings.staging \
  -e FLASK_APP=manage.py \
  mudgeconz-app-staging flask db upgrade

echo 'Restarting the app container.'
docker stop mudgeconz-app-staging || true
docker rm mudgeconz-app-staging || true
docker run -d --name mudgeconz-app-staging \
  --restart unless-stopped \
  --network host \
  -v ~/projects/stage-mudge:/app \
  mudgeconz-app-staging uwsgi --ini /app/staging.ini

echo 'Updating nginx config.'
sudo cp nginx/stage.mudge.co.nz.conf /etc/nginx/sites-available/stage-mudge
sudo nginx -t

echo 'Restart nginx to serve the new static files.'
# These commands are allowed passwordless due to changes to /etc/sudoers.d/<username>
sudo /etc/init.d/nginx reload
