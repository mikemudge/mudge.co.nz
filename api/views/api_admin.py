from api.models import Biker, Ride, Walk, Walker
from project_manager.models import Project, FileUrl
from shared.admin import admin
from shared.admin import BaseView
from shared.database import db

def admin_routes(app):
    admin.add_view(BaseView(Project, db.session, category="Project"))
    admin.add_view(BaseView(FileUrl, db.session, category="Project"))

    admin.add_view(BaseView(Walker, db.session, category="Old"))
    admin.add_view(BaseView(Walk, db.session, category="Old"))
    admin.add_view(BaseView(Biker, db.session, category="Old"))
    admin.add_view(BaseView(Ride, db.session, category="Old"))
