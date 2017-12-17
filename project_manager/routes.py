from flask import Blueprint
from flask import current_app

from project_manager.models import Project
from project_manager.serialize import ProjectSchema
from shared.helpers.angular import Angular
from shared.views.crud import DBModelView, crud
from sqlalchemy import func

class ProjectView(DBModelView):
    model = Project
    schema = ProjectSchema

    def get(self, pk=None):
        return super(ProjectView, self).get(pk)


projects_bp = Blueprint('project_manager', __name__)

@projects_bp.route('/')
def get_projects():
    brunchServer = current_app.config.get('STATIC_URL')
    # Build a list of projects?
    app = Angular('projects')

    app.scripts = [
        '%sprojects/app.js' % (brunchServer),
        '%sprojects/templates.js' % (brunchServer),

        # Add login and api js.
        '%slogin/app.js' % brunchServer,
        '%slogin/templates.js' % brunchServer,
        '%sjs/api.js' % brunchServer,
        '%sjs/api-templates.js' % brunchServer,
    ]
    app.styles = [
        '%slogin/app.css' % brunchServer,
        '%sprojects/app.css' % (brunchServer),
    ]

    return app.render()

@projects_bp.route('/<name>/')
def get_project(name):
    brunchServer = current_app.config.get('STATIC_URL')

    name = name.lower()
    # Try and find a project for this app?
    project = Project.query.filter(
        func.lower(Project.name) == name
    ).first()

    print(project)

    app = Angular(name)
    app.base = '/projects/%s/' % name

    app.styles = [
        # Login + login templates.
        '%slogin/app.css' % brunchServer,
        '%s%s/app.css' % (brunchServer, name),
    ]
    app.scripts = [
        # Include pieces from the app.
        '%s%s/app.js' % (brunchServer, name),
        '%s%s/templates.js' % (brunchServer, name),
    ]

    # TODO should look at dependencies and add all scripts for those too?
    app.scripts += [
        # Login + login templates.
        '%slogin/app.js' % brunchServer,
        '%slogin/templates.js' % brunchServer,
        '%sjs/api.js' % brunchServer,
        '%sjs/api-templates.js' % brunchServer,
    ]

    # Handle project
    for f in project.css_files:
        app.styles.append(f.name)
    for f in project.js_files:
        app.scripts.append(f.name)

    if name in ['8i']:
        app.require = 'websites/8i/8i'
        app.scripts += [
            '%sjs/eighti/eighti.min.js' % brunchServer,
            '%sjs/eighti/eighti.lib.js' % brunchServer,
        ]

    return app.render()

def routes(app):
    app.register_blueprint(projects_bp, url_prefix='/projects')

    # Add crud API for project.
    crud(app, 'project/project', ProjectView)
