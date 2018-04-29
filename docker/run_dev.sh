#!/bin/bash
set -e

# Start app in development mode
# /app/manage.py runserver -dr -p 5000 -h 0.0.0.0
flask run -p 5000 -h 0.0.0.0

# Keep alive the container for testing.
# sleep infinity
