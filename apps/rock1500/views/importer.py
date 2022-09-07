import requests
import json
import time

from auth.provider import oauth
from datetime import date
from flask import jsonify, current_app
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

    @oauth.require_oauth('admin')
    def get(self):
        return self.updateDB()

    def updateDB(self):
        # Hit rock API.
        # Steal their songs and artists.
        # Update my DB with that.

        current_app.logger.info("Loading data from rock API")
        req = requests.get(
            'http://radio-api.mediaworks.nz/comp-api/v1/countdown/therock',
        )
        result = req.json()

        current_app.logger.info("rock API loaded %d songs" % len(result))


        current_date = date.today()
        if current_date.year != 2022:
            current_app.logger.warning("Import script needs updating to %d" % current_date.year);
            return jsonify({
                'error': 'Import script needs updating to %d' % current_date.year
            })

        # Now look at our database.
        current_app.logger.info("loading songs from DB")
        query = Rock1500Song.query
        songs = query.all()
        current_app.logger.info("loaded %d songs from DB" % len(songs))

        # Prepare song data for quicker finds.
        self.songsByRank = {s.rankThisYear: s for s in songs if s.rankThisYear}
        self.songsByThisYearRank = {s.rank2022: s for s in songs if s.rank2022}
        self.songsByLastYearRank = {s.rank2021: s for s in songs if s.rank2021}
        self.songsByTwoYearsAgoRank = {s.rank2020: s for s in songs if s.rank2020}

        current_app.logger.info("Fetched %d songs. Parsing..." % len(result))
        for i, item in enumerate(result):
            try:
                if i % 100 == 0:
                    # Show progress if nothing else is happening.
                    current_app.logger.info(i)

                self.parse_song(item)
            except Exception as e:
                current_app.logger.warning("Error parsing song\n%s" % json.dumps(item, indent=2, separators=(',', ':')))
                raise e
        db.session.commit()

        # No need to send all the data back to the client.
        return jsonify({
            'status': 'complete'
        })

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
        if song:
            # There is already a song with this rank.
            # We don't want to update it, but we could do some sanity checks on the song?

            if song.album:
                changes = False
                # Update the albumArt if it doesn't have one yet.
                if item.get('albumArt') and not song.album.cover_art_url:
                    changes = True
                    current_app.logger.info("Update album with art %s" % item.get('albumArt'))
                    song.album.cover_art_url=item.get('albumArt')
                # Update the year if it doesn't have one yet.
                if item.get('albumYear') and not song.album.year:
                    try:
                        song.album.year = int(item.get('albumYear'));
                        changes = True
                        current_app.logger.info("Update album with year %d" % song.album.year)
                    except ValueError as e:
                        # We can't do anything with albumYear if its not an int.
                        current_app.logger.warning("Bad year for album %s" % item.get('albumYear'))
                if changes:
                    current_app.logger.info("Update album %s" % song.album.name)
                    db.session.add(song.album)
                    db.session.commit()

            songChanges = False
            if rankLastYear and not song.rank2021:
                if rankLastYear in self.songsByLastYearRank:
                    # TODO is this song the same but with a different looking title?
                    # They could be combined into 1?
                    current_app.logger.info("Song %s claims to have rankLastYear of %d" % (song.title, rankLastYear))
                    current_app.logger.info("However this rank is already claimed by %s" % self.songsByLastYearRank[rankLastYear].title)
                else:
                    # The rank isn't already taken, so this song can be updated to have it.
                    song.rank2021 = rankLastYear
                    current_app.logger.info("Update song with rank2021 %d" % rankLastYear)
                    songChanges = True
            if rankTwoYearsAgo and not song.rank2020:
                if rankTwoYearsAgo in self.songsByTwoYearsAgoRank:
                    # TODO is this song the same but with a different looking title?
                    # They could be combined into 1?
                    current_app.logger.info("Song %s claims to have rankTwoYearsAgo of %d" % (song.title, rankTwoYearsAgo))
                    current_app.logger.info("However this rank is already claimed by %s" %  self.songsByTwoYearsAgoRank[rankTwoYearsAgo].title)
                else:
                    # The rank isn't already taken, so this song can be updated to have it.
                    song.rank2020 = rankTwoYearsAgo
                    current_app.logger.info("Update song with rank2020 %d" % rankTwoYearsAgo)
                    songChanges = True
            if songChanges:
                current_app.logger.info("Update song %s" % song.title)
                db.session.add(song)
                db.session.commit()

            return
        # To help print out debug information about songs.
        schema = Rock1500SongSchema()

        song = self.songsByThisYearRank.get(rankThisYear)
        if song:
            # Just update from this years rank.
            # The song has the ranks sent for this year, but not set in rankThisYear?
            current_app.logger.info("Found song by rank2022 but not rankThisYear %s" % schema.dumps(song))
            current_app.logger.info("Item %s" % json.dumps(item))
            return

        current_app.logger.info("Song ranked %d (%s) not found" % (rankThisYear, item.get('title')))
        # The song might exist it just hasn't had its rank set for this year yet.

        songMatches = {
            'lastYear': self.songsByLastYearRank.get(rankLastYear),
            'twoYearsAgo': self.songsByTwoYearsAgoRank.get(rankTwoYearsAgo)
        }

        if songMatches['lastYear']:
            if songMatches['lastYear'] == songMatches['twoYearsAgo']:
                current_app.logger.info("Match on previous years %d %d" % (rankLastYear, rankTwoYearsAgo))
                # This song looks good if both previous ranks match.
                song = songMatches['lastYear']
            elif self.normalizeString(songMatches['lastYear'].title) == self.normalizeString(song_name):
                current_app.logger.info("Match on 1 year ago song title %s vs %s" % (song_name, songMatches['lastYear'].title))
                # rank last year + title match is good enough.
                song = songMatches['lastYear']

        if not song:
            # Try to use 2 years ago + title.
            if songMatches['twoYearsAgo']:
                if self.normalizeString(songMatches['twoYearsAgo'].title) == self.normalizeString(song_name):
                    current_app.logger.info("Match on 2 years ago song title %s vs %s" % (song_name, songMatches['twoYearsAgo'].title))
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
                current_app.logger.info("No song found for %s by %s" % (song_name, artist_name))
            elif len(songs) == 1:
                current_app.logger.info("One song found for %s by %s" % (song_name, artist_name))
                song = songs[0]
                if song.artist.name != artist_name:
                    print("Artist name doesn't match %s by %s" % (song_name, song.artist.name))
                    song = None
            else:
                current_app.logger.info("Multiple songs found for %s by %s" % (song_name, artist_name))

            if not song:
                # good in this case indicates 2 out of 3 matches from rank last year, 2 years ago and title.
                current_app.logger.info("no good match found for song %s" % song_name)

                # print the whole thing if there is anything to print.
                current_app.logger.info(json.dumps(item, indent=2, separators=(',', ':')))
                if songMatches['lastYear']:
                    current_app.logger.info("Last year %s" % schema.dumps(songMatches['lastYear'], indent=2, separators=(',', ':')))
                else:
                    current_app.logger.info("Last year No song found for rank %s" % str(rankLastYear))
                if songMatches['twoYearsAgo']:
                    current_app.logger.info("2 years ago %s" % schema.dumps(songMatches['twoYearsAgo'], indent=2, separators=(',', ':')))
                else:
                    current_app.logger.info("2 years ago No song found for rank %s" % str(rankTwoYearsAgo))
            else:
                current_app.logger.info("Found song by artist and title %s %s" % (artist_name, song_name))
                current_app.logger.info("Song %s" % schema.dumps(song))

            # TODO would be interesting to see which are None?
            if songMatches['lastYear']:
                # There was a song found for last years rank, but its not a match?
                # Lets create a new song, but we can't set last years rank on it (unique conflict)
                # TODO it might be better to unset the value on the old song?
                current_app.logger.info("%d found song which doesn't match %s" % (rankLastYear, songMatches['lastYear'].title))
                rankLastYear = None
            if songMatches['twoYearsAgo']:
                # There was a song found for 2 years ago rank, but its not a match?
                # Lets create a new song, but we can't set two years ago rank on it (unique conflict)
                # TODO it might be better to unset the value on the old song?
                current_app.logger.info("%d found song which doesn't match %s" % (rankTwoYearsAgo, songMatches['twoYearsAgo'].title))
                rankTwoYearsAgo = None

        if song is not None:
            # TODO use songMatches to figure out the best song?
            # update previous ranks if needed to be able to apply change?
            diff = self.checkMatch(song, item)
            if diff:

                for field, v in diff.items():
                    current_app.logger.info("%s not matching %s %s" % (field, str(v[0]), str(v[1])))

                # TODO if nothing matches then this is suspcious, assume rank is wrong?

                album = Rock1500Album.find_by_name(album_name)
                artist = Rock1500Artist.find_by_name(artist_name)

                if album and artist is not album.artist:
                    # One of these might be wrong?
                    current_app.logger.info("album doesn't match artist")

                schema = Rock1500SongSchema()
                current_app.logger.info("item = %s" % json.dumps(item, indent=2, separators=(',', ':')))
                current_app.logger.info("song = %s" % schema.dumps(song, indent=2, separators=(',', ':')))
                # TODO when reporting to sentry we get errors with orm session.
                # because sentry gives full context, it attempts to use lots of attributes of model objects
                # That leads to DB calls with a session which has already been closed (errors)
                if "title" not in diff:
                    diff['title'] = song.title

                raise Exception("This song looks completely different. Not updating diff = %s" % 
                    json.dumps(diff, indent=2, separators=(',', ':')))

            # This song needs to be updated with its position this year.
            if song.rankThisYear is None:
                current_app.logger.info("Setting rankThisYear %d for %s" % (rankThisYear, song_name))
                song.rankThisYear = rankThisYear
                song.rank2022 = rankThisYear
                self.songsByRank[rankThisYear] = song
                # check for missing information, and update it?
                # At the moment we will do this on the next run. See above.
                db.session.commit()
            else:
                current_app.logger.info("song already has a rankThisYear of %d for %s" % (song.rankThisYear, song_name))
                # Update this song to have the correct rank for this year.
                # Remove from old lookup spot.
                self.songsByRank[song.rankThisYear] = None
                # Add back in the other spot.
                self.songsByRank[rankThisYear] = song
                song.rankThisYear = rankThisYear
                song.rank2022 = rankThisYear
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
                    current_app.logger.info("Artist not found, creating new artist %s" % artist_name)
                    artist = Rock1500Artist(
                        name=artist_name
                    )
                    db.session.add(artist)

                # And create the album too.
                current_app.logger.info("Album not found, creating new album %s" % album_name)
                album = Rock1500Album(
                    name=album_name,
                    artist=artist,
                    cover_art_url=item.get('albumArt')
                )
                try:
                    album.year = item.get('albumYear');
                except ValueError as e:
                    # We will just create the album without year, but log as a warning.
                    current_app.logger.warning("Bad year for album %s" % item.get('albumYear'))
                db.session.add(album)
            # At this point we have an artist and an album, so we can create a song.
            current_app.logger.info("Song not found, creating new song %s" % song_name)
            song = Rock1500Song(
                title=song_name,
                artist=artist,
                album=album,
                rankThisYear=rankThisYear,
                rank2022=rankThisYear,
                rank2021=rankLastYear,
                rank2020=rankTwoYearsAgo,
            )
            db.session.add(song)
            db.session.commit()
            # Because we couldn't find an existing song, we don't need to check this.

    # For comparison purposes only we want to ignore some diff between whats in the DB and what the api gives.
    def normalizeString(self, string):
        # & and And are often switched.
        val = string.lower()
        val = val.replace('&', 'and')
        # / is used to split artists, but and is used as well.
        val = val.replace(' / ', ' and ')
        # Sometimes / has no spaces.
        val = val.replace('/', ' and ')
        # Strip single quotes for things like "I Love Rock 'n' Roll vs I love Rock n Roll"
        val = val.replace("'", '')
        # Remove .'s which can happen. E.g Seether Ft. Amy Lee
        val = val.replace(".", "")
        # Remove spaces. E.g Stone Sour is the same as Stonesour.
        val = val.replace(" ", '')
        # The commonly prefixes artists. E.g The Rolling Stones vs Rolling Stones.
        if val.startswith("the"):
            val = val[3:]
        return val

    def checkMatch(self, song, item):

        if song is None:
            return None

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
        # Look at 5 attributes of the song vs the item.
        # if 2 or less are not matches we can believe this is correct song.
        # E.g song titles and albums commonly change a bit.
        diff = {}
        if song.rank2021 != rankLastYear:
            diff['rankLastYear'] = [song.rank2021, rankLastYear]
        if song.rank2020 != rankTwoYearsAgo:
            diff['rankTwoYearsAgo'] = [song.rank2020, rankTwoYearsAgo]
        if self.normalizeString(song.title) != self.normalizeString(item.get('title')):
            diff['title'] = [song.title, item.get('title')]

        if self.normalizeString(song.artist.name) != self.normalizeString(item.get('artist')):
            # TODO check for combination artists?
            # E.g Bob Seger/The Silver Bullet Band could be 2 artists?
            diff['artist'] = [song.artist.name, item.get('artist')]
        if self.normalizeString(song.album.name) != self.normalizeString(item.get('album')):
            diff['album'] = [song.album.name, item.get('album')]

        if len(diff) > 1:
            # This is not a good match.
            return diff

        # The match is pretty close, so accept it.
        return None

