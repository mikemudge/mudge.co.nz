#!/bin/bash
set -e

# Create the DB to use for testing.
psql -f tests/test_db.sql

# Nosetests doesn't use manage.py or APP_SETTINGS.
# It will always use the settings.test config.

pytest tests
