import requests
import json

from auth.provider import oauth
from datetime import date
from flask import jsonify
from flask.views import MethodView
from ..models import Rock1500Album, Rock1500Artist, Rock1500Song
from ..serializers import Rock1500SongSchema
from shared.database import db


class ImportView(MethodView):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.songsByRank = {}
        self.songsByThisYearRank = {}
        self.songsByLastYearRank = {}
        self.songsByTwoYearsAgoRank = {}

    def parse_song(self, item):
        try:
            rankThisYear = int(item.get('rank'))
        except ValueError as e:
            # Its not really acceptable if this year's rank is not an int
            raise e

        song = self.songsByRank.get(rankThisYear)
        if song:
            # There is already a song with this rank.
            # We don't want to update it, but we could do some sanity checks on the song?
            return
        # To help print out debug information about songs.
        schema = Rock1500SongSchema()

        song = self.songsByThisYearRank.get(rankThisYear)
        if song:
            # Just update from this years rank.
            # The song has the ranks sent for this year, but not set in rankThisYear?
            print("Found song by rank2020 but not rankThisYear", schema.dumps(song))
            print("Item", json.dumps(item))
            return

        print("Song ranked %d (%s) not found" % (rankThisYear, item.get('title')))
        # The song might exist it just hasn't had its rank set for this year yet.

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

        songMatches = {
            'lastYear': self.songsByLastYearRank.get(rankLastYear),
            'twoYearsAgo': self.songsByTwoYearsAgoRank.get(rankTwoYearsAgo)
        }

        if songMatches['lastYear']:
            if songMatches['lastYear'] == songMatches['twoYearsAgo']:
                print("Match on previous years", rankLastYear, rankTwoYearsAgo)
                # This song looks good if both previous ranks match.
                song = songMatches['lastYear']
            elif songMatches['lastYear'].title == song_name:
                print("Match on 1 year ago song title %s vs %s" % (song_name, songMatches['lastYear'].title))
                # rank last year + title match is good enough.
                song = songMatches['lastYear']

        if not song:
            # Try to use 2 years ago + title.
            if songMatches['twoYearsAgo']:
                if song_name == songMatches['twoYearsAgo'].title:
                    print("Match on 2 years ago song title %s vs %s" % (song_name, songMatches['twoYearsAgo'].title))
                    # This song looks ok, but maybe we should set its rank last year?
                    song = songMatches['twoYearsAgo']

        if not song:
            # TODO if there is no mismatch song then this is a normal case.

            # load song by artist and title.
            query = Rock1500Song.query.join(Rock1500Song.artist)
            query = query.filter(Rock1500Artist.name == artist_name)
            query = query.filter(Rock1500Song.title == song_name)
            songs = query.all()
            if len(songs) == 0:
                print("No song found for", song_name, "by", artist_name)
            elif len(songs) == 1:
                print("One song found for", song_name, "by", artist_name)
                song = songs[0]
                if song.artist.name != artist_name:
                    print("Artist name doesn't match", song_name, "by", song.artist.name)
                    song = None
            else:
                print("Multiple songs found for", song_name, "by", artist_name)

            if not song:
                # good in this case indicates 2 out of 3 matches from rank last year, 2 years ago and title.
                print("no good match found for song %s" % song_name)

                # print the whole thing if there is anything to print.
                print(json.dumps(item, indent=2, separators=(',', ':')))
                if songMatches['lastYear']:
                    print("Last year %s" % schema.dumps(songMatches['lastYear'], indent=2, separators=(',', ':')))
                else:
                    print("Last year None")
                if songMatches['twoYearsAgo']:
                    print("2 years agos %s" % schema.dumps(songMatches['twoYearsAgo'], indent=2, separators=(',', ':')))
                else:
                    print("2 years agos None")
            else:
                print("Found song by artist and title", artist_name, song_name)
                print("Song", schema.dumps(song))

            # TODO would be interesting to see which are None?
            if songMatches['lastYear']:
                # There was a song found for last years rank, but its not a match?
                # Lets create a new song, but we can't set last years rank on it (unique conflict)
                # TODO it might be better to unset the value on the old song?
                print(rankLastYear, "found song which doesn't match", songMatches['lastYear'].title)
                rankLastYear = None
            if songMatches['twoYearsAgo']:
                # There was a song found for 2 years ago rank, but its not a match?
                # Lets create a new song, but we can't set two years ago rank on it (unique conflict)
                # TODO it might be better to unset the value on the old song?
                print(rankTwoYearsAgo, "found song which doesn't match", songMatches['twoYearsAgo'].title)
                rankTwoYearsAgo = None

        if song is not None:
            # TODO use songMatches to figure out the best song?
            # update previous ranks if needed to be able to apply change?
            if not self.checkMatch(song, item):

                if song.title == item.get('title'):
                    # If the song title is a match then these things look good.
                    print("song title is a match %s" % song.title)
                    # TODO this could probably be safely updated without the artist/album.
                    # Would be a candidate for getting better data on.
                    # song.rankThisYear = rankThisYear
                    return

                if song.artist.name == item.get('artist'):
                    print("artist looks good")

                if song.album.name == album_name:
                    print("album matches %s" % album_name)
                    if song.album.artist != artist_name:
                        print("album.artist doesn't match artist")
                        # unset the artist or album? But don't know which is right?

                # TODO if nothing matches then this is suspcious, assume rank is wrong?

                album = Rock1500Album.find_by_name(album_name)
                artist = Rock1500Artist.find_by_name(artist_name)

                if album and artist is not album.artist:
                    # One of these might be wrong?
                    print("album doesn't match artist")

                schema = Rock1500SongSchema()
                print(song.rankThisYear, song.rank2019, song.rank2018, song.title, song.artist.name, song.album.name)
                print(rankThisYear, rankLastYear, rankTwoYearsAgo, song_name, artist_name, album_name)
                print(schema.dumps(song, indent=2, separators=(',', ':')))
                # TODO when reporting to sentry we get errors with orm session.
                # because sentry gives full context, it attempts to use lots of attributes of model objects
                # That leads to DB calls with a session which has already been closed (errors)
                raise Exception('This song looks completely different. Not updating')

            # This song needs to be updated with its position this year.
            if song.rankThisYear is None:
                print("Setting rankThisYear", rankThisYear, "for", song_name)
                song.rankThisYear = rankThisYear
                song.rank2020 = rankThisYear
                self.songsByRank[rankThisYear] = song
                db.session.commit()
            else:
                print("song already has a rankThisYear of", song.rankThisYear, "for", song_name)
                # Update this song to have the correct rank for this year.
                # Remove from old lookup spot.
                self.songsByRank[song.rankThisYear] = None
                # Add back in the other spot.
                self.songsByRank[rankThisYear] = song
                song.rankThisYear = rankThisYear
                song.rank2020 = rankThisYear
                db.session.commit()
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
                rank2020=rankThisYear,
                rank2019=rankLastYear,
                rank2018=rankTwoYearsAgo,
            )
            db.session.add(song)
            db.session.commit()
            # Because we couldn't find an existing song, we don't need to check this.

    def checkMatch(self, song, item):

        if song is None:
            return None

        # Look at 5 attributes of the song vs the item.
        # if 2 or less are not matches we can believe this is correct song.
        # E.g song titles and albums commonly change a bit.
        changes = 0
        if song.rank2019 != item.get('rankLastYear'):
            changes += 1
        if song.rank2018 != item.get('rankTwoYearsAgo'):
            changes += 1
        if song.title != item.get('title'):
            changes += 1
        if song.artist.name != item.get('artist'):
            changes += 1
        if song.album.name != item.get('album'):
            changes += 1

        if changes > 2:
            # This is not a good match.
            return None

        # The match is pretty close, so accept it.
        return song

    @oauth.require_oauth('admin')
    def get(self):
        return self.updateDB()

    def updateDB(self):
        # Hit rock API.
        # Steal their songs and artists.
        # Update my DB with that.

        current_date = date.today()
        if current_date.year != 2020:
            return jsonify({
                'error': 'Import script needs updating to %d' % current_date.year
            })

        print("Loading data from rock API")
        req = requests.get(
            'http://radio-api.mediaworks.nz/comp-api/v1/countdown/therock',
        )
        result = req.json()

        print("rock API loaded %d songs" % len(result))
        print("loading songs from DB")
        query = Rock1500Song.query
        songs = query.all()
        print("loaded %d songs from DB" % len(songs))

        # Prepare song data for quicker finds.
        self.songsByRank = {s.rankThisYear: s for s in songs if s.rankThisYear}
        self.songsByThisYearRank = {s.rank2020: s for s in songs if s.rank2020}
        self.songsByLastYearRank = {s.rank2019: s for s in songs if s.rank2019}
        self.songsByTwoYearsAgoRank = {s.rank2018: s for s in songs if s.rank2018}

        print("Fetched %d songs. Parsing..." % len(result))
        for i, item in enumerate(result):
            try:
                if i % 100 == 0:
                    # Show progress if nothing else is happening.
                    print(i)

                self.parse_song(item)
                db.session.commit()
            except Exception as e:
                print("Error parsing song\n%s" % json.dumps(item, indent=2, separators=(',', ':')))
                raise e
        db.session.commit()

        # No need to send all the data back to the client.
        return jsonify({
            'status': 'complete'
        })
