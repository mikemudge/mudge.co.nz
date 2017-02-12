ENABLE_TEST = False

# Configuration
SQLALCHEMY_DATABASE_URI = 'postgres://mudgeconz:xXBE3RcJi1ULfeo3LKENqdBZqmtzLI@localhost/mudgeconz'
SQLALCHEMY_BINDS = {
    # Used for trails.
    'old_sqlite': 'sqlite:///firstproject.db',
}

SQLALCHEMY_TRACK_MODIFICATIONS = False
DEBUG = True
SECRET_KEY = 'development key mike rocks ^U8f)PpGhyf"ECf/'
USERNAME = 'admin'
PASSWORD = 'default'
GOOGLE_CLIENT_ID = '872711897303-6rkqgedhsq6rni9ikt6j6v8rbhkkkd7a.apps.googleusercontent.com'
AUTH_COOKIE_ID = 'mudgeAuthCookieId'

# JWT
JWT_TOKEN_SECRET_KEY = "Random Secret Token string"
JWT_TOKEN_ALGORITHM = "HS512"

try:
    # import the local config to override for local settings
    from local_config import *
except:
    pass
