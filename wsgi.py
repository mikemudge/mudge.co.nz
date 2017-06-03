from app import create_app

import os

if os.environ.get('APP_SETTINGS'):
    config = os.environ.get('APP_SETTINGS')
else:
    config = 'settings.production'

application = create_app(config)

if __name__ == "__main__":
    application.run()
