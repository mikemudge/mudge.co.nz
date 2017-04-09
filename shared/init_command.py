from flask_script import Manager
from shared.database import db
from tournament_app.models import Tournament, Team, Match, Round
from tournament_app.helpers import tournament as tournament_helper

InitCommand = Manager(usage='Perform initialization tasks.')

@InitCommand.command
def tournaments(reset=False):

    if reset:
        print "Removing all Tournament models"
        Round.query.delete()
        Match.query.delete()
        Team.query.delete()
        Tournament.query.delete()
    tournament = Tournament.query.filter_by(name="Test Tournament").first()

    if not tournament:
        print "Create tournament"
        tournament = Tournament(name="Test Tournament")
        db.session.add(tournament)
    else:
        print "Already exists"
        # Clear rounds/matches and teams and recreate.
        tournament.rounds.delete()
        tournament.teams.delete()

    # Now fill in the details of the tournament.
    numTeams = 10
    teams = [
        Team(name='Team %d' % (i + 1)) for i in range(0, numTeams)
    ]
    tournament_helper.makeFromTeams(tournament, teams)

    db.session.commit()
