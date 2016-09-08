
# Configuration
# TODO use sqlite for development because it doesn't need migrations?
SQLALCHEMY_DATABASE_URI = 'sqlite:///firstproject.db'
# SQLALCHEMY_BINDS = {
#     'db1': SQLALCHEMY_DATABASE_URI,
#     'db2': 'postgres://mudgeconz:xXBE3RcJi1ULfeo3LKENqdBZqmtzLI@localhost/mudgeconz'
# }
SQLALCHEMY_TRACK_MODIFICATIONS = False
DEBUG = True
SECRET_KEY = 'development key mike rocks ^U8f)PpGhyf"ECf/'
USERNAME = 'admin'
PASSWORD = 'default'
GOOGLE_CLIENT_ID = '872711897303-6rkqgedhsq6rni9ikt6j6v8rbhkkkd7a.apps.googleusercontent.com'
