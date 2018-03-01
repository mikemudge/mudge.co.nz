#!/bin/bash
set -e

/app/docker/wait-for-it.sh db:5432 --timeout=60 -s --

# the db might be up, but it takes a couple of seconds longer to get ready
sleep 10

# Use database if existent
if [ "$( psql -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname='local_dev'" )" = '1' ]; then
  echo "Using existing database"
else
  # Create local database
  psql -U postgres < /app/docker/local_dev.sql
fi

# Make database for running tests against.
if [ "$( psql -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname='mudgeconzTest'" )" = '1' ]; then
  echo "Using existing database"
else
  psql -f tests/test_db.sql
fi

# Run migrations
/app/manage.py db upgrade

# Start app in development mode
# /app/manage.py runserver -dr -p 5000 -h 0.0.0.0
flask run -p 5000 -h 0.0.0.0

# Keep alive the container for testing.
# sleep infinity
