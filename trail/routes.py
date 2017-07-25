from auth.provider import oauth
from flask import request

from trail.models import Trail, TrailProgress, TrailProfile
from trail.serialize import TrailSchema, TrailProfileSchema, TrailProgressSchema
from shared.database import db
from shared.exceptions import BadRequestException
from shared.views.crud import DBModelView

class TrailProfileView(DBModelView):
    model = TrailProfile
    schema = TrailProfileSchema

    @oauth.require_oauth('trail')
    def get(self, pk=None):
        return super(TrailProfileView, self).get(pk)

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
            return self.create()
        else:
            profile = TrailProfile.query.get(pk)
            return self.edit(profile)

    @oauth.require_oauth('trail')
    def delete(self, pk=None):
        return self.remove(pk)

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

    def create(self):
        self.data = request.json
        if 'trail_id' not in self.data:
            raise BadRequestException('No trail_id or trail_profile specified')

        trail = Trail.query.get(self.data.pop('trail_id'))
        current_trail_profile = request.oauth.user.trail_profiles.filter_by(trail_id=trail.id).first()

        if not current_trail_profile:
            raise BadRequestException('No trail_profile available')

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

# Load Trail, read only for now.
class TrailView(DBModelView):
    model = Trail
    schema = TrailSchema

    @oauth.require_oauth('trail')
    def get(self, pk=None):
        return super(TrailView, self).get(pk)

def routes(app):
    app.add_url_rule('/api/trail/v1/trail', view_func=TrailView.as_view('trail-list'))
    app.add_url_rule('/api/trail/v1/trail/<pk>', view_func=TrailView.as_view('trail'))
    app.add_url_rule('/api/trail/v1/profile', view_func=TrailProfileView.as_view('trail-profile-list'))
    app.add_url_rule('/api/trail/v1/profile/<pk>', view_func=TrailProfileView.as_view('trail-profile'))

    # Add progress to a trail.
    app.add_url_rule('/api/trail/v1/progress', view_func=TrailProgressView.as_view('trail-progress-list'))
    app.add_url_rule('/api/trail/v1/progress/<pk>', view_func=TrailProgressView.as_view('trail-progress'))
