### TODO

Update google auth (again)
Your client application uses one of the Google One Tap prompt UI status methods that may stop functioning when FedCM becomes mandatory. Refer to the migration guide to update your code accordingly and opt-in to FedCM to test your changes.
https://developers.google.com/identity/gsi/web/guides/fedcm-migration?s=dc#display_moment
https://developers.google.com/identity/gsi/web/guides/fedcm-migration?s=dc#skipped_moment

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

```flask db migrate -m "Migration Name"```
Then to apply the migrations (after reviewing the created file) use
flask db upgrade
You should test this before deploying where it will happen automatically.
Also check that you can downgrade from the new revision.
flask db downgrade

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

flask db upgrade
flask init auth
flask init create-user mike.mudge@gmail.com

# Local Config
create settings/local_config.py
Need a GOOGLE_CLIENT_ID and GOOGLE_MAPS_API_KEY set here if you want to use login/maps.
These values are not checked in (local_config.py) because they are production keys. 
Go to https://console.cloud.google.com/ to see your google projects.

# Multiple github accounts (ssh keys) on 1 computer.
https://gist.github.com/jexchan/2351996

### Production

The app image is built once in CI and pushed to a DigitalOcean Container
Registry, tagged by commit SHA. Both prod and staging pull that same tag -
deploy.sh/deploy-staging.sh extract static/ and their nginx config straight
out of the pulled image at deploy time, rather than relying on a git checkout
of app code. The only thing genuinely per-environment on the droplet now is
`settings/local_config.py` - everything else (code, static assets, nginx
config, ini files) comes from the image, so there's no way for the two
environments to drift apart in what they're running.

`~/projects/pyauto` is still a real git checkout (tracking main) since it
holds deploy.sh/deploy-staging.sh themselves and prod's local_config.py.
`~/projects/stage-mudge` is just a plain directory now (not a git checkout) -
it only needs staging's local_config.py; static/nginx config get written
there by deploy-staging.sh on every deploy.

Restart the app container manually.
docker restart mudgeconz-app
docker restart mudgeconz-app-staging

Follow logs.
docker logs -f mudgeconz-app
docker logs -f mudgeconz-app-staging

Reload nginx.
sudo /etc/init.d/nginx reload

# Deployment
A push to main runs install_deps -> test -> lint -> build_and_push ->
deploy_staging -> deploy: builds the image once, pushes it to the registry
tagged with the commit SHA, deploys that tag to staging first, then to prod
only if staging deployed cleanly.

To deploy any other branch to staging (e.g. to preview something before it's
on main), use CircleCI's "Trigger Pipeline" in the web UI (or the API): pick
the branch, set the `deploy_stage` parameter to true. That runs
install_deps -> test -> lint -> build_and_push -> deploy_staging on that
branch, without touching prod.

To roll back manually, SSH in and re-run the deploy script with an older SHA:
ssh mudge@mudge.co.nz "cd projects/pyauto && ./deploy.sh <previous-sha>"

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
Uses certbot now (not the old letsencrypt-auto script). Certs for both
mudge.co.nz and stage.mudge.co.nz live under /etc/letsencrypt/live/.

Auto renew happens two ways, both currently active:
- certbot's own systemd timer (certbot.timer -> certbot.service) runs
  `certbot renew` automatically, ~twice a day - but doesn't reload nginx.
- root's crontab also runs /root/update_certs.sh daily at 2pm, which does
  `certbot renew && service nginx reload` - redundant with the timer above,
  but it's the thing that actually reloads nginx to pick up a renewed cert
  (nginx doesn't notice a renewed cert file on its own). `certbot renew`
  is safe to run from both - it just skips any cert not yet due.

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
