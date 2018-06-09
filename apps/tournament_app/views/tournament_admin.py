from shared.admin import get_admin
from shared.admin import BaseView
from shared.database import db

from ..models import Match, MatchResult, Round, Team, Tournament

# Tournament admin views.
class MatchView(BaseView):
    exclude = ['result']
    pass

def admin_routes(app):
    admin = get_admin(app)
    admin.add_view(BaseView(Round, db.session, category="Tournament"))
    admin.add_view(BaseView(Team, db.session, category="Tournament"))
    admin.add_view(BaseView(Tournament, db.session, category="Tournament"))
    admin.add_view(MatchView(Match, db.session, category="Tournament"))
    admin.add_view(MatchView(MatchResult, db.session, category="Tournament"))
