#!/bin/bash
set -e

# Runs uwsgi the way production does (master + cheaper worker scaling,
# static files handled the same way nginx would), but speaking HTTP
# directly since there's no nginx in front locally. Useful for testing
# prod-like behaviour - worker scaling, static-map, uwsgi startup itself -
# without needing an actual deploy.
exec uwsgi --http :5002 --module wsgi:application --master \
    --processes 5 --cheaper 1 --cheaper-initial 1 --cheaper-step 1 \
    --static-map /static=/app/static
