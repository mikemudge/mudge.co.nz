from auth.provider import oauth
from flask.views import MethodView

from ..models import Trail
from ..serialize import TrailSchema

# Load Trail, read only for now.
class TrailView(MethodView):

    @oauth.require_oauth('trail')
    def get(self, pk=None):
        if pk:
            instance = Trail.query.get(pk)
            schema = TrailSchema()
            return schema.response(instance)
        else:
            schema = TrailSchema(many=True)
            query = Trail.query
            # Order by created date.
            query = query.order_by(Trail.date_created.desc())

            results = query.all()
            # TODO coerce activity into a choice???
            # It currently returns as a str???
            return schema.response(results)

            # Query for trails which you haven't started.
            # query = query.filter(
            #     ~Trail.trail_profiles.any(
            #         TrailProfile.user_id == request.oauth.user.id
            #     )
            # )
