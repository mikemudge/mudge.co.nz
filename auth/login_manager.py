from flask_login import LoginManager
from auth.models import User

login_manager = LoginManager()

@login_manager.user_loader
def load_user(user_id):
    if type(user_id) is not str:
        user_id = user_id.decode('utf-8')

    user = User.query.get(user_id)
    emails = [
        'mike.mudge@gmail.com',
        'mike.mudge.test@gmail.com'
    ]

    if user and user.email in emails:
        return user
    return None

def get_user(user_id):
    return load_user(user_id)
