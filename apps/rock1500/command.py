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
def consolidateAlbums():
    # Find any albums with 0 songs and remove them all.
    query = Rock1500Album.query.filter(~Rock1500Album.songs.any())
    for album in query.all():
        print('Album', album.name, len(album.songs))
        db.session.delete(album)
    db.session.commit()

    # TODO find and deduplicate other albums?

@Command.command
def consolidateArtists():
    # Find any albums with 0 songs and remove them all.
    query = Rock1500Artist.query.filter(~Rock1500Artist.songs.any())
    for artist in query.all():
        print('Artist', artist.name, len(artist.songs))
        db.session.delete(artist)
    db.session.commit()

    # TODO find and deduplicate other artists?

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

            rank2016 = int(row[0])
            try:
                rank2015 = int(row[3])
            except ValueError:
                rank2015 = None
            try:
                rank2014 = int(row[4])
            except ValueError:
                rank2014 = None

            song = Rock1500Song.query.filter_by(rank2016=rank2016).first()
            if not song:
                song = Rock1500Song.query.filter_by(rank2015=rank2015).first()

            if song:
                # Found the song does it need an update?
                # Villainy Another time looked corrupt with duplicate rank2015=930 and rank2014=764
                updated += 1
                if song.rank2015 != rank2015:
                    print("rank2015 looks wrong", song.rank2015, rank2015)
                if song.rank2014 != rank2014:
                    song.rank2014 = rank2014
            else:
                # Need to create the song?
                album = Rock1500Album.find_by_name(name=row[5])
                if album:
                    artist = album.artist
                else:
                    # Try and load the artist from the DB.
                    artist = Rock1500Artist.find_by_name(name=row[1])
                    if not artist:
                        print ("Need to create a new artist", row[1])
                        # TODO this might work better if we used dedupe tactics?
                        continue
                        artist = Rock1500Artist(name=row[1])

                    print ("Need to create a new album", row[5])
                    # TODO this might work better if we used dedupe tactics?
                    continue
                    album = Rock1500Album(
                        artist=artist,
                        name=row[5],
                        year=row[6]
                    )

                # Try and find a song with the same name.
                # We would expect to of found it by looking up rank first.
                song = Rock1500Song.find_by_name(
                    title=row[2],
                    artist=artist)
                if not song:
                    count += 1
                    print ("Need to create a new song", row[2])
                    continue
                    song = Rock1500Song(
                        album=album,
                        artist=artist,
                        title=row[2],
                        rank2015=rank2015,
                        rank2016=rank2016
                    )
                    db.session.add(song)

        print('found %d new songs' % count)
        print('updated %d songs' % updated)
        db.session.commit()
