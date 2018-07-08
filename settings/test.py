from settings.base import *

ENV = 'test'

TESTING = True
SQLALCHEMY_DATABASE_URI = 'postgres://mudgeconzTest:test_password@db/mudgeconzTest'
PRESERVE_CONTEXT_ON_EXCEPTION = False
SECRET_KEY = "Testing Secret"

# This will print out all the queries which get run. Very verbose.
# SQLALCHEMY_ECHO = True

# No local_config for testing.
# Where tests are run should be irrelevent.
