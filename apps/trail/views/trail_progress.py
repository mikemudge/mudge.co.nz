from auth.provider import oauth
from flask import request

from ..models import TrailProgress, TrailProfile
from ..serialize import TrailProgressSchema
from shared.database import db
from shared.exceptions import BadRequestException
from shared.views.crud import DBModelView

# Add some progress towards a trail.
class TrailProgressView(DBModelView):
    model = TrailProgress
    schema = TrailProgressSchema

    @oauth.require_oauth('trail')
    def get(self, pk=None):
        return super(TrailProgressView, self).get(pk)

    @oauth.require_oauth('trail')
    def post(self, pk=None):
        if pk:
            progress = TrailProgress.query.get(pk)
            return self.edit(progress)
        else:
            return self.create()

    @oauth.require_oauth('trail')
    def delete(self, pk):
        progress = TrailProgress.query.get(pk)
        if progress.trail_profile.user_id != request.oauth.user.id:
            raise BadRequestException('Not the owner of %s' % progress)

        return super(TrailProgressView, self).remove(pk)

    def create(self):
        self.data = request.json
        if 'trail_profile_id' not in self.data:
            raise BadRequestException('No trail_profile_id specified')

        current_trail_profile = TrailProfile.query.get(self.data.pop('trail_profile_id'))

        if not current_trail_profile:
            raise BadRequestException('No trail_profile found')

        schema = TrailProgressSchema(session=db.session)
        instance, errors = schema.load(self.data)
        if errors:
            return self.errorResponse(errors)
        instance.trail_profile = current_trail_profile
        db.session.add(instance)
        db.session.commit()
        return schema.response(instance)

    def edit(self, progress):
        if progress.trail_profile.user_id != request.oauth.user.id:
            raise BadRequestException('Not the owner of %s' % progress)

        return super(TrailProgressView, self).edit(progress)
