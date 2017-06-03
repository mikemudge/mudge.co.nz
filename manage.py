#!/usr/bin/env python

from app import create_app
from flask_migrate import MigrateCommand
from flask_script import Manager
from shared.init_command import InitCommand
from trail.commands import TrailCommand

app = create_app()

manager = Manager(app)
manager.add_command('db', MigrateCommand)
manager.add_command('trail', TrailCommand)
manager.add_command('init', InitCommand)

if __name__ == '__main__':
    manager.run()
