ENABLE_TEST = False

# Configuration
SQLALCHEMY_DATABASE_URI = 'postgres://mudgeconz:xXBE3RcJi1ULfeo3LKENqdBZqmtzLI@localhost/mudgeconz'
SQLALCHEMY_TRACK_MODIFICATIONS = False
DEBUG = True
SECRET_KEY = 'development key mike rocks ^U8f)PpGhyf"ECf/'
USERNAME = 'admin'
PASSWORD = 'default'
GOOGLE_CLIENT_ID = '872711897303-6rkqgedhsq6rni9ikt6j6v8rbhkkkd7a.apps.googleusercontent.com'
AUTH_COOKIE_ID = 'mudgeAuthCookieId'

try:
    # import the local config to override for local settings
    from local_config import *
except:
    pass
