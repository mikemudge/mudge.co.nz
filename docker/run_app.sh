#!/bin/bash
set -e

# Run the migrations
/app/manage.py migrate

# Start app in staging/production mode
uwsgi --chdir /app/ uwsgi.ini
