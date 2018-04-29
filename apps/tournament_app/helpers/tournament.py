import random

from ..models import Match, Round

def makeFromTeams(tournament, teams):
    numTeams = len(teams)

    random.shuffle(teams)
    tournament.teams = teams[:]
    rounds = []
    for r in range(0, numTeams - 1):
        rnd = Round()
        matches = [
            Match(
                homeTeam=teams[i],
                awayTeam=teams[i + 1],
            ) for i in range(0, numTeams, 2)
        ]
        random.shuffle(matches)
        rnd.matches = matches
        # Rotate teams except the first team.
        print([t.name for t in teams])
        teams.append(teams.pop(1))
        rounds.append(rnd)

    # TODO shuffle rounds, then name them in the shuffled order?
    random.shuffle(rounds)
    for (i, r) in enumerate(rounds):
        r.name = "Round %s" % (i + 1)

    tournament.rounds = rounds
    return tournament
