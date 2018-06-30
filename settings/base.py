ENABLE_TEST = False

ENV = 'dev'

FAVICON = 'favicon.png'

SENTRY_DSN = None

# Configuration
SQLALCHEMY_DATABASE_URI = 'postgres://postgres:postgres@db/postgres'
SQLALCHEMY_TRACK_MODIFICATIONS = False
DEBUG = False
SECRET_KEY = 'development key mike rocks ^U8f)PpGhyf"ECf/'
USERNAME = 'admin'
PASSWORD = 'default'

# From https://console.developers.google.com/apis/credentials?project=mikemudge
# TODO should replace, and restrict more.
GOOGLE_CLIENT_ID = '872711897303-6rkqgedhsq6rni9ikt6j6v8rbhkkkd7a.apps.googleusercontent.com'
AUTH_COOKIE_ID = 'mudgeAuthCookieId'
VERIFY_GOOGLE_AUTH = True

# From Flask local test
# https://console.developers.google.com/apis/credentials?project=flask-local-test
GOOGLE_MAPS_API_KEY = 'AIzaSyDQUXJbx4w1Tks0LrYInpKlmPXlWnM6fmY'
# TODO should use this Flask local test.
# GOOGLE_CLIENT_ID = '617413556283-u2glkds0e166eghg3b9l60cu8j3fevcv.apps.googleusercontent.com'

# TODO test this for prod?
# From https://console.developers.google.com/apis/credentials?project=mikemudge
# GOOGLE_MAPS_API_KEY = 'AIzaSyDBZVc0PEO69o_tefArBGUUvj-v5ntRYd0'

# Used to locate static files, aka brunch server.
STATIC_URL = 'http://localhost:3333/'
API_URL = 'http://localhost:5000/'

AMAZON_S3_URL = 'https://d7cvc31wlmbhf.cloudfront.net/'

# JWT
JWT_TOKEN_SECRET_KEY = "Random Secret Token string"
JWT_TOKEN_ALGORITHM = "HS512"

# TODO could just put this on prod?
RESTRICT_FLASK_ADMIN = [
    '118.93.240.57',  # My Flat
    '111.69.37.178',  # 8i Office.
    '118.92.208.31',  # Hugh and Adelle's
    '172.23.0.1',  # for docker
    '172.18.0.1',  # for docker
    '127.0.0.1',
]
