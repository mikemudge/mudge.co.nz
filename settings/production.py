ENV = 'production'

API_URL = 'https://mudge.co.nz/'

try:
    # import the local config to override for local settings
    from settings.local_config import *
except:
    pass
