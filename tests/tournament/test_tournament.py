import json

from tests.base.base_test_case import BaseTestCase

class TestTournament(BaseTestCase):

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

    def assertRoundMatches(self, round, teams, matches):
        for i, m in enumerate(matches):
            self.assertContains(round['matches'][i], {
                'homeTeam': teams[m[0]],
                'awayTeam': teams[m[1]],
            })

    def createTournament(self, teamNames=['Blue', 'Red']):
        teams = [{'name': t} for t in teamNames]
        response = self.client.post(
            '/api/tournament/tournament',
            data=json.dumps({
                'name': "Test Tournament",
                'teams': teams
            }),
            content_type="application/json")
        return response.json['data']
