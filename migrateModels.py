# import models
# import requests
# import sys

# from models import db
# from runner import app

# def migrate_walks():
#     num_rows_deleted = db.session.query(models.Walk).delete()
#     print 'removed %d walks' % num_rows_deleted
#     num_rows_deleted = db.session.query(models.Walker).delete()
#     print 'removed %d walkers' % num_rows_deleted
#     for walker in requests.get('http://111.65.227.116/stuff/api/walker').json():
#         mWalker = models.Walker(name=walker.get('name'), color=walker.get('color'))
#         db.session.add(mWalker)
#         mWalker.walks = []
#         for walk in walker.get('walks', []):
#             mWalk = models.Walk(name=walk.get('name'), date=walk.get('date'), distance=walk.get('distance'))
#             mWalker.walks.append(mWalk)
#         print mWalker.name
#         print len(mWalker.walks)

#     # Commit the whole thing.
#     db.session.commit()
#     print "Complete"

# def migrate_rides():
#     num_rows_deleted = db.session.query(models.Ride).delete()
#     print 'removed %d rides' % num_rows_deleted
#     num_rows_deleted = db.session.query(models.Biker).delete()
#     print 'removed %d bikers' % num_rows_deleted
#     for biker in requests.get('http://111.65.227.116/stuff/api/biker').json():
#         mBiker = models.Biker(name=biker.get('name'), color=biker.get('color'))
#         db.session.add(mBiker)
#         mBiker.rides = []
#         for ride in biker.get('rides', []):
#             mRide = models.Ride(name=ride.get('name'), date=ride.get('date'), distance=ride.get('distance'))
#             mBiker.rides.append(mRide)
#         print mBiker.name
#         print len(mBiker.rides)

#     # Commit the whole thing.
#     db.session.commit()
#     print "Complete"

# if __name__ == "__main__":
#     with app.app_context():
#         if 'migrate_walks' in sys.argv:
#             migrate_walks()
#         if 'migrate_rides' in sys.argv:
#             migrate_rides()
