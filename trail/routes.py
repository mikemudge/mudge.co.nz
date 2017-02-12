from .models import TrailWalker
from .serialize import WalkerSchema
from shared.views.crud import DBModelView, crud

class WalkerView(DBModelView):
    model = TrailWalker
    schema = WalkerSchema

def routes(app):
    crud(app, 'trail/walker', WalkerView)
