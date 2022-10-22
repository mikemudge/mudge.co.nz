#!/bin/bash
set -e

pip install -r requirements.txt
# Start app in development mode
# /app/manage.py runserver -dr -p 5000 -h 0.0.0.0

exec flask run --host=0.0.0.0
