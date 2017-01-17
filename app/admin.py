import auth
import config
import json

from app import models
from flask import Blueprint
from app.models import db

# My admin stuff.
admin_bp = Blueprint('myAdmin', __name__)

@admin_bp.route('create_tables')
def create_tables():
    # This isn't going to work well all the time.
    # TODO figure out a better way to seperate data for apps.
    # Yet still allow sharing when it is required
    db.create_all()

@admin_bp.route('user', methods=['GET'])
@auth.ensure_admin
def user_api(adminUser):
    users = models.User.query.all()
    return json_array([u.serializable() for u in users])

def json_array(arg):
    return ")]}',\n" + json.dumps(arg)
