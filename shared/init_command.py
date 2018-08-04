from flask_script import Manager
from flask import current_app

from shared.database import db
from auth.models import Client, Scope, User
from apps.trail.models import Trail

InitCommand = Manager(usage='Perform initialization tasks.')

@InitCommand.command
def auth():
    client = Client.create("Web client")
    client.scopes = [
        Scope(name='user'),
        Scope(name='basic'),
        Scope(name='profile'),
        Scope(name='trail'),
        Scope(name='read_profile'),
    ]

    if current_app.config.get('CLIENT_ID'):
        client.client_id = current_app.config.get('CLIENT_ID')
    if current_app.config.get('CLIENT_SECRET'):
        client.client_secret = current_app.config.get('CLIENT_SECRET')

    db.session.add(client)
    db.session.commit()

    print("Make sure you have CLIENT_ID and CLIENT_SECRET set in your local_config")

@InitCommand.command
def create_user(email, password=None):

    user = User.query.filter_by(email=email).first()

    if not user:
        print("Create new user")
        user = User.create(email=email, password=password)
    else:
        print("Already exists, will update password")
        user.set_password(password)

    # Make sure the user is usable.
    user.is_active = True

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
