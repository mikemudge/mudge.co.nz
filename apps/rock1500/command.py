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
def import2016():
    import csv
    with open('apps/rock1500/data/Rock 1500 - 2016.csv', 'r') as csvfile:
        csvdata = csv.reader(csvfile)
        count = 0
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
            song.rank2016 = row[0]
            song.rank2015 = row[3]

        print('found %d new songs' % count)
        db.session.commit()
