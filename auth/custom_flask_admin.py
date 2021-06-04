from flask import url_for, redirect, request, jsonify
from flask import current_app as app
from flask_admin import AdminIndexView
from flask_admin import helpers, expose

from flask_login import login_user, logout_user, current_user
from auth.utils import googleAuth
from auth.login_manager import login_manager
from auth.models import User

from shared.exceptions import AuthenticationException

from wtforms import form, fields, validators

# Define login and registration forms (for flask-login)
class LoginForm(form.Form):
    login = fields.StringField(validators=[validators.DataRequired()])
    password = fields.PasswordField(validators=[validators.DataRequired()])

    def validate_login(self, field):
        user = self.get_user()

        if user is None:
            raise validators.ValidationError('Invalid user')

        # we're comparing the plaintext pw with the the hash from the db
        if not user.check_password(self.password.data):
            raise validators.ValidationError('Invalid password')

    def get_user(self):
        return login_manager.get_user()

def get_ip_from_request(req):
    if 'X-Forwarded-For' in req.headers:
        remote_addr = req.headers.getlist("X-Forwarded-For")[0].rpartition(' ')[-1]
    else:
        remote_addr = req.remote_addr or 'untrackable'

    return remote_addr


def check_flask_admin_ip_access_restriction(req):
    _ip_restriction = app.config.get("RESTRICT_FLASK_ADMIN")
    _ip_address = get_ip_from_request(req)

    if _ip_restriction:
        if _ip_address in _ip_restriction:
            return True

        print(_ip_address)
        raise AuthenticationException('IP_RESTRICTED ' + _ip_address)

    return True


class CustomAdminIndexView(AdminIndexView):

    @expose('/')
    def index(self):
        if not current_user.is_authenticated:
            return redirect(url_for('admin.login_view'))
        return super(CustomAdminIndexView, self).index()

    @expose('/login/', methods=('GET', 'POST'))
    def login_view(self):

        check_flask_admin_ip_access_restriction(request)

        # handle user login
        form = LoginForm(request.form)

        if helpers.validate_form_on_submit(form):

            user = form.get_user()
            login_user(user)

        if current_user.is_authenticated:
            return redirect(url_for('admin.index'))

        self._template_args['form'] = form

        return super(CustomAdminIndexView, self).index()

    @expose('/login/social', methods=('POST',))
    def login_social_view(self):
        data = request.json
        if not data.get("access_token", None):
            raise AuthenticationException('USER_AUTH_ERROR')

        googleData = googleAuth(data.get('access_token'))

        user = User.query.filter_by(email=googleData['email']).first()

        emails = [
            'mike.mudge@gmail.com',
            'mike.mudge.test@gmail.com',
        ]
        if not user or user.email not in emails:
            raise AuthenticationException('INSUFFICIENT_ACCESS')

        # If a user isn't active this will not work.
        login_user(user)

        if current_user.is_authenticated:
            return jsonify({
                'data': {
                    'success': True,
                    'redirect': url_for('admin.index')
                }
            })

        raise AuthenticationException('UNKNOWN_USER_AUTH_ERROR')

    @expose('/logout/')
    def logout_view(self):
        logout_user()

        return redirect(url_for('admin.index'))
