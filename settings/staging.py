ENV = 'staging'

API_URL = 'http://159.203.245.129/'

try:
    # import the local config to override for local settings
    from settings.local_config import *
except:
    pass
