from api.models import Walker
from trail.models import TrailWalker, TrailWalk
from flask_script import Manager

TrailCommand = Manager(usage='Perform user administration')

@TrailCommand.command
def migrateWalks(force=False):

    # Delete all.
    TrailWalker.query.delete()

    walkers = Walker.query.all()
    for walker in walkers:
        print walker.name
        newWalker = TrailWalker(walker.name)
        for walk in walker.walks:
            newWalk = TrailWalk(distance=float(walk.distance))
            newWalker.walks.append(newWalk)

    print 'Done'
