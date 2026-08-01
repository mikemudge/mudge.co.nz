from settings.test import *

# Does everything that test does but uses a DB in docker-compose.
SQLALCHEMY_DATABASE_URI = 'postgresql://mudgeconztest:test_password@db/mudgeconztest'
