from api.main import main_bp
from api.views.eighti import eighti_bp
from api.views.apps import ProjectAppView, ProjectsShellView, ProjectAppsApiView, ProjectV2View

def routes(app):

    p_view = ProjectAppView.as_view('project_view')

    app.add_url_rule('/projects/', view_func=ProjectsShellView.as_view(
        'projects', status='done', show_apps=True, title='Projects'))
    app.add_url_rule('/projects/<app_name>/', view_func=p_view)
    app.add_url_rule('/projects/<app_name>/<path:path>', view_func=p_view)

    app.add_url_rule('/workshop/', view_func=ProjectsShellView.as_view(
        'workshop', status='wip', show_apps=True, title='Workshop',
        back_link='/projects/', back_link_label='Finished projects'))

    app.add_url_rule('/api/projects/apps', view_func=ProjectAppsApiView.as_view('projects_apps_api'))

    app.add_url_rule('/games/', view_func=ProjectsShellView.as_view(
        'games', status='done', show_apps=False, title='Games'))
    app.add_url_rule('/games/<path:path>', view_func=ProjectV2View.as_view('game_app'))

    app.register_blueprint(main_bp, url_prefix='')
    app.register_blueprint(eighti_bp, url_prefix='/8i/')
