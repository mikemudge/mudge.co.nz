from tests.base_test_case import BaseTestCase

from tournament.models import Tournament, Round, Match, Team
from tournament.serialize import TournamentView

class TestTournament(BaseTestCase):

    def test_tournament(self):
        team1 = Team(name="Blue")
        team2 = Team(name="Red")

        match = Match(homeTeam=team1, awayTeam=team2)
        round = Round(matches=[match])
        tournament = Tournament(teams=[team1, team2], rounds=[round])

        schema = TournamentView()
        results, errors = schema.dump(tournament)
        print results
