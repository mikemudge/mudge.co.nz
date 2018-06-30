# Run all the things which are needed to deploy this code in production.

set -e

source ~/virtualenvs/mudgeconz/bin/activate

cd ~/projects/pyauto

# put the git hash in a file, used for caching.
# TODO is there a better version id we can use?
git --git-dir=.git --work-dir=. rev-parse HEAD > .commithash

echo 'Installing pip3 dependencies.'
pip3 install -r requirements.txt

echo 'Updating database.'
./manage.py db upgrade

echo 'Restarting webserver.'
sudo systemctl restart webserver.service

# TODO this needs to change.
# echo 'Compiling static files.'
# brunch build --production

echo 'Restart nginx to serve the new static files.'
sudo service nginx restart
