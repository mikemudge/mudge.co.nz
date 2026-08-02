from settings.base import *

ENV = 'production'

API_URL = 'https://mudge.co.nz/'

# Deny by default. Add your current IP to RESTRICT_FLASK_ADMIN in
# local_config.py for the session, remove it when done.
RESTRICT_FLASK_ADMIN = []

try:
    # import the local config to override for local settings
    from settings.local_config import *
except:
    pass
