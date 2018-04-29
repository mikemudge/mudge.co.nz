from settings.base import *

ENV = 'test'

TESTING = True
SQLALCHEMY_DATABASE_URI = 'postgres://mudgeconzTest:test_password@db/mudgeconzTest'
PRESERVE_CONTEXT_ON_EXCEPTION = False
SECRET_KEY = "Testing Secret"

try:
    # import the local config to override for local settings
    from local_config import *
except:
    pass
