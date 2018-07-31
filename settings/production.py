from settings.base import *

ENV = 'production'

API_URL = 'https://mudge.co.nz/'
STATIC_URL = 'https://mudge.co.nz/public/'

try:
    # import the local config to override for local settings
    from local_config import *
except:
    pass
