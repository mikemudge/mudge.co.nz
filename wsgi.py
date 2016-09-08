from models import db
from runner import create_app
import config

application = create_app(config)
db.create_all()

if __name__ == "__main__":
    application.run()
