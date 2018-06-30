from settings.base import *

ENV = 'test'

TESTING = True
SQLALCHEMY_DATABASE_URI = 'postgres://mudgeconzTest:test_password@db/mudgeconzTest'
PRESERVE_CONTEXT_ON_EXCEPTION = False
SECRET_KEY = "Testing Secret"

# TODO No local_config for testing.
# Because all settings should be included here. where tests are run should be irrelevent?
try:
    # import the local config to override for local settings
    from local_config import *
except:
    pass
