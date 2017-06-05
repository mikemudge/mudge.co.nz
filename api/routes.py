from api.views.brunch_apps import BrunchAppView, BrunchAppsListView

def routes(app):
    app.add_url_rule('/brunch/', view_func=BrunchAppsListView.as_view('brunch'))
    app.add_url_rule('/brunch/<app_name>/', view_func=BrunchAppView.as_view('brunch_view'))
    app.add_url_rule('/brunch/<app_name>/<path:path>', view_func=BrunchAppView.as_view('brunch_view2'))
