from base import *

ENV = 'production'

SENTRY_DSN = 'https://9a549cab984c4f91a005e31bf7aeb0ed:5a33f71d3fd9434586c1938ab4e7572b@sentry.io/175555'

try:
    # import the local config to override for local settings
    from local_config import *
except:
    pass
