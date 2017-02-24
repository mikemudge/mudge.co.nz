from .models import TrailBiker, TrailRide, TrailWalk, TrailWalker
from .serialize import BikerSchema, RideSchema, WalkSchema, WalkerSchema
from shared.views.crud import DBModelView, crud

class WalkerView(DBModelView):
    model = TrailWalker
    schema = WalkerSchema

class WalkView(DBModelView):
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
    crud(app, 'trail/walker', WalkerView)
    crud(app, 'trail/walk', WalkView)
    crud(app, 'trail/biker', BikerView)
    crud(app, 'trail/ride', RideView)
