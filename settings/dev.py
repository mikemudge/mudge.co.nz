from settings.base import *

FAVICON = 'favicon-dev.png'

ENABLE_TEST = True

# In dev some secrets don't need to be hidden.
# They are only used within your localhost.
JWT_TOKEN_SECRET_KEY = "fakesecretfordev"
SECRET_KEY = "fakesecretfordev"

# Client creds are used to identify a client app which is authenticating with the api.
# In dev this doesn't need to be secret, but it does need to match a client in the DB.
# To create a default web client using these credentials you can run ./manage.py init auth
CLIENT_ID = 'n1xKWnaH6ujwqnkOectTxKGaaTxBVe6FlPmV6B6y'
CLIENT_SECRET = '9iyycZI7zJwhEFrn9UoDoVv9YNkDAIkP6vkiEtLPGl2xSY3W7Y'

SQLALCHEMY_DATABASE_URI = 'postgresql://postgres:password@db/postgres'

DEBUG = True

LOG_LEVEL="DEBUG"
try:
    # import the local config to override for local settings
    from settings.local_config import *
except:
    pass