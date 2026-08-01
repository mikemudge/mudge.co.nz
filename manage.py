#!/usr/bin/env python3

from app import create_app
from apps.project_manager.command import ProjectCommand
from apps.rock1500.command import Command as RockCommand
from shared.fake_command import FakeCommand
from shared.init_command import InitCommand

app = create_app()

app.cli.add_command(InitCommand)
app.cli.add_command(FakeCommand)
app.cli.add_command(RockCommand)
app.cli.add_command(ProjectCommand)
