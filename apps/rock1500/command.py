from flask_script import Manager
from shared.database import db
from .models import Rock1500Pick, Rock1500Song, Rock1500Artist, Rock1500Album

Command = Manager(usage='Perform rock1500 tasks.')

@Command.command
def reset():
    # The order of these is important.
    Rock1500Pick.query.delete()
    Rock1500Song.query.delete()
    Rock1500Album.query.delete()
    Rock1500Artist.query.delete()

    db.session.commit()

@Command.command
def importLatest():
    # Importing this at the start breaks the webserver.
    # I don't understand the error it gives well though.
    from .views.importer import ImportView

    result = ImportView().updateDB()
    if result:
        return

@Command.command
def consolidate2017():
    # Find songs which are missing a rank for 2017, which match another song with the same rank2016
    query = Rock1500Song.query
    query = query.order_by(Rock1500Song.rank2016)
    query = query.filter(Rock1500Song.rank2016.isnot(None))
    # And its missing any newer ranks.
    query = query.filter(Rock1500Song.rank2017.is_(None))
    query = query.filter(Rock1500Song.rank2018.is_(None))

    for song in query.all():
        songs = Rock1500Song.query.filter(Rock1500Song.rank2016 == song.rank2016).all()
        if len(songs) > 1:
            print('%s has a duplicate' % song.title)

            # Set otherSong conditionally so it doesn't match the existing song.
            otherSong = songs[0]
            if otherSong.id == song.id:
                otherSong = songs[1]

            print('Duplicate is %s' % otherSong.title)

            song1 = song
            song2 = otherSong

            # We already know rank2016 is the same from the query.
            print('update rank2015', song2.rank2018, song2.rank2017, song2.rank2016, song1.rank2015)
            print('delete song which is missing rank for 2017 and 2018 because we merged it into song2')
            song2.rank2015 = song1.rank2015
            db.session.delete(song1)
            print('')
    db.session.commit()

@Command.command
def migrateRankTo2018():
    # This will initialize the rank2018 field using rank (from last year).
    # It will also unset the rank for this year's countdown.
    for song in Rock1500Song.query.order_by(Rock1500Song.rankThisYear).all():
        if song.rank2019:
            # This song has already been updated for this year.
            # Its rankThisYear will be for 2019 already.
            continue
        if not song.rank2018 and song.rankThisYear:
            print("Update rank2018 for %s to %d" % (song.title, song.rankThisYear))
            song.rank2018 = song.rankThisYear
            song.rankThisYear = None
    db.session.commit()

@Command.command
def import2016():
    import csv
    with open('apps/rock1500/data/Rock 1500 - 2016.csv', 'r') as csvfile:
        csvdata = csv.reader(csvfile)
        count = 0
        updated = 0
        print("Parsing songs from csv...")
        for row in csvdata:
            if row[0].strip() == '#':
                # Skip the first row.
                continue

            artist = Rock1500Artist.find_by_name(name=row[1])
            if not artist:
                artist = Rock1500Artist(name=row[1])

            album = Rock1500Album.find_by_name(name=row[5])
            if not album:
                album = Rock1500Album(
                    artist=artist,
                    name=row[5],
                    year=row[6]
                )
            song = Rock1500Song.find_by_name(
                title=row[2],
                artist=artist)
            if not song:
                count += 1
                song = Rock1500Song(
                    album=album,
                    artist=artist,
                    title=row[2],
                )
                db.session.add(song)
            updated += 1
            song.set2016Rank(row[0])
            song.set2015Rank(row[3])

        print('found %d new songs' % count)
        print('updated %d songs' % updated)
        db.session.commit()
