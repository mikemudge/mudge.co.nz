#!/bin/bash
set -e

# Run this from the repo root on your host - it drives the docker compose
# services directly, so the app image doesn't need a postgres client installed.

# (Re)create the DB to use for testing, via the db container.
docker compose exec -T db psql -U postgres < tests/test_db.sql

# APP_TEST_SETTINGS=settings.localtest is set on the app container (see
# docker-compose.yml), which points tests at the DB created above rather
# than the dev DB - so this won't touch your dev data.
docker compose exec app pytest tests
