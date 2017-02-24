from api.models import Walker, Biker
from trail.models import TrailBiker, TrailRide, TrailWalker, TrailWalk
from flask_script import Manager
from shared.database import db
TrailCommand = Manager(usage='Perform user administration')

@TrailCommand.command
def migrateWalks():

    # Delete all.
    TrailWalker.query.delete()

    walkers = Walker.query.all()
    for walker in walkers:
        print walker.name
        newWalker = TrailWalker(name=walker.name)
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
def migrateRides():

    # Delete all.
    TrailBiker.query.delete()

    bikers = Biker.query.all()
    for biker in bikers:
        print biker.name
        newBiker = TrailBiker(name=biker.name)
        db.session.add(newBiker)
        for ride in biker.rides:
            newRide = TrailRide(
                distance=float(ride.distance),
                date_created=ride.date
            )
            newBiker.rides.append(newRide)

    db.session.commit()
    print 'Done'
