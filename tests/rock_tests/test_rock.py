from apps.rock1500.models import Rock1500Song, Rock1500Artist
from apps.rock1500.models import Rock1500Album, Rock1500Pick
from apps.rock1500.views import importer
from auth.models import User
from shared.database import db
from tests.base.base_test_case import BaseTestCase

class TestRock(BaseTestCase):

    def test_songs(self):
        metallica = Rock1500Artist(name="Metallica")
        justice_for_all = Rock1500Album(name='...And Justice for All', year=1988, artist=metallica)
        one = Rock1500Song(title="One", artist=metallica, album=justice_for_all)

        db.session.add(one)
        db.session.commit()

    def test_duplicate_songs(self):
        metallica = Rock1500Artist(name="Metallica")
        justice_for_all = Rock1500Album(name='...And Justice for All', year=1988, artist=metallica)
        one = Rock1500Song(title="One", artist=metallica, album=justice_for_all)

        db.session.add(one)
        db.session.commit()

        one2 = Rock1500Song(title="One", artist=metallica, album=justice_for_all)
        db.session.add(one2)
        try:
            db.session.commit()
        except Exception as e:
            self.assertEqual(e.message, '(psycopg2.IntegrityError) duplicate key value violates unique constraint "ix_rock1500_song_title"\nDETAIL:  Key (title)=(One) already exists.\n')

    def test_picks(self):
        a = Rock1500Artist(name="Test Artist")
        album = Rock1500Album(name='Test Album', artist=a)

        # Add several songs.
        for i in range(1, 10):
            db.session.add(Rock1500Song(title='Song %s' % i, artist=a, album=album))

        db.session.commit()

        rock_picker = User.create("rocker")
        for i in range(4):
            Rock1500Pick(
                song=Rock1500Song.find_by_name('Song %s' % (i + 1), artist=a),
                position=i,
                user=rock_picker,
            )

        db.session.add(rock_picker)
        db.session.commit()

        user = User.query.get(rock_picker.id)
        print(user)

        self.assertEqual(len(user.rock_picks), 4)
        self.assertEqual(user.rock_picks[0].song.title, "Song 1")
        self.assertEqual(user.rock_picks[3].song.title, "Song 4")

    def test_import(self):
        class FakeResponse:
            def json(self):
                return [{
                    'album': "Pinkerton",
                    'albumArt': "https://cdn.mediaworks.nz/radio/song/images/el_scorcho_400_weezer.jpg?width=400&height=400&crop=auto",
                    'albumYear': "1996",
                    'artist': "Weezer",
                    'rank': "1155",
                    'rankOneYearAgo': "726",
                    'rankTwoYearsAgo': "Debut",
                    'timestamp': "2017-08-30 18:45:01",
                    'title': "El Scorcho"
                }]

        def fakeGet(url):
            return FakeResponse()

        importer.requests.get = fakeGet

        self.jsonClient.createAdminUser('test_import')
        self.jsonClient.get('rock1500/import')

        pinkerton = Rock1500Album.find_by_name('Pinkerton')
        weezer = Rock1500Artist.find_by_name('Weezer')
        scorcho = Rock1500Song.find_by_name('El Scorcho', artist=weezer)

        self.assertEqual(weezer.name, 'Weezer')
        self.assertEqual(scorcho.title, 'El Scorcho')
        self.assertEqual(pinkerton.name, 'Pinkerton')
