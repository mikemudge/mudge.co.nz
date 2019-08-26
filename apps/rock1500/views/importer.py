import requests

from auth.provider import oauth
from flask import jsonify
from flask.views import MethodView
from ..models import Rock1500Album, Rock1500Artist, Rock1500Song
from shared.database import db

class ImportView(MethodView):

    def parse_song(self, item):

        artist_name = item.get('artist')
        artist = Rock1500Artist.find_by_name(artist_name)
        if not artist:
            print("Artist not found, creating new artist %s" % artist_name)
            artist = Rock1500Artist(
                name=artist_name
            )
            db.session.add(artist)

        album_name = item.get('album')
        album = Rock1500Album.find_by_name(album_name)
        if not album:
            print("Album not found, creating new album %s" % album_name)
            album = Rock1500Album(
                name=album_name,
                artist=artist
            )
            db.session.add(album)

        albumArt = item.get('albumArt')
        if len(albumArt) <= 255:
            album.cover_art_url = item.get('albumArt')
        album.year = item.get('albumYear')

        song_name = item.get('title')
        song = Rock1500Song.find_by_name(song_name, artist)
        if not song:
            print("Song not found, creating new song %s" % song_name)
            song = Rock1500Song(
                title=song_name,
                artist=artist,
                album=album
            )
            db.session.add(song)

        try:
            song.rankThisYear = item.get('rank')
        except ValueError as e:
            # Its not really acceptable if this year's rank is not an int
            raise e

        # TODO set rank 2018 once it exists.

        try:
            newRank = int(item.get('rankTwoYearsAgo'))

            if song.rank2017 is None:
                # Update the DB with new information.
                song.set2017Rank(newRank)
            elif song.rank2017 != newRank:
                print("Rank changed for 2017 unexpected. Ignoring")
            else:
                # We already have a value and its the same so nothing to do.
                pass
        except ValueError as e:
            # No worries, we only care if its an int.
            pass

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

        print("Fetched %d songs. Parsing..." % len(result))
        for item in result:
            self.parse_song(item)
            db.session.commit()

        return jsonify(result)
