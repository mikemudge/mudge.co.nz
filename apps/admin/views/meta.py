from auth.provider import oauth
from flask.views import MethodView
from flask import jsonify
from marshmallow import fields as f
from marshmallow import Schema
from sqlalchemy import inspect

class FieldSchema(Schema):
    name = f.Str(required=True)
    model = f.Str()
    list = f.Boolean()
    type = f.Str()
    link = f.Boolean()

class EndpointsSchema(Schema):
    crud = f.Str()

class MetaSchema(Schema):
    name = f.Str()
    fields = f.Nested(FieldSchema, many=True)
    # TODO should just make this a set of names?
    list_fields = f.Nested(FieldSchema, many=True)
    # TODO should just make this a set of names?
    edit_fields = f.Nested(FieldSchema, many=True)
    endpoints = f.Nested(EndpointsSchema)

class MetaView(MethodView):
    results = {}

    @classmethod
    def for_models(cls, name, models):
        MetaView.results[name.lower()] = [
            cls.makeMeta(m) for m in models
        ]

        return cls.as_view('%s_admin_models' % name)

    @oauth.require_oauth('admin')
    def get(self, projectName):
        # TODO should only create the meta data once?
        results = self.results[projectName.lower()]
        schema = MetaSchema(many=True)
        return jsonify(data=schema.dump(results))

    @classmethod
    def makeMeta(cls, model):
        model_name = model.__name__
        mapper = inspect(model)

        # Change fields structure?
        fields = []

        for c in mapper.column_attrs:
            column = model.__table__.columns[c.key]
            type = 'text'
            if column.foreign_keys:
                # Skip foreign keys.
                continue
            if str(column.type) == 'DATETIME':
                type = 'datetime-local'
            fields.append({
                'name': column.name,
                'type': type
            })

        for column in mapper.relationships:
            fields.append({
                'name': column.key,
                'list': column.uselist,
                'type': 'select',
                'model': column.mapper.class_.__name__,
            })

        list_skip = ['id', 'date_created', 'date_updated']
        list_fields = [x for x in fields if x.get('name') not in list_skip]
        edit_fields = [x for x in fields if x.get('name') not in list_skip]
        return {
            'name': model_name,
            'fields': fields,
            'list_fields': list_fields,
            'edit_fields': edit_fields,
            'endpoints': {
                'crud': '/api/admin/model/' + model_name.lower() + '/:id'
            }
        }
