import os

from flask_script import Manager
from shared.database import db
from .models import Project, FileUrl

ProjectCommand = Manager(usage='Perform initialization tasks for projects.')

@ProjectCommand.command
def import_projects(path):

    projects = {}

    for folder in os.listdir(path):
        project = Project.query.filter_by(name=folder).first()
        if not project:
            project = Project(
                name=folder
            )
            db.session.add(project)
        else:
            print("%s already exists" % folder)

        projects[project.name] = project

        for file in os.listdir(os.path.join(path, folder)):
            # Add file to this project?
            pass
            # print(file)

    # Import a bunch of vendor libraries here.
    files = [
        "static/js/three.js/84/three.min.js",
        "static/js/three.js/OrbitControls.js",
        "https://cdnjs.cloudflare.com/ajax/libs/jquery/3.2.1/jquery.min.js",

        # CSS too
        "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.css",

        # Material JS + CSS
        "https://cdnjs.cloudflare.com/ajax/libs/materialize/0.100.2/js/materialize.min.js",
        "https://cdnjs.cloudflare.com/ajax/libs/materialize/0.100.2/css/materialize.min.css",
    ]

    # TODO does it make sense to have different files for JS and CSS?
    for path in files:
        FileUrl.get(path)

    if 'rock' in projects:
        projects['rock'].css_files = [
            FileUrl.get('https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.css')
        ]

    # Important that three.js is first.
    # TODO need to be able to set and order on these.
    # TODO should be able to add these to multiple projects.
    projects['racer'].js_files = [
        FileUrl.get("/static/js/three.js/84/three.min.js"),
        FileUrl.get("/static/js/three.js/OrbitControls.js"),
        FileUrl.get("/static/js/three.js/BinaryLoader.js"),
    ]

    db.session.commit()
