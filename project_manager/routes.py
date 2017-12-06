from project_manager.models import Project
from project_manager.serialize import ProjectSchema
from shared.views.crud import DBModelView, crud

class ProjectView(DBModelView):
    model = Project
    schema = ProjectSchema

    def get(self, pk=None):
        return super(ProjectView, self).get(pk)

def routes(app):
    crud(app, 'project/project', ProjectView)
