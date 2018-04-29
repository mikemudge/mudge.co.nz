from apps.project_manager.models import Project, FileUrl
from shared.admin import admin
from shared.admin import BaseView
from shared.database import db

def admin_routes(app):
    admin.add_view(BaseView(Project, db.session, category="Project"))
    admin.add_view(BaseView(FileUrl, db.session, category="Project"))
