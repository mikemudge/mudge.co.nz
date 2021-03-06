# Run all the things which are needed to deploy this code in production.

set -e

source ~/virtualenvs/mudgeconz/bin/activate

cd ~/projects/pyauto

# put the git hash in a file, used for caching.
# TODO is there a better version id we can use?
git --git-dir=.git --work-tree=. rev-parse HEAD > .commithash

echo 'Installing pip3 dependencies.'
pip3 install -r frozen_requirements.txt

echo 'Updating database.'
export APP_SETTINGS=settings.production
./manage.py db upgrade

echo 'Restarting webserver.'
sudo systemctl restart webserver.service

echo 'Restart nginx to serve the new static files.'
# This command is allowed passwordless due to changes to /etc/sudoers.d/<username>
sudo /etc/init.d/nginx reload
