import random

from auth.provider import oauth
from flask import request

from trail.models import TrailProfile
from trail.serialize import TrailProfileSchema
from trail.serialize import ListTrailProfileSchema
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
            results = TrailProfile.query.filter_by(user_id=request.oauth.user.id).all()
            return schema.response(results)

    @oauth.require_oauth('trail')
    def post(self, pk=None):
        # Edit or Create.
        if pk is None:
            self.get_data()
            self.data['user_id'] = str(request.oauth.user.id)
            profile = TrailProfile.query.filter_by(
                user_id=self.data['user_id'],
                trail_id=self.data['trail_id']
            ).first()
            if profile:
                raise BadRequestException('Already exists')

            self.data['color'] = random.randint(0, 16777215)
            return self.create()
        else:
            profile = TrailProfile.query.get(pk)
            return self.edit(profile)

    @oauth.require_oauth('trail')
    def delete(self, pk=None):
        return self.remove(pk)
