import bcrypt
import datetime
import json
import models

from flask import Blueprint, Response
from flask import abort, make_response, request, session
from models import db, simpleSerialize
from sqlalchemy.exc import IntegrityError

api_bp = Blueprint('api', __name__)

@api_bp.route('/register', methods=['POST'])
def register():
    data = request.json

    # Use a random salt which is saved along side the hash.
    hashed = bcrypt.hashpw(data['password'].encode('utf-8'), bcrypt.gensalt())

    user = models.User(
        username=data['username'],
        hash=hashed
    )
    try:
        db.session.add(user)
        db.session.commit()
        db.session.close()
        return login()
    except IntegrityError:
        db.session.close()
        return json.dumps({
            'result': False,
            'error': 'User is already registered',
        })

@api_bp.route('/login', methods=['POST'])
def login():
    data = request.json
    if not data:
        # TODO bad request.
        return json.dumps({
            'result': False
        })

    # Login with token.
    if data.get('auth'):
        auth = models.UserAuth.query.filter_by(user_id=data['auth']['user_id'], auth_token=data['auth']['auth_token']).first()
        if datetime.datetime.now() > auth.expires:
            # Expired.
            return json.dumps({
                'result': False,
                'error': 'token expired'
            })

        return json.dumps({
            'result': True,
            'auth': {
                'user_id': auth.user_id,
                'auth_token': auth.auth_token
            },
            'user': {
                'username': auth.user.username,
                'name': auth.user.name,
                'fullname': auth.user.fullname,
                'id': auth.user.id,
            }
        })

    # Log in with user/password
    user = models.User.query.filter_by(username=data['username']).first()
    if user and bcrypt.hashpw(data['password'].encode('utf-8'), user.hash.encode('utf-8')) == user.hash:
        session['logged_in'] = user.id
        auth = models.UserAuth(
            user=user,
            auth_token=bcrypt.gensalt(),
            expires=datetime.datetime.now() + datetime.timedelta(days=1)
        )
        print auth.expires
        db.session.add(auth)
        db.session.commit()
        return json.dumps({
            'result': True,
            'auth': {
                'user_id': auth.user_id,
                'auth_token': auth.auth_token
            },
            'user': {
                'username': user.username,
                'name': user.name,
                'fullname': user.fullname,
                'id': user.id,
            }
        })
    else:
        return json.dumps({
            'result': False
        })

@api_bp.route('/logout')
def logout():
    db.session.pop('logged_in', None)
    return json.dumps({'result': 'success'})

@api_bp.route('/user', methods=['POST', 'GET'])
def user_api():
    return rest_response(models.User)

@api_bp.route('/friends', methods=['POST', 'GET'])
def friend_api():
    return rest_response(models.Friendship)

@api_bp.route('/address', methods=['POST', 'GET'])
def address_api():
    return rest_response(models.Address)

def rest_response(cls):
    id = request.args.get('id', request.form.get('id'))
    extras = request.args.get('extras', request.form.get('extras'))

    if request.method == "POST":
        if not request.data:
            return make_response(json.dumps({'error': "You need to post some data"}), 400)
        newdata = json.loads(request.data)
        # id should be in the json blob if its a post?
        if newdata.get('id'):
            result = db.session.query(cls).get(newdata['id'])
        else:
            result = cls()
            db.session.add(result)

        for key, value in newdata.iteritems():
            setattr(result, key, value)

        db.session.commit()
        db.session.refresh(result)

        response = simpleSerialize(result)
    elif id:
        result = db.session.query(cls).get(id)
        if not result:
            abort(404)
        response = simpleSerialize(result)
        if extras:
            response[extras] = [simpleSerialize(v) for v in getattr(result, extras)]
    else:
        print cls
        result = db.session.query(cls).all()
        print result
        response = []
        for v in result:
            result2 = simpleSerialize(v)
            if extras:
                result2[extras] = [simpleSerialize(v2) for v2 in getattr(v, extras)]
            response.append(result2)
        print response

    # TODO only indent for debug?
    jsonStr = json.dumps(response, sort_keys=True, indent=2)
    return Response(jsonStr, mimetype='application/json')
