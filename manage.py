#!/usr/bin/env python3

from app import create_app
from flask_migrate import MigrateCommand
from flask_script import Manager, Server
from apps.rock1500.command import Command as RockCommand
from shared.init_command import InitCommand
from shared.fake_command import FakeCommand
from apps.project_manager.command import ProjectCommand

app = create_app()

manager = Manager(app)
manager.add_command('db', MigrateCommand)
manager.add_command('init', InitCommand)
manager.add_command('fake', FakeCommand)
manager.add_command('rock1500', RockCommand)
manager.add_command('project', ProjectCommand)
manager.add_command("runserver", Server(
    threaded=True,
    use_debugger=True,
    processes=2,
    passthrough_errors=False
))


if __name__ == '__main__':
    manager.run()
