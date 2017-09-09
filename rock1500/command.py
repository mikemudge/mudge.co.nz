from flask_script import Manager
from shared.database import db
from rock1500.models import Rock1500Pick, Rock1500Song, Rock1500Artist

Command = Manager(usage='Perform rock1500 tasks.')

@Command.command
def init(reset=False):
    if reset:
        Rock1500Artist.query.delete()
        Rock1500Pick.query.delete()
        Rock1500Song.query.delete()

    # TODO only add if not exists?
    metallica = Rock1500Artist(name="Metallica")
    one = Rock1500Song(title="One", artist=metallica)

    db.session.add(one)

    db.session.commit()
