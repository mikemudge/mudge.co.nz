import os

from flask_script import Manager
from shared.database import db
from project_manager.models import Project

ProjectCommand = Manager(usage='Perform initialization tasks for projects.')

@ProjectCommand.command
def import_projects(path):

    for folder in os.listdir(path):
        print folder

        project = Project.query.filter_by(name=folder).first()
        if not project:
            project = Project(
                name=folder
            )
            db.session.add(project)
        else:
            print("%s already exists" % folder)

        for file in os.listdir(os.path.join(path, folder)):
            # Add file to this project?
            pass
            # print file

    db.session.commit()
