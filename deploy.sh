# Run all the things which are needed to deploy this code in production.

set -e

cd ~/projects/pyauto

# put the git hash in a file, used for caching.
# TODO is there a better version id we can use?
git --git-dir=.git --work-tree=. rev-parse HEAD > .commithash

echo 'Building the app image.'
docker build -t mudgeconz-app .

echo 'Updating database.'
docker run --rm --network host \
  -v ~/projects/pyauto:/app \
  -e APP_SETTINGS=settings.production \
  -e FLASK_APP=manage.py \
  mudgeconz-app flask db upgrade

echo 'Restarting the app container.'
docker stop mudgeconz-app || true
docker rm mudgeconz-app || true
docker run -d --name mudgeconz-app \
  --restart unless-stopped \
  --network host \
  -v ~/projects/pyauto:/app \
  mudgeconz-app uwsgi --ini /app/mudgeconz.ini

echo 'Updating nginx config.'
sudo cp nginx/mudge.co.nz.conf /etc/nginx/sites-available/mudgeconz
sudo nginx -t

echo 'Restart nginx to serve the new static files.'
# These commands are allowed passwordless due to changes to /etc/sudoers.d/<username>
sudo /etc/init.d/nginx reload
