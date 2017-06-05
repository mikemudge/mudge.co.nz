from auth.provider import oauth

from tournament_app.models import Tournament, Team, Match, Round

from shared.marshmallow import BaseSchema
from shared.views.crud import DBModelView

def routes(app):
    # TODO should build a model with extra meta data here.
    # Then we could offer the meta data to the client admin.
    adminCrud(app, Tournament)
    adminCrud(app, Team)
    adminCrud(app, Match)
    adminCrud(app, Round)

def adminCrud(app, cls):
    modelName = str(cls.__name__).lower()
    print 'Creating insecure crud routes for %s' % modelName

    class Schema(BaseSchema):
        class Meta:
            model = cls

    class View(DBModelView):
        model = cls
        schema = Schema

        # @oauth.require_oauth('???')
        # def get(self, **kwargs):
        #     return super(View, self).get(**kwargs)

    view = View.as_view("%s_crud" % modelName)

    # Get all and create new end points.
    app.add_url_rule(
        '/admin/api/%s' % modelName,
        defaults={'pk': None},
        view_func=view,
        methods=['GET', 'POST'])

    # All the pk specific endpoints
    app.add_url_rule(
        '/admin/api/%s' % modelName,
        defaults={'pk': None},
        view_func=view,
        methods=['GET', 'PUT', 'POST', 'DELETE'])
