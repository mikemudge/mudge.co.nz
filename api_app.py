import json
import models

from flask import Blueprint, Response
from flask import abort, make_response, request
from models import db, simpleSerialize

api_bp = Blueprint('api', __name__)

@api_bp.route('/walker', methods=['POST', 'GET'])
def walker_api():
    return rest_response(models.Walker, extras=['walks'])

@api_bp.route('/walk', methods=['POST', 'GET', 'DELETE'])
def walk_api():
    return rest_response(models.Walk)

@api_bp.route('/biker', methods=['POST', 'GET'])
def biker_api():
    return rest_response(models.Biker, extras=['rides'])

@api_bp.route('/ride', methods=['POST', 'GET', 'DELETE'])
def ride_api():
    return rest_response(models.Ride)

def rest_response(cls, extras=[]):
    id = request.args.get('id', request.form.get('id'))
    extras2 = request.args.get('extras', request.form.get('extras'))
    if extras2:
        extras += extras2

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
        for extra in extras:
            response[extra] = [simpleSerialize(v) for v in getattr(result, extra)]
    elif request.method == "DELETE":
        result = None
        if not id:
            raise Exception('No id specified, not sure what to delete')

        result = db.session.query(cls).get(id)
        if not result:
            abort(404)

        response = simpleSerialize(result)
        for extra in extras:
            response[extra] = [simpleSerialize(v) for v in getattr(result, extra)]
        db.session.delete(result)
        db.session.commit()
    elif id:
        result = db.session.query(cls).get(id)
        if not result:
            abort(404)
        response = simpleSerialize(result)
        for extra in extras:
            response[extra] = [simpleSerialize(v) for v in getattr(result, extra)]
    else:
        result = db.session.query(cls).all()
        response = []
        for v in result:
            result2 = simpleSerialize(v)
            for extra in extras:
                result2[extra] = [simpleSerialize(v2) for v2 in getattr(v, extra)]
            response.append(result2)

    # TODO only indent for debug?
    jsonStr = json.dumps(response, sort_keys=True, indent=2)
    return Response(jsonStr, mimetype='application/json')
