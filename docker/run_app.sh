#!/bin/bash
set -e

# Run the migrations
export FLASK_APP=manage.py
flask db upgrade

# Start app in staging/production mode
uwsgi --chdir /app/ uwsgi.ini
