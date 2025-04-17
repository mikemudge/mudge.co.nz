import json

from apps.tournament_app.models import Tournament, Team, Match, Round
from auth.provider import oauth
from marshmallow import fields as f
from shared.marshmallow import BaseSchema, IdSchema
from shared.views.crud import DBModelView
from sqlalchemy import inspect

from apps.admin.views.meta import MetaView


def make_json_schema(dir, schemas):
    models = []
    for schema_file in schemas:
        with open("%s/%s" % (dir, schema_file)) as fp:
            schema = json.load(fp)
            model = {
                'name': schema['title'],
                'endpoints': {
                    'crud': '/api/admin/model/%s/:id' % schema['title'].lower()
                }
            }

            fields = []
            for name, prop in schema['properties'].items():
                field = {
                    'name': name,
                    # 'type': 'readonly'
                }
                if 'items' in prop:
                    field['list'] = True
                    # Should this be array, which must be true for items to be valid?
                    if '$ref' in prop['items']:
                        field['model'] = prop['items']['$ref']
                        field['type'] = prop['items']['$ref']
                    else:
                        field['type'] = prop['type']
                else:
                    # A non list model?
                    if '$ref' in prop:
                        field['model'] = prop['$ref']
                        field['type'] = prop['$ref']
                    else:
                        field['type'] = prop['type']
                    field['list'] = False
                fields.append(field)

            model['fields'] = fields
            model['list_fields'] = fields
            model['edit_fields'] = fields
            models.append(model)

    return models

def routes(app):
    # Make the endpoint and return it.
    adminCrud(app, Tournament)
    adminCrud(app, Team)
    adminCrud(app, Match)
    adminCrud(app, Round)

    view = MetaView.for_models('tournament', [
        Tournament,
        Team,
        Match,
        Round
    ])

    tournament_schema = make_json_schema("apps/tournament_app/schema", [
        'tournament.schema.json',
        'round.schema.json',
        'match.schema.json',
        'team.schema.json'
    ])

    # TODO support some "view" relationships like match.round.tournament?
    # print(tournament_schema)
    MetaView.results['tournament json schema'] = tournament_schema

    app.add_url_rule(
        '/api/admin/project/<projectName>',
        view_func=view,
        methods=['GET'])

def adminCrud(app, cls):
    modelName = str(cls.__name__).lower()
    print('Creating admin crud routes for %s' % modelName)

    class Schema(BaseSchema):
        class Meta:
            model = cls

        def __init__(self, **kwargs):
            super().__init__(**kwargs)

            for c in inspect(cls).relationships:
                self.declared_fields.update({
                    c.key: f.Nested(IdSchema, many=c.uselist)
                })

    class View(DBModelView):
        model = cls
        schema = Schema

        @oauth.require_oauth('admin')
        def get(self, pk=None):
            # Get single or multiple.
            if pk is None:
                return self.get_multiple()
            else:
                return self.get_one(pk)

        @oauth.require_oauth('admin')
        def post(self, pk):
            if pk is None:
                return self.create()
            else:
                instance = cls.query.get(pk)
                return self.edit(instance)

        @oauth.require_oauth('admin')
        def delete(self, pk):
            return super(View, self).remove(pk)

    view = View.as_view("%s_crud" % modelName)

    # Get all and create new end points.
    app.add_url_rule(
        '/api/admin/model/%s' % modelName,
        defaults={'pk': None},
        view_func=view,
        methods=['GET', 'POST'])

    # All the pk specific endpoints
    app.add_url_rule(
        '/api/admin/model/%s/<pk>' % modelName,
        view_func=view,
        methods=['GET', 'PUT', 'POST', 'DELETE'])
