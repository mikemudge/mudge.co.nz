from api.main import main_bp
from api.views.eighti import eighti_bp
from api.views.apps import ProjectAppView, ProjectAppsListView, ProjectV2View

def routes(app):

    p_view = ProjectAppView.as_view('project_view')
    list_view = ProjectAppsListView.as_view('projects')
    app.add_url_rule('/projects/', view_func=list_view)
    app.add_url_rule('/projects/<app_name>/', view_func=p_view)
    app.add_url_rule('/projects/<app_name>/<path:path>', view_func=p_view)

    app.add_url_rule('/games/', view_func=list_view)
    app.add_url_rule('/games/<path:path>', view_func=ProjectV2View.as_view('games'))

    app.register_blueprint(main_bp, url_prefix='')
    app.register_blueprint(eighti_bp, url_prefix='/8i/')
