from flask_script import Manager
from shared.database import db
from rock1500.models import Rock1500Pick, Rock1500Song, Rock1500Artist, Rock1500Album

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
def init(reset_forced=False):
    if reset_forced:
        reset()
        # The order of these is important.
        Rock1500Pick.query.delete()
        Rock1500Song.query.delete()
        Rock1500Album.query.delete()
        Rock1500Artist.query.delete()

    # TODO only add if not exists?
    metallica = Rock1500Artist(name="Metallica")
    album = Rock1500Album(
        name='...And Justice for All', artist=metallica
    )
    one = Rock1500Song(
        title="One", artist=metallica, album=album
    )

    db.session.add(one)

    db.session.commit()

@Command.command
def import2016():
    import csv
    with open('rock1500/data/Rock 1500 - 2016.csv', 'rb') as csvfile:
        spamreader = csv.reader(csvfile)
        count = 0
        for row in spamreader:
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
                    rank2017=None,
                    rank2016=row[0],
                    rank2015=row[3],
                )
                db.session.add(song)
        print 'found %d new songs' % count
        db.session.commit()
