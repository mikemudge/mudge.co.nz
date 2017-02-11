import json

from ..models import User
from ..serialize import UserSchema
from ..utils import googleAuth
from flask import request, jsonify
from flask import Blueprint
from functools import wraps
from shared.database import db
from shared.exceptions import ValidationException, AuthenticationException

auth_bp = Blueprint('auth_api', __name__, url_prefix='/api')


def require_client(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        # Get client_id and secret.
        if request.client_id is not None:
            return request.client_id, request.client_secret

@auth_bp.route('/register', methods=['POST'])
def register():
    data = request.json

    email = data['email']
    existing_user = User.query.filter_by(email=email).first()
    if existing_user:
        # TODO could just signin if password matches?
        raise Exception('Already exists')

    # Else create the user.
    user = User.create(
        email,
        data['firstname'],
        data['lastname'],
        data['password'])

    return jsonify({
        'email': user.email
    })

# Authenticate using a social connection.
@auth_bp.route('/connect-token', methods=['POST'])
def connectViaSocial():
    data = request.json

    if data['type'] == 'google':
        user = googleConnection(data.get('id_token'))
    else:
        raise NotImplemented('Social connect with type: ' + data.get('type'))

    userSchema = UserSchema()
    result, errors = userSchema.dump(user)
    if errors:
        raise ValidationException(errors)
    return jsonify(data=result)

def googleConnection(token):
    if not token:
        raise ValidationException(['No id_token'])
    sub, data = googleAuth(token)

    print data
    email = data['email']
    user = User.query.filter_by(email=email).first()

    if not user:
        user = User.create(
            email,
            data.get('firstname'),
            data.get('lastname'))
        user.is_active = True
        db.session.add(user)

    user.profile.image = data.get('picture')

    db.session.commit()
    return user

@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.json
    if not data:
        raise ValidationException('bad email or password')

    # Log in with user/password
    email = data['email']
    user = User.query.filter_by(email=email).first()

    if user and user.password_match(data.get('password')):
        userSchema = UserSchema()
        result, errors = userSchema.dump(user)
        if errors:
            raise ValidationException(errors)
        return jsonify(data=result)
    else:
        raise AuthenticationException('bad email or password')

@auth_bp.route('/logout')
def logout():
    db.session.pop('logged_in', None)
    return json.dumps({'result': 'success'})
