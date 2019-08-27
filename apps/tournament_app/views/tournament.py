from flask import jsonify
from flask import Blueprint
from shared.database import db
from ..serialize import TournamentSchema
from ..models import Match, Round, Tournament

tournament_bp = Blueprint('tournament_app', __name__)

@tournament_bp.route('tournament/<pk>/generate_rounds', methods=['POST'])
def generateTournamentRounds(pk):
    tournament = Tournament.query.get(pk)

    # TODO check if rounds already was generated???
    print(tournament.rounds.count())

    # TODO Check settings.
    # add pools
    generateRoundRobin(tournament)

    # generate Knockout
    db.session.commit()
    s = TournamentSchema(session=db.session)
    result = s.dump(tournament)
    return jsonify(data=result)

def generateRoundRobin(tournament):
    # Duplicate the array so we can modify it.
    teams = tournament.teams[:]
    numTeams = len(teams)

    # Reset the rounds before generated new ones.
    # TODO or report an error?
    tournament.rounds = []
    for r in range(numTeams - 1):
        roundA = Round(name="Round %d" % (r + 1))
        for m in range(int(numTeams / 2)):
            match = Match(
                homeTeam=teams[m],
                awayTeam=teams[numTeams - m - 1],
            )
            roundA.matches.append(match)

        teams = teams[:1] + teams[2:] + teams[1:2]
        print(teams)
        tournament.rounds.append(roundA)

def generateKnockout(tournament):
    pass
    # Need to make matches based on the result of other matches.
    # Also matches which depend on pool matches.
