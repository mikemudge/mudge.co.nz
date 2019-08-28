import requests

from auth.provider import oauth
from flask import jsonify
from flask.views import MethodView
from ..models import Rock1500Album, Rock1500Artist, Rock1500Song
from shared.database import db

class ImportView(MethodView):

    def parse_song(self, item):

        try:
            rankThisYear = int(item.get('rank'))
        except ValueError as e:
            # Its not really acceptable if this year's rank is not an int
            raise e

        # TODO look this up only as necessary.

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
            # Check for a result where rank2018 == rankOneYearAgo
            # otherwise this might fail to create with unique constraint.
            try:
                rankLastYear = int(item.get('rankOneYearAgo'))
            except ValueError as e:
                rankLastYear = None

            if rankLastYear is not None:
                existing = Rock1500Song.query.filter_by(rank2018=rankLastYear).first()
                if existing and existing.rankThisYear == rankThisYear:
                    print('Song name looks different, using last years rank\n %s - %s' % (song_name, existing.title))
                    if existing.album == album:
                        # TODO should we update the artist?
                        # Not sure if it matches or not here?
                        song = existing
                    elif existing.artist == artist:
                        # TODO should we update the album here?
                        song = existing
                if song:
                    # update the name if it changed and we needed to use the rank to find it.
                    song.name = song_name
                # TODO could also use year before to match?

            if song is None:
                # This looks like a new song, lets try to create it.
                print("Song not found, creating new song %s" % song_name)
                song = Rock1500Song(
                    title=song_name,
                    artist=artist,
                    album=album
                )
                # TODO may need to handle a unique constraint error here?
                db.session.add(song)
        else:
            # If the rock API updates the album we should use the latest.
            song.album = album
            # Same for artist.
            song.artist = artist

        song.rankThisYear = rankThisYear

        if not song.rank2019:
            # Don't update this once its set.
            song.rank2019 = song.rankThisYear

        try:
            newRank = int(item.get('rankOneYearAgo'))

            if song.rank2018 is None:
                # Update the DB with new information.
                song.rank2018 = newRank
            elif song.rank2018 != newRank:
                print("Rank changed for 2018 unexpected. Ignoring")
            else:
                # We already have a value and its the same so nothing to do.
                pass
        except ValueError as e:
            # No worries, we only care if its an int.
            pass

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
