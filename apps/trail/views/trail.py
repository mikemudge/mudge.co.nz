from auth.provider import oauth
from flask import request
from flask.views import MethodView

from ..models import Trail, TrailProfile
from ..serialize import TrailSchema

# Load Trail, read only for now.
class TrailView(MethodView):

    @oauth.require_oauth('trail')
    def get(self, pk=None):
        if pk:
            instance = Trail.query.get(pk)
            schema = TrailSchema()
            result, errors = schema.dump(instance)

            return schema.response(instance)
        else:
            schema = TrailSchema(many=True)
            data = {}
            if request.args:
                data = request.args
            if request.json:
                data = request.json
            started_only = data.get('started', None)
            query = Trail.query

            print(request.oauth.user.trail_profiles)
            # Want all trails which this user has not already started on.
            # Can find all trail id's which the user has started on then do NOT IN.

            if started_only and started_only.lower() == "false":
                # Only trails which you haven't started
                query = query.filter(
                    ~Trail.trail_profiles.any(
                        TrailProfile.user_id == request.oauth.user.id
                    )
                )
            # Order by created date.
            query = query.order_by(Trail.date_created.desc())

            results = query.all()
            # TODO coerce activity into a choice???
            # It currently returns as a str???
            return schema.response(results)
