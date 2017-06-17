from auth.provider import oauth
from flask import request

from .models import TrailBiker, TrailRide, TrailWalk, TrailWalker
from .serialize import BikerSchema, RideSchema, WalkSchema, WalkerSchema
from shared.views.crud import DBModelView, crud

# Add common stuff for all trail views.
class TrailView(DBModelView):
    @oauth.require_oauth('trail')
    def get(self, pk=None):
        print request.oauth.user
        return super(TrailView, self).get(pk)

    @oauth.require_oauth('trail')
    def put(self, pk=None):
        return super(TrailView, self).put(pk)

    @oauth.require_oauth('trail')
    def post(self, pk=None):
        # TODO also verify ownership before doing this?
        print request.oauth.user
        # Is owner of pk item? May need to load item first?
        return super(TrailView, self).post(pk)

    @oauth.require_oauth('trail')
    def delete(self, pk=None):
        return super(TrailView, self).delete(pk)

class WalkerView(TrailView):
    model = TrailWalker
    schema = WalkerSchema

class WalkView(TrailView):
    model = TrailWalk
    schema = WalkSchema

class BikerView(DBModelView):
    model = TrailBiker
    schema = BikerSchema

class RideView(DBModelView):
    model = TrailRide
    schema = RideSchema

def routes(app):
    # TODO migrate angular app to use new API's
    crud(app, 'trail/v1/walker', WalkerView)
    crud(app, 'trail/v1/walk', WalkView)
    crud(app, 'trail/v1/biker', BikerView)
    crud(app, 'trail/v1/ride', RideView)
