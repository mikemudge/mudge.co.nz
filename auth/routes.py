from .views.auth import auth_bp
from .models import User
from .serialize import UserSchema
from shared.views.crud import DBModelView, crud

class UserView(DBModelView):
    model = User
    schema = UserSchema

def routes(app):
    app.register_blueprint(auth_bp)

    # Auth these though?
    crud(app, 'user', UserView)
