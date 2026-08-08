import click
from apps.tournament_app.models import Tournament, Team, Match, Round
from apps.tournament_app.helpers import tournament as tournament_helper
from auth.models import User
from flask.cli import AppGroup
from shared.database import db

FakeCommand = AppGroup('fake', help='Populate some fake data for testing.')

@FakeCommand.command('friends')
@click.option('--reset', is_flag=True, default=False)
def friends(reset):

    if reset:
        print("Reset not supported for users.")
        return

    for i in range(0, 5):
        user = User.create('friend%d@test.mudge.co.nz' % i)
        db.session.add(user)
    db.session.commit()

@FakeCommand.command('tournaments')
@click.option('--reset', is_flag=True, default=False)
def tournaments(reset):

    if reset:
        print("Removing all Tournament models")
        Round.query.delete()
        Match.query.delete()
        Team.query.delete()
        Tournament.query.delete()
    tournament = Tournament.query.filter_by(name="Test Tournament").first()

    if not tournament:
        print("Create tournament")
        tournament = Tournament(name="Test Tournament")
        db.session.add(tournament)
    else:
        print("Already exists")
        # Clear rounds/matches and teams and recreate.
        tournament.rounds.delete()
        tournament.teams.delete()

    # Now fill in the details of the tournament.
    numTeams = 10
    teams = []
    for i in range(0, numTeams):
        t = Team(name='Team %d' % (i + 1))
        db.session.add(t)
        db.session.commit()
        teams.append(t)

    tournament_helper.makeFromTeams(tournament, teams)

    db.session.commit()
