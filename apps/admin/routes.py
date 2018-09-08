from apps.tournament_app.models import Tournament, Team, Match, Round
from auth.provider import oauth
from marshmallow import fields as f
from shared.marshmallow import BaseSchema, IdSchema
from shared.views.crud import DBModelView
from sqlalchemy import inspect

from apps.admin.views.meta import MetaView

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
