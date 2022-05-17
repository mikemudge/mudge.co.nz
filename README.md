### Development
Uses docker.

To test any docker image
docker run --rm -it --entrypoint bash <image>

To build:
docker-compose build

To run the built image:
docker-compose up -d
Then see the logs:
docker-compose logs -f app

To connect with a shell
docker-compose exec app /bin/bash

For https development (E.g orientation events/camera stuff)
./run_https.py
Will host a https server on port 5001

lsvirtualenv
mkvirtualenv
workon
https://virtualenvwrapper.readthedocs.org/en/latest/command_ref.html#managing-environments

Test using
docker-compose exec app pytest
Or test a single file with
docker-compose exec app pytest tests/rock_tests/test_rock.py

DB migrations
To create a migration file use
```docker-compose exec app bash```

```./manage.py db migrate -m "Migration Name"```
Then to apply the migrations (after reviewing the created file) use
./manage.py db upgrade
You should test this before deploying where it will happen automatically.
Also check that you can downgrade from the new revision.
./manage.py db downgrade

### Packages/Dependencies
Using pip
Within the app container.
See outdated packages with
pip list --outdated
Update a single package.
pip install urllib3 --upgrade
pip freeze > frozen_requirements.txt

### New setup onboarding.
clone repo from git.
git clone https://github.com/mikemudge/mudge.co.nz.git
cd mudge.co.nz

# Run the containers.
docker compose up -d

# Connect to the app container and run some initialization commands.
docker compose exec app bash

./manage.py db upgrade
./manage.py init auth
./manage.py init create_user mike.mudge@gmail.com

# Local Config
create settings/local_config.py
Need a GOOGLE_CLIENT_ID and GOOGLE_MAPS_API_KEY set here if you want to use login/maps.
These values are not checked in (local_config.py) because they are production keys. 
Go to https://console.cloud.google.com/ to see your google projects.

# Multiple github accounts (ssh keys) on 1 computer.
https://gist.github.com/jexchan/2351996

### Production

Restart the python app.
sudo systemctl restart webserver.service

Restart nginx
sudo service nginx restart

Logs location on server.
sudo systemctl status webserver.service

See setup here.
https://www.digitalocean.com/community/tutorials/how-to-serve-flask-applications-with-uwsgi-and-nginx-on-ubuntu-16-04

Systemctl configs live in
/etc/systemd/system/

# Deployment
Uses a git hook to auto deploy.
/home/mudge/repos/pyauto.git/hooks
Pulls the repo to a test folder and tests it.
Then if tests pass will pull to the prod folder and run deploy.sh
See deploy.sh for what commands run.

#DB Backups
Run daily @ 4am in mudge@mudge.co.nz crontab.
outputs sql files into /home/mudge/db-backups/
https://www.postgresql.org/docs/9.1/static/backup-dump.html

#DB Restore
In sandbox, copy the backup file locally.
Mount it into the db (postgres) container using docker-compose.yml
      - ./mudgeconz.Tuesday.sql:/tmp/backup.sql

Connect to the db container
docker compose exec db bash
Remove existing records in the tables.
TRUNCATE rock1500_artist CASCADE;

Then on the postgres host, run the restore command.
psql -U postgres postgres < /tmp/backup.sql

Caveats
The dump may have a dependency in the wrong order.
E.g rock1500_album depends on rock1500_artist but is inserted first.
Running the command again can help as artist should be inserted in the first run, and album can be inserted in the 2nd.
Tables which depend on user have issues as users are different in prod and sandbox.
E.g rock1500_picks will not restore in sandbox.

#SSL Certificate
/etc/letsencrypt/live/mudge.co.nz/fullchain.pem
Using letsencrypt
https://www.digitalocean.com/community/tutorials/how-to-secure-nginx-with-let-s-encrypt-on-ubuntu-14-04
Auto renew
/opt/letsencrypt/letsencrypt-auto renew
cron this, weekly
Needs to be root cron to reload the nginx.
30 2 * * 1 /opt/letsencrypt/letsencrypt-auto renew >> /var/log/le-renew.log
35 2 * * 1 /etc/init.d/nginx reload

#Mail Server
config is at.
sudo nano /etc/postfix/main.cf
sudo service postfix restart

aliases are in
sudo nano /etc/postfix/virtual
sudo postmap /etc/postfix/virtual

Postfix logs
tail -f -n100 /var/log/maillog

Could add spamassassin?
/etc/init.d/spamassassin start

#Postgres setup
Requires postgres (uses docker image for dev.)
See docker/sql/create_db.sql
