import random

from auth.provider import oauth
from flask import request

from ..models import TrailProfile
from ..serialize import TrailProfileSchema
from ..serialize import ListTrailProfileSchema
from shared.exceptions import BadRequestException
from shared.views.crud import DBModelView

class TrailProfileView(DBModelView):
    model = TrailProfile
    schema = TrailProfileSchema

    @oauth.require_oauth('trail')
    def get(self, pk=None):
        if pk:
            schema = TrailProfileSchema()
            instance = TrailProfile.query.get(pk)
            return schema.response(instance)
        else:
            schema = ListTrailProfileSchema(many=True)
            query = TrailProfile.query
            query = query.filter_by(user_id=request.oauth.user.id)
            # Order by created date.
            query = query.order_by(TrailProfile.date_created.desc())
            results = query.all()
            return schema.response(results)

    @oauth.require_oauth('trail')
    def post(self, pk=None):
        # Edit or Create.
        if pk is None:
            # Just make a new profile for this trail?
            self.get_data()
            self.data['user_id'] = str(request.oauth.user.id)
            self.data['color'] = random.randint(0, 16777215)
            return self.create()
        else:
            profile = TrailProfile.query.get(pk)
            return self.edit(profile)

    @oauth.require_oauth('trail')
    def delete(self, pk=None):
        instance = TrailProfile.query.get(pk)
        if instance.user_id != request.oauth.user.id:
            raise BadRequestException('Not the owner of %s' % progress)
        return self.remove(pk)
