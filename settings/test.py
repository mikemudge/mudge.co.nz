from settings.base import *

ENV = 'test'

TESTING = True
# Using CircleCI (passwordless)
SQLALCHEMY_DATABASE_URI = 'postgres://mudgeconzTest@localhost/mudgeconzTest'

PRESERVE_CONTEXT_ON_EXCEPTION = False
SECRET_KEY = "Testing Secret"

CLIENT_ID = 'nnt4vKMUi5fj9vIjJD46LMDrW0Gdwo6DqbgHJo0A'
CLIENT_SECRET = 'RI9SHT3vCoqCepikm4irYgg6ImI9P9RmKzEcZ6v5xAadoJmRZG'

# JWT
JWT_TOKEN_SECRET_KEY = "Random Secret Token string"

# This will print out all the queries which get run. Very verbose.
# SQLALCHEMY_ECHO = True

# No local_config for testing.
# Where tests are run should be irrelevent.
