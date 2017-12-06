from tests.base.base_test_case import BaseTestCase

from tournament_app.models import Team, Match, MatchResult
from shared.database import db

class TestTournament(BaseTestCase):

    def setUp(self):
        super(TestTournament, self).setUp()

        self.jsonClient.add_scope('tournament')
        self.user = self.jsonClient.createLoggedInUser(self._testMethodName)

    def test_tournament(self):

        response = self.jsonClient.post('/api/tournament/tournament', {
            'name': "Test Tournament",
            'teams': [{
                'name': 'Blue',
            }, {
                'name': 'Red',
            }]
        })

        tourny = response.json['data']
        self.assertEquals(tourny['name'], "Test Tournament")
        self.assertIsNotNone(tourny.get('id'))
        self.assertEqual(tourny['teams'][0]['name'], 'Blue')
        self.assertEqual(tourny['teams'][1]['name'], 'Red')

    def test_getSingleTournament(self):
        t = self.createTournament()

        response = self.jsonClient.get(
            '/api/tournament/tournament/%s' % t['id'])

        tourny = response.json['data']
        self.assertEquals(tourny['name'], "Test Tournament")
        self.assertIsNotNone(tourny.get('id'))
        self.assertEqual(tourny['teams'][0]['name'], 'Blue')
        self.assertEqual(tourny['teams'][1]['name'], 'Red')

    def test_getAllTournaments(self):
        self.createTournament()

        response = self.jsonClient.get(
            '/api/tournament/tournament')

        self.assertEqual(len(response.json['data']), 1)
        tourny = response.json['data'][0]
        self.assertEquals(tourny['name'], "Test Tournament")
        self.assertIsNotNone(tourny.get('id'))
        self.assertEqual(tourny['teams'][0]['name'], 'Blue')
        self.assertEqual(tourny['teams'][1]['name'], 'Red')

    def test_generateRounds(self):
        t = self.createTournament(teamNames=['Team %d' % (d + 1) for d in range(8)])
        response = self.jsonClient.post(
            '/api/tournament/tournament/%s/generate_rounds' % t['id'])

        tourny = response.json['data']
        self.assertContains(tourny, {
            'id': tourny['id'],
            'name': 'Test Tournament',
        })
        teams = tourny['teams']
        self.assertEqual(teams[0]['name'], 'Team 1')
        round = tourny['rounds'][0]
        self.assertEqual(round['name'], "Round 1")
        self.assertRoundMatches(round, teams, [[0, 7], [1, 6], [2, 5], [3, 4]])

    def test_delele_match_removes_result(self):
        team1 = Team(name="Team 1")
        team2 = Team(name="Team 2")
        m = Match(homeTeam=team1, awayTeam=team2)
        db.session.add(m)
        db.session.commit()

        m.result = MatchResult(homeScore=1, awayScore=2)
        db.session.commit()

        self.assertEqual(MatchResult.query.count(), 1)
        result = MatchResult.query.first()
        self.assertEqual(result.homeScore, 1)
        self.assertEqual(result.awayScore, 2)

        # Delete the match, and make sure the result is gone too.
        db.session.delete(m)

        self.assertEqual(MatchResult.query.count(), 0)

    def test_delete_result(self):
        team1 = Team(name="Team 1")
        team2 = Team(name="Team 2")
        m = Match(homeTeam=team1, awayTeam=team2)
        db.session.add(m)
        db.session.commit()

        m.result = MatchResult(homeScore=1, awayScore=2)
        db.session.commit()

        self.assertEqual(MatchResult.query.count(), 1)

        db.session.delete(m.result)
        db.session.commit()

        self.assertEqual(Match.query.count(), 1)
        m = Match.query.first()
        self.assertEquals(m.result, None)
        self.assertEquals(m.homeTeam, team1)
        self.assertEquals(m.awayTeam, team2)

    def test_replace_result(self):
        team1 = Team(name="Team 1")
        team2 = Team(name="Team 2")
        m = Match(homeTeam=team1, awayTeam=team2)
        db.session.add(m)
        db.session.commit()

        m.result = MatchResult(homeScore=1, awayScore=2)
        db.session.commit()

        m.result = MatchResult(homeScore=3, awayScore=4)
        db.session.commit()

        # The old result should be deleted.
        self.assertEqual(MatchResult.query.count(), 1)
        result = MatchResult.query.first()
        self.assertEqual(result.homeScore, 3)
        self.assertEqual(result.awayScore, 4)

    def assertRoundMatches(self, round, teams, matches):
        for i, m in enumerate(matches):
            self.assertContains(round['matches'][i], {
                'homeTeam': teams[m[0]],
                'awayTeam': teams[m[1]],
            })

    def createTournament(self, teamNames=['Blue', 'Red']):
        teams = [{'name': t} for t in teamNames]
        response = self.jsonClient.post(
            '/api/tournament/tournament',
            {
                'name': "Test Tournament",
                'teams': teams
            })

        return response.json['data']
