ENABLE_TEST = False

ENV = 'dev'

LOG_LEVEL="INFO"

FAVICON = 'favicon.png'

SENTRY_DSN = None

# Configuration
SQLALCHEMY_TRACK_MODIFICATIONS = False
# Transparently replace dead pooled connections (e.g. after the DB restarts)
# instead of raising on the next query that tries to use one.
SQLALCHEMY_ENGINE_OPTIONS = {'pool_pre_ping': True}
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

# Deny by default (see auth/custom_flask_admin.py) - list the IPs allowed
# to reach /flask-admin. dev.py adds local Docker IPs; local_config.py is
# where you'd temporarily add your own IP for a production session.
RESTRICT_FLASK_ADMIN = []
