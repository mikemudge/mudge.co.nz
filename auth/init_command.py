from flask_script import Manager
from shared.database import db
from auth.models import User

InitAuthCommand = Manager(usage='Perform initialization tasks for auth.')

@InitAuthCommand.command
def create_user(email, password=None):

    user = User.query.filter_by(email=email).first()

    if not user:
        print "Create new user"
        user = User.create(email=email, password=password)
        db.session.add(user)
    else:
        print "Already exists, will update password"

    user.set_password(password)

    # Make sure the user is usable.
    user.is_active = True

    db.session.commit()
