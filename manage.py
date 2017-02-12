#!/usr/bin/env python

import config

from api.commands import TrailCommand
from app import create_app
from flask_migrate import MigrateCommand
from flask_script import Manager

app = create_app(config)

manager = Manager(app)
manager.add_command('db', MigrateCommand)
manager.add_command('trail', TrailCommand)

if __name__ == '__main__':
    manager.run()
