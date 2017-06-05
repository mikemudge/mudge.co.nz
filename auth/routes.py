from .models import User
from .serialize import UserSchema
from .views.auth import auth_bp
from .views.auth import AuthenticationTokenView, AuthenticationConnectorView
from auth.provider import oauth
from shared.views.crud import DBModelView, crud

class UserView(DBModelView):
    model = User
    schema = UserSchema

    @oauth.require_oauth('read_user')
    def get(self, pk):
        return super(UserView, self).get(pk)

    @oauth.require_oauth('scope1')
    def post(self, pk):
        return super(UserView, self).post(pk)

def routes(app):
    app.register_blueprint(auth_bp)

    app.add_url_rule('/auth/token', view_func=AuthenticationTokenView.as_view('token'))
    app.add_url_rule('/auth/connector-token', view_func=AuthenticationConnectorView.as_view('connector-token'))

    # Auth these though?
    crud(app, 'user', UserView)
