from flask_script import Manager
from flask import current_app

from shared.database import db
from auth.models import Client, Scope, User
from apps.trail.models import Trail

InitCommand = Manager(usage='Perform initialization tasks.')

@InitCommand.command
def auth():
    client = Client.create("Web client")
    scopes = {s.name: s for s in Scope.query.all()}
    client.scopes = [
        scopes.get('user', Scope(name='user')),
        scopes.get('basic', Scope(name='basic')),
        scopes.get('profile', Scope(name='profile')),
        scopes.get('rock', Scope(name='rock')),
        scopes.get('trail', Scope(name='trail')),
        scopes.get('tournament', Scope(name='tournament')),
        scopes.get('read_profile', Scope(name='read_profile')),
    ]

    if current_app.config.get('CLIENT_ID'):
        client.client_id = current_app.config.get('CLIENT_ID')
    else:
        print("Make sure you have CLIENT_ID set in your settings/config")

    if current_app.config.get('CLIENT_SECRET'):
        client.client_secret = current_app.config.get('CLIENT_SECRET')
    else:
        print("Make sure you have CLIENT_SECRET set in your settings/config")

    db.session.add(client)
    db.session.commit()


@InitCommand.command
def create_user(email, password=None, admin=False):

    user = User.query.filter_by(email=email).first()

    if not user:
        print("Create new user")
        user = User.create(email=email, password=password)
    else:
        print("Already exists, will update password")
        user.set_password(password)

    # Make sure the user is usable.
    user.is_active = True
    user.admin = admin

    db.session.commit()

@InitCommand.command
def trails():
    trail = Trail(
        name='Te Araroa',
        trail_url='te_araroa_trail.json'
    )
    db.session.add(trail)
    trail = Trail(
        name='Tour Aotearoa',
        trail_url='tour_aotearoa.json'
    )
    db.session.add(trail)
    trail = Trail(
        name='Pacific Coast',
        trail_url='pacific_coast.json'
    )
    db.session.add(trail)

    db.session.commit()
