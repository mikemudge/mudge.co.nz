from flask_script import Manager
from flask import current_app

from shared.database import db
from apps.tournament_app.models import Tournament, Team, Match, Round
from apps.tournament_app.helpers import tournament as tournament_helper
from auth.models import Client, Scope
from apps.trail.models import Trail

InitCommand = Manager(usage='Perform initialization tasks.')

@InitCommand.command
def auth():
    client = Client.create("Web client")
    client.scopes = [
        Scope(name='user'),
        Scope(name='basic'),
        Scope(name='profile'),
        Scope(name='trail'),
        Scope(name='read_profile'),
    ]

    if current_app.config.get('CLIENT_ID'):
        client.client_id = current_app.config.get('CLIENT_ID')
    if current_app.config.get('CLIENT_SECRET'):
        client.client_secret = current_app.config.get('CLIENT_SECRET')

    db.session.add(client)
    db.session.commit()

    print("Make sure you have CLIENT_ID and CLIENT_SECRET set in your local_config")

@InitCommand.command
def trails():
    trail = Trail(
        name='Te Araroa',
        trail_url='te_araroa_trail.json'
    )
    db.session.add(trail)
    trail = Trail(
        name='Tour Aotearoa',
        trail_url='tour_aotearoa.json'
    )
    db.session.add(trail)
    trail = Trail(
        name='Pacific Coast',
        trail_url='pacific_coast.json'
    )
    db.session.add(trail)

    db.session.commit()

@InitCommand.command
def tournaments(reset=False):

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
    teams = [
        Team(name='Team %d' % (i + 1)) for i in range(0, numTeams)
    ]
    tournament_helper.makeFromTeams(tournament, teams)

    db.session.commit()
