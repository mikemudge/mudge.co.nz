from dateutil import parser

from api.models import Walker, Biker
from auth.models import Profile, User
from trail.models import Trail, TrailProfile, TrailProgress
from flask_script import Manager
from shared.database import db
from flask import current_app

TrailCommand = Manager(usage='Migrate Trail and Biking data')

@TrailCommand.command
def clear():
    if current_app.config.get('ENV') == 'dev':
        # Delete all.
        Trail.query.delete()
        # Should auto delete all profiles and progresses.
        db.session.commit()
        print('Removed all Trail\'s.')
    else:
        print('Unable to delete all data from none development environment.')

@TrailCommand.command
def init():
    # Ensure there are Trail's for each of the known trails.

    Trail.query.delete()

    db.session.add(Trail(activity=Trail.ACTIVITY_WALK, name='Te Araroa Trail'))
    db.session.add(Trail(activity=Trail.ACTIVITY_BIKE, name='Tour Aotearoa'))
    db.session.commit()

@TrailCommand.command
def migrate():

    # Delete all existing profiles?
    TrailProfile.query.delete()
    walkTrail = Trail.query.filter(Trail.name == 'Te Araroa Trail').first()
    bikeTrail = Trail.query.filter(Trail.name == 'Tour Aotearoa').first()

    walkers = Walker.query.all()
    for walker in walkers:
        print('Existing walker', walker.name, walker.color, int(walker.color, 16))

        user = get_user_for(walker.name)

        # profile
        newWalker = TrailProfile.get_or_create(
            user=user,
            trail=walkTrail,
            color=int(walker.color, 16)
        )
        newWalker.progress = []
        for walk in walker.walks:
            dt = parser.parse(walk.date)

            newWalk = TrailProgress(
                distance=float(walk.distance),
                date_created=dt,
                date=dt.date(),
            )
            newWalker.progress.append(newWalk)

    print('Migrated walkers')

    bikers = Biker.query.all()
    for biker in bikers:
        print('Existing biker', biker.name, biker.color, int(biker.color, 16))

        user = get_user_for(biker.name)

        newBiker = TrailProfile.get_or_create(
            user=user,
            trail=bikeTrail,
            color=int(biker.color, 16)
        )
        newBiker.progress = []
        db.session.add(newBiker)
        for ride in biker.rides:
            dt = parser.parse(ride.date)

            newRide = TrailProgress(
                distance=float(ride.distance),
                date_created=dt,
                date=dt.date(),
            )
            newBiker.progress.append(newRide)

    db.session.commit()
    print('Migrated bikers')
    print('Done')

def get_user_for(full_name):
    names = full_name.split(' ')
    firstname = names[0]

    nameMap = {
        'Julie': 'reddishbaby@gmail.com',
        'Pete': 'melrosemudges@gmail.com',
        'Neil': 'mudge12@gmail.com',
        'Marg': 'marg@mudge.co.nz',
        'Mike': 'mike.mudge@gmail.com',
        'Michael': 'mike.mudge@gmail.com',
    }

    profile = Profile.query.filter(Profile.firstname == firstname).first()
    if not profile:
        if full_name in nameMap:
            lastname = 'Mudge'
            if len(names) > 1:
                lastname = names[1]
            user = User.create(email=nameMap[full_name])
            user.profile.firstname = firstname
            user.profile.lastname = lastname
        else:
            raise Exception('Unknown name ' + full_name)
    else:
        print('Found existing user', profile.user)
        print('Profile', profile)
        return profile.user

    return user
