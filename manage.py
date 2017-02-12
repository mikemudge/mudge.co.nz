#!/usr/bin/env python

import config

from flask_script import Manager
from flask_migrate import MigrateCommand
from app import create_app

app = create_app(config)

manager = Manager(app)
manager.add_command('db', MigrateCommand)

if __name__ == '__main__':
    manager.run()
