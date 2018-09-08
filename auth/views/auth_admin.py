from auth.models import Client, Profile, Scope, User
from shared.admin import get_admin
from shared.admin import BaseView
from shared.database import db

from wtforms.fields import StringField, TextField

from wtforms import validators
from wtforms import Form


class NewUser(Form):
    email = TextField(u'Email', validators=[validators.required()])

    firstname = StringField(u'First Name', validators=[validators.required()])
    lastname = StringField(u'Last Name', validators=[validators.required()])

class UserView(BaseView):
    column_exclude_list = ['password_hash']
    form_excluded_columns = ['date_created', 'password_hash', 'friended_you']
    form_columns = ['email', 'is_active', 'admin']

    column_formatters = dict(BaseView.column_formatters, **{
        'last_login': BaseView.format_datetime,
        'profile': BaseView._to_view_url('profile')
    })

    def get_create_form(self):
        return NewUser

    def create_model(self, form):
        email = form.email.data
        user = User.create(email)
        user.is_active = True
        user.profile.firstname = form.firstname.data
        user.profile.lastname = form.lastname.data
        db.session.commit()
        return user

class ScopeView(BaseView):
    column_exclude_list = ['date_created', 'date_updated']
    form_excluded_columns = ['date_created', 'date_updated']
    column_formatters = dict(BaseView.column_formatters, **{
        'name': BaseView.view_this,
    })
    column_formatters_detail = BaseView.column_formatters
    pass

class ClientAdminView(BaseView):
    form_excluded_columns = ['date_created', 'client_id', 'client_secret']

class ProfileView(BaseView):
    column_formatters = dict(BaseView.column_formatters, **{
        'image': BaseView.format_image,
    })

def admin_routes(app):
    admin = get_admin(app)
    admin.add_view(ClientAdminView(Client, db.session, category="Auth"))
    admin.add_view(ProfileView(Profile, db.session, category="Auth"))
    admin.add_view(ScopeView(Scope, db.session, category="Auth"))
    admin.add_view(UserView(User, db.session, category="Auth"))
