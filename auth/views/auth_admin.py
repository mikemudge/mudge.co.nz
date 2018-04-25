from auth.models import Client, Profile, Scope, User
from shared.admin import admin
from shared.admin import BaseView
from shared.database import db

class UserView(BaseView):
    column_exclude_list = ['password_hash']
    form_excluded_columns = ['date_created', 'password_hash']
    can_create = False

    column_formatters = {
        'date_created': BaseView.format_datetime,
        'profile': BaseView._to_view_url('profile')
    }

class ScopeView(BaseView):
    pass

class ClientView(BaseView):
    form_excluded_columns = ['date_created', 'client_id', 'client_secret']

class ProfileView(BaseView):
    column_formatters = {
        'date_created': BaseView.format_datetime,
        'image': BaseView.format_image,
    }

def admin_routes():
    admin.add_view(ClientView(Client, db.session, category="Auth"))
    admin.add_view(ProfileView(Profile, db.session, category="Auth"))
    admin.add_view(ScopeView(Scope, db.session, category="Auth"))
    admin.add_view(UserView(User, db.session, category="Auth"))
