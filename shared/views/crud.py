from shared.database import db
from flask import jsonify, request
from flask.views import MethodView

class DBModelView(MethodView):
    model = None

    def get(self, pk):
        # Get single or multiple.
        if pk is None:
            # return a list of users
            results = self.model.query.all()
            # Use serializer on result.
            result, errors = self.schema(many=True).dump(results)
            if errors:
                return self.errorResponse(errors)
            return jsonify(data=result)
        else:
            instance = self.model.query.get(pk)
            # Use serializer on result.
            result, errors = self.schema().dump(instance)
            if errors:
                return self.errorResponse(errors)
            return jsonify(data=result)

    def post(self):
        # I don't know why but it doesn't seem to know about the session?
        # This was failing during tests, not sure about real requests.
        s = self.schema(session=db.session)
        if not request.json:
            return self.errorResponse(['No request.json'])

        # s.make_instance?
        instance, errors = s.load(request.json)
        if errors:
            return self.errorResponse(errors)
        db.session.add(instance)
        db.session.commit()
        result, errors = s.dump(instance)
        return jsonify(data=result)

    def errorResponse(self, errors):
        # TODO structure this
        response = jsonify(error={
            'errors': errors
        })
        response.status_code = 400
        return response

    def delete(self, pk):
        # delete
        result = self.model.query.filter_by(id=pk).delete()
        if result != 1:
            raise Exception('Bad delete: ' + result)

        db.session.commit()
        return jsonify({
            'success': True
        })

    def put(self, pk):
        # update

        # node_schema.load(json_data, instance=Node().quey.get(node_id))
        # And if you want to load without all required fields of Model, you can add the "partial=True", like this:
        # node_schema.load(json_data, instance=Node().query.get(node_id), partial=True)

        pass

# This feels complicated and kind of gross.
# But it will register a CRUD set of urls to a single view.
def crud(app, path, viewCls):
    view = viewCls.as_view(path + '_crud')
    app.add_url_rule(
        '/api/%s' % path,
        defaults={'pk': None},
        view_func=view,
        methods=['GET'])
    app.add_url_rule(
        '/api/%s' % path,
        view_func=view,
        methods=['POST'])
    app.add_url_rule(
        '/api/%s/<pk>' % path,
        view_func=view,
        methods=['GET', 'PUT', 'DELETE'])
