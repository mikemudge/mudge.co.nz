import random

from auth.provider import oauth
from auth.models import User
from flask import request, abort

from ..models import TrailProfile
from ..serialize import TrailProfileSchema
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
            query = TrailProfile.query
            data = request.args

            query = self.filter(query, data)

            if data.get('friends'):
                # Make sure the profiles user is friends with this user.
                # Query the backref here because we are looking for TrailProfiles which have a relation back to your user id.
                query = query.join(User) \
                    .join(User.friended_you, aliased=True) \
                    .filter(User.id == request.oauth.user.id)

            # Order by created date.
            query = query.order_by(TrailProfile.date_created.desc())
            results = query.all()
            # TODO using non List schema so each will load its progress
            exclude = []
            if not data.get('progress'):
                # Exclude progress if its not asked for.
                # TODO should be able to use this to do query joins etc?
                exclude.append('progress')

            schema = TrailProfileSchema(many=True, exclude=exclude)
            return schema.response(results)

    def filter(self, query, data):
        if data.get('user_id'):
            query = query.filter_by(user_id=data.get('user_id'))
        if data.get('trail_id'):
            query = query.filter_by(trail_id=data.get('trail_id'))
        return query

    @oauth.require_oauth('trail')
    def post(self, pk=None):
        # Edit or Create.
        if pk is None:
            # Just make a new profile for this trail?
            self.get_data()
            self.data['user_id'] = str(request.oauth.user.id)
            if not self.data.get('color'):
                # TODO should we error if color isn't set?
                self.data['color'] = random.randint(0, 16777215)
            return self.create()
        else:
            profile = TrailProfile.query.get(pk)
            return self.edit(profile)

    @oauth.require_oauth('trail')
    def delete(self, pk=None):
        instance = TrailProfile.query.get(pk)
        if not instance:
            abort(404, 'TrailProfile not found')
        if instance.user_id != request.oauth.user.id:
            raise BadRequestException('Not the owner of %s' % instance)
        return self.remove(pk)
