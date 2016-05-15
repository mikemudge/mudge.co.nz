import models
import requests
import sys

from models import db
from runner import app

def migrate_walks():
    num_rows_deleted = db.session.query(models.Walk).delete()
    print 'removed %d walks' % num_rows_deleted
    num_rows_deleted = db.session.query(models.Walker).delete()
    print 'removed %d walkers' % num_rows_deleted
    for walker in requests.get('http://mudge.co.nz/stuff/api/walker').json():
        mWalker = models.Walker(name=walker.get('name'), color=walker.get('color'))
        db.session.add(mWalker)
        mWalker.walks = []
        for walk in walker.get('walks', []):
            mWalk = models.Walk(name=walk.get('name'), date=walk.get('date'), distance=walk.get('distance'))
            mWalker.walks.append(mWalk)
        print mWalker.name
        print len(mWalker.walks)

    # Commit the whole thing.
    db.session.commit()
    print "Complete"

if __name__ == "__main__":
    with app.app_context():
        if 'migrate_walks' in sys.argv:
            migrate_walks()
