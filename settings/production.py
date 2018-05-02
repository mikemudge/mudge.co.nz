from settings.base import *

ENV = 'production'

SENTRY_DSN = 'https://9a549cab984c4f91a005e31bf7aeb0ed:5a33f71d3fd9434586c1938ab4e7572b@sentry.io/175555'

API_URL = 'https://mudge.co.nz/'
STATIC_URL = 'https://mudge.co.nz/'

# Google creds from Mudgeconz-production.
# TODO should use.
# GOOGLE_CLIENT_ID = '1043352668790-m9tpuq2olru8ulu4uuq259d9cu4i7ant.apps.googleusercontent.com'
GOOGLE_MAPS_API_KEY = 'AIzaSyB1xkgB5etufPqDdag2MiT1oJMsL00OpXc'

try:
    # import the local config to override for local settings
    from local_config import *
except:
    pass
