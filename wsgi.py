from models import db
from runner import create_app
import config

application = create_app(config)
# This isn't going to work well all the time.
# TODO figure out a better way to seperate data for apps.
# Yet still allow sharing when it is required.
db.init_app(application)
db.create_all()

if __name__ == "__main__":
    application.run()
