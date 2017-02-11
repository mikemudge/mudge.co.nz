from flask import jsonify
from flask import Blueprint
from shared.database import db
from shared.exceptions import ValidationException
from ..serialize import TournamentSchema
from ..models import Match, Round, Tournament

tournament_bp = Blueprint('tournament_app', __name__)

@tournament_bp.route('tournament/<pk>/generate_rounds', methods=['POST'])
def generateTournamentRounds(pk):
    tournament = Tournament.query.get(pk)

    # TODO Check settings.
    # add pools
    generateRoundRobin(tournament)

    # generate Knockout

    db.session.commit()
    s = TournamentSchema(session=db.session)
    result, errors = s.dump(tournament)
    if errors:
        raise ValidationException(errors)
    return jsonify(data=result)

def generateRoundRobin(tournament):
    teams = tournament.teams
    numTeams = len(teams)

    for r in range(1):
        roundA = Round(name="Round 1")
        for m in range(numTeams / 2):
            match = Match(
                homeTeam=teams[m],
                awayTeam=teams[numTeams - m - 1],
            )
            roundA.matches.append(match)
        tournament.rounds.append(roundA)

def generateKnockout(tournament):
    pass
    # Need to make matches based on the result of other matches.
    # Also matches which depend on pool matches.
