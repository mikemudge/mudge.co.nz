###Development###
Uses docker.

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

###Production###

Restart the python app.
sudo systemctl restart webserver.service

Restart nginx
sudo service nginx restart

Logs location on server.
sudo systemctl status webserver.service

See setup here.
https://www.digitalocean.com/community/tutorials/how-to-serve-flask-applications-with-uwsgi-and-nginx-on-ubuntu-16-04

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
