from shared.database import db
from flask import jsonify, request
from flask.views import MethodView

# Provides a CRUD view for a DB model.
class DBModelView(MethodView):
    model = None
    schema = None

    def __init__(self):
        if not self.model or not self.schema:
            # You should sub class this then set a model and schema.
            # schema should extend marshmallow.BaseSchema
            # model should extend database.BaseModel
            raise Exception('Must specify model and schema')

        self.data = None
        return super(DBModelView, self).__init__()

    def get(self, pk=None):
        # Get single or multiple.
        if pk is None:
            return self.get_multiple()
        else:
            return self.get_one(pk)

    def get_multiple(self):
        # return a list
        # TODO should paginate this by default.
        query = self.model.query
        # TODO support order
        # Per request options as well as default?
        results = query.all()
        listSchema = self.schema(many=True)
        return listSchema.response(results)

    def get_one(self, pk):
        instance = self.model.query.get(pk)
        # Use serializer on result.
        singleSchema = self.schema()
        return singleSchema.response(instance)

    def get_data(self):
        if not request.json:
            return self.errorResponse(['No request.json'])

        if not self.data:
            # Set self.data so it can be accessed by subclasses.
            self.data = request.json

        return self.data

    def create(self):
        # I don't know why but it doesn't seem to know about the session?
        # This was failing during tests, not sure about real requests.
        s = self.schema(session=db.session)
        data = self.get_data()
        instance, errors = s.load(data)
        if errors:
            return self.errorResponse(errors)
        db.session.add(instance)
        db.session.commit()
        result, errors = s.dump(instance)
        return jsonify(data=result)

    def edit(self, instance):
        s = self.schema(session=db.session)
        data = self.get_data()
        instance, errors = s.load(data, instance=instance)
        if errors:
            return self.errorResponse(errors)

        db.session.commit()
        return s.response(instance)

    def errorResponse(self, errors):
        # TODO structure this
        response = jsonify(error={
            'errors': errors
        })
        response.status_code = 400
        return response

    def remove(self, pk):
        # delete
        result = self.model.query.filter_by(id=pk).delete()
        if result != 1:
            raise Exception('Expected to delete 1 item but found ' + str(result))

        db.session.commit()
        return jsonify({
            'success': True
        })

# This feels complicated and kind of gross.
# But it will register a CRUD set of urls to a single view.
def crud(app, path, viewCls):
    view = viewCls.as_view(path + '_crud')
    # List/Create url
    app.add_url_rule(
        '/api/%s' % path,
        view_func=view,
        methods=['GET', 'POST'])
    # Id specific url.
    app.add_url_rule(
        '/api/%s/<pk>' % path,
        view_func=view,
        methods=['GET', 'PUT', 'POST', 'DELETE'])
