from settings.base import *

ENV = 'staging'

API_URL = 'https://stage.mudge.co.nz/'

try:
    # import the local config to override for local settings
    from settings.local_config import *
except:
    pass
