#!/usr/bin/env python

from app import create_app
from flask_migrate import MigrateCommand
from flask_script import Manager
from rock1500.command import Command as RockCommand
from shared.init_command import InitCommand
from auth.init_command import InitAuthCommand
# from trail.commands import TrailCommand

app = create_app()

manager = Manager(app)
manager.add_command('db', MigrateCommand)
# manager.add_command('trail', TrailCommand)
manager.add_command('init', InitCommand)
manager.add_command('auth', InitAuthCommand)
manager.add_command('rock1500', RockCommand)

if __name__ == '__main__':
    manager.run()
