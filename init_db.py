import config
import datetime

from app import create_app
from models import db
from models import Biker, Ride, Walker, Walk

def init_all():
    app = create_app(config)
    with app.app_context():
        db.create_all(bind='old_sqlite')
        init_bikers()
        init_walkers()

def init_bikers():
    db.session.add_all([
        Biker(name="Mike", rides=[
            Ride(distance=132, date=datetime.datetime.utcnow().isoformat()),
        ]),
        Biker(name="Test2", rides=[
            Ride(distance=100, date=datetime.datetime.utcnow().isoformat()),
            Ride(distance=242, date=datetime.datetime.utcnow().isoformat()),
        ])
    ])
    db.session.commit()

def init_walkers():
    db.session.add_all([
        Walker(name="Mike", walks=[
            Walk(distance=132, date=datetime.datetime.utcnow().isoformat()),
        ]),
        Walker(name="Test2", walks=[
            Walk(distance=100, date=datetime.datetime.utcnow().isoformat()),
            Walk(distance=242, date=datetime.datetime.utcnow().isoformat()),
        ])
    ])
    db.session.commit()

if __name__ == '__main__':
    init_all()
