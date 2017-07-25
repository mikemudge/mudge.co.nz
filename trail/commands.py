from api.models import Walker, Biker
from trail.models import TrailBiker, TrailRide, TrailWalker, TrailWalk
from flask_script import Manager
from shared.database import db
TrailCommand = Manager(usage='Migrate Trail and Biking data')

@TrailCommand.command
def clear_walks():
    # Delete all.
    TrailWalker.query.delete()
    db.session.commit()

@TrailCommand.command
def migrate_walks():

    # Delete all.
    TrailWalker.query.delete()

    walkers = Walker.query.all()
    for walker in walkers:
        print walker.name, walker.color, int(walker.color, 16)
        newWalker = TrailWalker(
            name=walker.name,
            color=int(walker.color, 16)
        )
        db.session.add(newWalker)
        for walk in walker.walks:
            newWalk = TrailWalk(
                distance=float(walk.distance),
                date_created=walk.date
            )
            newWalker.walks.append(newWalk)

    db.session.commit()
    print 'Done'

@TrailCommand.command
def clear_rides():
    # Delete all.
    TrailBiker.query.delete()
    db.session.commit()

@TrailCommand.command
def migrate_rides():

    # Delete all.
    TrailBiker.query.delete()

    bikers = Biker.query.all()
    for biker in bikers:
        print biker.name, biker.color, int(biker.color, 16)
        newBiker = TrailBiker(
            name=biker.name,
            color=int(biker.color, 16)
        )
        db.session.add(newBiker)
        for ride in biker.rides:
            newRide = TrailRide(
                distance=float(ride.distance),
                date_created=ride.date
            )
            newBiker.rides.append(newRide)

    db.session.commit()
    print 'Done'
