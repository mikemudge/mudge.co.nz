ENABLE_TEST = False

ENV = 'dev'

LOG_LEVEL="INFO"

FAVICON = 'favicon.png'

SENTRY_DSN = None

# Configuration
SQLALCHEMY_TRACK_MODIFICATIONS = False
DEBUG = False
USERNAME = 'admin'
PASSWORD = 'default'
AUTH_COOKIE_ID = 'mudgeAuthCookieId'
VERIFY_GOOGLE_AUTH = True

API_URL = 'http://localhost:5000/'

AMAZON_S3_URL = 'https://d7cvc31wlmbhf.cloudfront.net/'

# JWT
JWT_TOKEN_ALGORITHM = "HS512"

# Set these in local_config.py
JWT_TOKEN_SECRET_KEY = None
SECRET_KEY = None
# Connection to the DB.
SQLALCHEMY_DATABASE_URI = None

# Authentication for the web client.
CLIENT_ID = None
CLIENT_SECRET = None

# TODO could just put this on prod?
RESTRICT_FLASK_ADMIN = [
    '122.58.43.24',  # My home
    '73.15.185.193',  # Mian flat
    '172.18.0.1',  # for docker
    '127.0.0.1',
]
