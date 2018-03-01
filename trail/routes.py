from trail.views.trail import TrailView
from trail.views.trail_profile import TrailProfileView
from trail.views.trail_progress import TrailProgressView

# Requirements for this API.
# Need to load and display a trail with all profiles on it.
# Need to load all trails + profiles for the current user.
# Need to add progress to a trail for a user.
# TODO consider allowing progress to be added for other profiles?

def routes(app):
    app.add_url_rule('/api/trail/v1/trail', view_func=TrailView.as_view('trail-list'))
    app.add_url_rule('/api/trail/v1/trail/<pk>', view_func=TrailView.as_view('trail'))
    app.add_url_rule('/api/trail/v1/profile', view_func=TrailProfileView.as_view('trail-profile-list'))
    app.add_url_rule('/api/trail/v1/profile/<pk>', view_func=TrailProfileView.as_view('trail-profile'))

    # Add progress to a trail.
    app.add_url_rule('/api/trail/v1/progress', view_func=TrailProgressView.as_view('trail-progress-list'))
    app.add_url_rule('/api/trail/v1/progress/<pk>', view_func=TrailProgressView.as_view('trail-progress'))
