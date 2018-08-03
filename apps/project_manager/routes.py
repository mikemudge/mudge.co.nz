from flask import Blueprint
from flask import current_app

from .models import Project
from .serialize import ProjectSchema
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
    staticFilesUrl = current_app.config.get('STATIC_URL')
    # Build a list of projects?
    app = Angular('projects')

    app.scripts = [
        '%sprojects/app.js' % (staticFilesUrl),
        '%sprojects/templates.js' % (staticFilesUrl),

        # Add login and api js.
        '%slogin/app.js' % staticFilesUrl,
        '%slogin/templates.js' % staticFilesUrl,
        '%sjs/api.js' % staticFilesUrl,
        '%sjs/api-templates.js' % staticFilesUrl,
    ]
    app.styles = [
        '%slogin/app.css' % staticFilesUrl,
        '%sprojects/app.css' % (staticFilesUrl),
    ]

    return app.render()

@projects_bp.route('/<name>/<path:path>')
def get_project(name, path=None):
    staticFilesUrl = current_app.config.get('STATIC_URL')

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
        '%slogin/app.css' % staticFilesUrl,
        '%s%s/app.css' % (staticFilesUrl, name),
    ]
    app.scripts = [
        # Include pieces from the app.
        '%s%s/app.js' % (staticFilesUrl, name),
        '%s%s/templates.js' % (staticFilesUrl, name),
    ]

    # TODO should look at dependencies and add all scripts for those too?
    app.scripts += [
        # Login + login templates.
        '%slogin/app.js' % staticFilesUrl,
        '%slogin/templates.js' % staticFilesUrl,
        '%sjs/api.js' % staticFilesUrl,
        '%sjs/api-templates.js' % staticFilesUrl,
    ]

    # Handle project
    for f in project.css_files:
        app.styles.append(f.name)
    for f in project.js_files:
        app.scripts.append(f.name)

    if name in ['8i']:
        app.require = 'websites/8i/8i'
        app.scripts += [
            '/static/js/three.js/84/three.min.js',
            '/static/js/three.js/OBJLoader.js',
            '/static/js/eighti/eighti.min.js',
        ]
        app.async = [
            # TODO load the lib
            '/static/js/eighti/eighti.lib.js',
        ]

    return app.render()

def routes(app):
    app.register_blueprint(projects_bp, url_prefix='/projects')

    # Add crud API for project.
    crud(app, 'project/project', ProjectView)
