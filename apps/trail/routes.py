from .views.trail import TrailView
from .views.trail_profile import TrailProfileView
from .views.trail_progress import TrailProgressView

def routes(app):
    # REST endpoints for trail, profile and progress.
    app.add_url_rule('/api/trail/v1/trail', view_func=TrailView.as_view('trail-list'))
    app.add_url_rule('/api/trail/v1/trail/<pk>', view_func=TrailView.as_view('trail'))
    app.add_url_rule('/api/trail/v1/profile', view_func=TrailProfileView.as_view('trail-profile-list'))
    app.add_url_rule('/api/trail/v1/profile/<pk>', view_func=TrailProfileView.as_view('trail-profile'))
    app.add_url_rule('/api/trail/v1/progress', view_func=TrailProgressView.as_view('trail-progress-list'))
    app.add_url_rule('/api/trail/v1/progress/<pk>', view_func=TrailProgressView.as_view('trail-progress'))
