from base import *

ENV = 'production'

FAVICON = 'favicon-dev.png'

ENABLE_TEST = True

DEBUG = True

try:
    # import the local config to override for local settings
    from local_config import *
except:
    pass
