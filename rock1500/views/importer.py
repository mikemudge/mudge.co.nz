import requests

from flask import jsonify
from flask.views import MethodView
from rock1500.models import Rock1500Album, Rock1500Artist, Rock1500Song
from shared.database import db

class ImportView(MethodView):

    def parse_song(self, item):

        artist_name = item.get('artist')
        artist = Rock1500Artist.find_by_name(artist_name)
        if not artist:
            artist = Rock1500Artist(
                name=artist_name
            )
            db.session.add(artist)

        album_name = item.get('album')
        album = Rock1500Album.find_by_name(album_name)
        if not album:
            album = Rock1500Album(
                name=album_name,
            )
            db.session.add(album)
        album.artist = artist
        album.cover_art_url = item.get('albumArt')
        album.year = item.get('albumYear')

        song_name = item.get('title')
        song = Rock1500Song.find_by_name(song_name, artist)
        if not song:
            song = Rock1500Song(
                title=song_name
            )
            db.session.add(song)
        song.artist = artist
        song.album = album

        song.rank2017 = item.get('rank')
        song.rank2016 = item.get('rankOneYearAgo')
        song.rank2015 = item.get('rankTwoYearsAgo')

    def get(self):
        # Hit rock API.
        # Steal their songs and artists.
        # Update my DB with that.
        req = requests.get(
            'http://radio-api.mediaworks.nz/comp-api/v1/countdown/therock',
        )
        result = req.json()

        for item in result:
            self.parse_song(item)
            db.session.commit()

        return jsonify(result)
