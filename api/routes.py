from api.main import main_bp
from api.views.eighti import eighti_bp
from api.views.brunch_apps import BrunchAppView, BrunchAppsListView
from api.views.brunch_apps import ProjectAppView

def routes(app):
    app.add_url_rule('/brunch/', view_func=BrunchAppsListView.as_view('brunch'))
    app.add_url_rule('/brunch/<app_name>/', view_func=BrunchAppView.as_view('brunch_view'))
    app.add_url_rule('/brunch/<app_name>/<path:path>', view_func=BrunchAppView.as_view('brunch_view2'))

    p_view = ProjectAppView.as_view('project_view')
    app.add_url_rule('/projects/<app_name>/', view_func=p_view)
    app.add_url_rule('/projects/<app_name>/<path:path>', view_func=p_view)

    app.register_blueprint(main_bp, url_prefix='')
    app.register_blueprint(eighti_bp, url_prefix='/8i/')
