from settings.base import *

ENV = 'production'

SENTRY_DSN = 'https://9a549cab984c4f91a005e31bf7aeb0ed:5a33f71d3fd9434586c1938ab4e7572b@sentry.io/175555'

API_URL = 'https://mudge.co.nz/'
STATIC_URL = 'https://mudge.co.nz/'

# Google creds from mikemudge/mudgeconz-production.
# From https://console.developers.google.com/apis/credentials?project=mikemudge
GOOGLE_CLIENT_ID = '872711897303-6rkqgedhsq6rni9ikt6j6v8rbhkkkd7a.apps.googleusercontent.com'
GOOGLE_MAPS_API_KEY = 'AIzaSyDBZVc0PEO69o_tefArBGUUvj-v5ntRYd0'

try:
    # import the local config to override for local settings
    from local_config import *
except:
    pass
