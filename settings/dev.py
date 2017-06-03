from base import *

ENV = 'production'

FAVICON = 'favicon-dev.png'

try:
    # import the local config to override for local settings
    from local_config import *
except:
    pass
