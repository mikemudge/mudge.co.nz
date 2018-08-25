from apps.tournament_app.models import Tournament, Team, Match, Round
from auth.provider import oauth
from flask.views import MethodView
from marshmallow import fields as f
from shared.marshmallow import BaseSchema
from shared.views.crud import DBModelView
from sqlalchemy import inspect

class FieldSchema(BaseSchema):
    name = f.Str(required=True)
    model = f.Str()
    list = f.Boolean()
    type = f.Str()
    link = f.Boolean()

class EndpointsSchema(BaseSchema):
    crud = f.Str()

class MetaSchema(BaseSchema):
    name = f.Str()
    fields = f.Nested(FieldSchema, many=True)
    endpoints = f.Nested(EndpointsSchema)

class MetaView(MethodView):

    @oauth.require_oauth('admin')
    def get(self, projectName=None):
        # TODO should only create the meta data once?
        results = [
            self.makeMeta(Tournament),
            self.makeMeta(Team),
            self.makeMeta(Round),
            self.makeMeta(Match),
        ]
        # {
        #     'name': 'Team',
        #     'fields': [{
        #         'name': 'name'
        #     }],
        #     'endpoints': {
        #         'crud': '/api/tournament/team/:id'
        #     }
        # }, {
        #     'name': 'Round',
        #     'fields': [{
        #         'name': 'name'
        #     }, {
        #         'name': 'matches',
        #         'list': True,
        #         'model': 'Match'
        #     }],
        #     'endpoints': {
        #         'crud': '/api/tournament/round/:id'
        #     }
        # }, {
        #     'name': 'Match',
        #     #     name_field: function(item) {
        #     #         return item.homeTeam.name + ' v ' + item.awayTeam.name;
        #     #     },
        #     'fields': [{
        #         'name': 'homeTeam',
        #         'type': 'select',
        #         'model': 'Team',
        #     }, {
        #         # //   name: 'result',
        #         # //   type: 'nested',
        #         # //   model: 'MatchResult',
        #         # // }, {
        #         'name': 'awayTeam',
        #         'type': 'select',
        #         'model': 'Team',
        #     }],
        #     'endpoints': {
        #         'crud': '/api/tournament/match/:id'
        #     }
        # }, {
        #     name: 'MatchResult',
        #     name_field: function(item) {
        #       return item.homeScore + ' - ' + item.awayScore;
        #     },
        #     fields: [{
        #       name: 'homeScore',
        #       type: 'number',
        #     }, {
        #       name: 'match',
        #       type: 'select',
        #       model: 'Match',
        #     }, {
        #       name: 'awayScore',
        #       type: 'number',
        #     }],
        #     'endpoints': {
        #       'crud': '/api/tournament/matchresult/:id'
        #     }
        # }]

        schema = MetaSchema(many=True)
        return schema.response(results)

    def makeMeta(self, model):
        model_name = model.__name__
        mapper = inspect(model)

        # Change fields structure?
        fields = []

# TODO skip over id's?
# Team.tournament_id
        for c in mapper.column_attrs:
            print(c.key)
            column = model.__table__.columns[c.key]
            print(column.primary_key)
            type = 'text'
            print (column.type)
            if str(column.type) == 'DATETIME':
                type = 'date'
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

        return {
            'name': model_name,
            'fields': fields,
            'endpoints': {
                'crud': '/api/admin/model/' + model_name.lower() + '/:id'
            }
        }
def routes(app):
    # TODO Enable these with admin scope for full access?

    # Make the endpoint and return it.
    adminCrud(app, Tournament)
    adminCrud(app, Team)
    adminCrud(app, Match)
    adminCrud(app, Round)

    app.add_url_rule(
        '/api/admin/Tournament',
        view_func=MetaView.as_view('admin_models'),
        methods=['GET'])

def adminCrud(app, cls):
    modelName = str(cls.__name__).lower()
    print('Creating admin crud routes for %s' % modelName)

    class Schema(BaseSchema):
        class Meta:
            model = cls

    class View(DBModelView):
        model = cls
        schema = Schema

        @oauth.require_oauth('admin')
        def get(self, **kwargs):
            return super(View, self).get(**kwargs)

        @oauth.require_oauth('admin')
        def post(self, **kwargs):
            return super(View, self).post(**kwargs)

    view = View.as_view("%s_crud" % modelName)

    # Get all and create new end points.
    app.add_url_rule(
        '/api/admin/model/%s' % modelName,
        defaults={'pk': None},
        view_func=view,
        methods=['GET', 'POST'])

    # All the pk specific endpoints
    app.add_url_rule(
        '/api/admin/model/%s/:id' % modelName,
        defaults={'pk': None},
        view_func=view,
        methods=['GET', 'PUT', 'POST', 'DELETE'])
