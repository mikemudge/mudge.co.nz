import requests

from auth.provider import oauth
from flask import jsonify
from flask.views import MethodView
from ..models import Rock1500Album, Rock1500Artist, Rock1500Song
from shared.database import db

class ImportView(MethodView):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.songsByRank = {}

    def parse_song(self, item):

        try:
            rankThisYear = int(item.get('rank'))
        except ValueError as e:
            # Its not really acceptable if this year's rank is not an int
            raise e

        rankLastYear = None
        try:
            rankLastYear = int(item.get('rankOneYearAgo'))
        except ValueError as e:
            # Can be non int values like Re-Entry or Debut.
            pass

        rankTwoYearsAgo = None
        try:
            rankTwoYearsAgo = int(item.get('rankTwoYearsAgo'))
        except ValueError as e:
            # Can be non int values like Re-Entry or Debut.
            pass

        album_name = item.get('album')
        artist_name = item.get('artist')
        song_name = item.get('title')

        song = self.songsByRank.get(rankThisYear)
        if song is None:
            query = Rock1500Song.query
            query = query.filter_by(rankThisYear=rankThisYear)
            song = query.first()
        if song is None and rankLastYear:
            # If it has a rank last year, that is the best identifier.
            song = Rock1500Song.query.filter_by(rank2018=rankLastYear).first()
            if song is None:
                print("Song not found by rank2018 == %d" % rankLastYear)
            else:
                print("Song found, by rank2018 lookup %s" % song_name)

        if song is None and rankTwoYearsAgo is not None:
            # Locate a song by rank in 2017.
            song = Rock1500Song.query.filter_by(rank2017=rankTwoYearsAgo).first()
            if song is None:
                print("Song not found by rank2017 == %d" % rankTwoYearsAgo)
            else:
                print("Song found, by rank2017 lookup %s" % song_name)

        if song is None:
            # Last resort is to lookup by name + artist name.
            query = Rock1500Song.query.filter(Rock1500Artist.name == artist_name)
            query = query.filter_by(Rock1500Song.name == song_name)
            song = query.first()

            if song is not None:
                # This can happen for songs which ranked in 2016/2015 but not in 2017/2018.
                print("Song found, by name + artist lookup %s" % song_name)

        if song is not None:
            changes = 0
            if song.title != song_name:
                changes += 1
            if song.artist.name != artist_name:
                changes += 1
            if song.album.name != album_name:
                changes += 1

            if changes >= 3:
                print("This song looks completely different. Not updating")
                print(song.title, song.artist.name, song.album.name)
                print(song_name, artist_name, album_name)
                return

            # This song needs to be updated with its position this year.
            if song.rankThisYear is None:
                song.rankThisYear = rankThisYear
                song.rank2019 = rankThisYear

            # Not changing anything else at the moment, but could update artist/album as needed.
            # That would only be needed to make updates if the API data changes.
            return
        else:
            # This looks like its a new song, so we need to add it.

            album = Rock1500Album.find_by_name(album_name)
            if album:
                # If we find the album we can reuse the artist from it.
                artist = album.artist
            else:
                # Try and reuse an existing artist.
                artist = Rock1500Artist.find_by_name(artist_name)
                if not artist:
                    print("Artist not found, creating new artist %s" % artist_name)
                    artist = Rock1500Artist(
                        name=artist_name
                    )
                    db.session.add(artist)

                # And create the album too.
                print("Album not found, creating new album %s" % album_name)
                album = Rock1500Album(
                    name=album_name,
                    artist=artist
                )
                db.session.add(album)
            # At this point we have an artist and an album, so we can create a song.
            print("Song not found, creating new song %s" % song_name)
            song = Rock1500Song(
                title=song_name,
                artist=artist,
                album=album,
                rankThisYear=rankThisYear,
                rank2019=rankThisYear,
                rank2018=rankLastYear,
                rank2017=rankTwoYearsAgo,
            )
            db.session.add(song)
            # Because we couldn't find an existing song, we don't need to check this.

    @oauth.require_oauth('admin')
    def get(self):
        return self.updateDB()

    def updateDB(self):
        # Hit rock API.
        # Steal their songs and artists.
        # Update my DB with that.
        req = requests.get(
            'http://radio-api.mediaworks.nz/comp-api/v1/countdown/therock',
        )
        result = req.json()

        query = Rock1500Song.query.filter(Rock1500Song.rankThisYear.isnot(None))
        songs = query.all()
        self.songsByRank = {s.rankThisYear: s for s in songs}

        print("Fetched %d songs. Parsing..." % len(result))
        for item in result:
            self.parse_song(item)
        db.session.commit()

        # No need to send all the data back to the client.
        return jsonify({
            'status': 'complete'
        })
