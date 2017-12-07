from flask import Blueprint

from project_manager.models import Project
from project_manager.serialize import ProjectSchema
from shared.views.crud import DBModelView, crud

class ProjectView(DBModelView):
    model = Project
    schema = ProjectSchema

    def get(self, pk=None):
        return super(ProjectView, self).get(pk)


projects_bp = Blueprint('project_manager', __name__)

@projects_bp.route('/')
def get_projects():
    # Build a list of projects?
    return ProjectSchema(many=True).response(Project.query.all())

@projects_bp.route('/<name>')
def get_project(name):
    # Build a list of projects?
    result = Project.query.filter_by(name=name).first()

    return ProjectSchema().response(result)

def routes(app):
    app.register_blueprint(projects_bp, url_prefix='/projects')

    # Add crud API for project.
    crud(app, 'project/project', ProjectView)
