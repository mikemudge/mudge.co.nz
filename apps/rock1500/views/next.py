from auth.provider import oauth
from flask import request, current_app
from flask.views import MethodView
from ..models import Rock1500Song
from ..serializers import Rock1500SongSchema

class NextSongsView(MethodView):

    @oauth.require_oauth('rock')
    def get(self):

        # This endpoint attempts to predict the songs coming up.

        query = Rock1500Song.query

        aboveRank = request.args.get('worst_rank', None)
        limit = request.args.get('count', 100)

        if aboveRank is None:
            # Calculate a max from the current count down location.
            mostRecentSong = Rock1500Song.query.order_by(Rock1500Song.rankThisYear).limit(1).first()
            if mostRecentSong and mostRecentSong.rankThisYear:
                current_app.logger.info("Looking for songs based on mostRecentSong rank = %d" % mostRecentSong.rankThisYear)
                if mostRecentSong.rankThisYear <= 1000:
                    # Use double the current song as a limit. Most songs don't move that much.
                    # E.g when at song 100, any song in the top 200 of last year might still play.
                    # And always include the top 100 songs, as we expect those to always be in the countdown.
                    aboveRank = max(mostRecentSong.rankThisYear * 2, 200)
                else:
                    # Estimate from last years songs
                    aboveRank = mostRecentSong.rankThisYear + limit
            else:
                current_app.logger.info("Looking for songs based on mostRecentSong rank = 2000")
                # Use a number to remove all the entries which don't appear in 2018.
                aboveRank = 2001

        if limit > aboveRank:
            current_app.logger.info("Limit %d aboveRank %d" % (limit, aboveRank))
            limit = aboveRank

        if aboveRank is not None:
            current_app.logger.info('Finding songs above %d in 2022' % aboveRank)
            query = query.filter(
                Rock1500Song.rank2022 < aboveRank)

        # Filter out songs which have been played already.
        query = query.filter(
            Rock1500Song.rankThisYear.is_(None))

        # Order by the position they ranked last time.
        query = query.order_by(Rock1500Song.rank2022.desc())

        # And limit so it doesn't do too much work.
        query = query.limit(limit)

        result = query.all()

        schema = Rock1500SongSchema(many=True)

        return schema.response(result)
