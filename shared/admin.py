from flask_admin.contrib.sqla import ModelView
from flask import redirect, url_for, request
from flask_login import current_user
from jinja2 import Markup


def get_admin(app):
    if hasattr(app, 'extensions'):
        if app.extensions.get('admin'):
            admin = app.extensions.get('admin')[0]
            return admin
    return None

class BaseView(ModelView):
    form_excluded_columns = ['date_created']
    can_view_details = True
    can_export = True
    # can_create = True
    # can_edit = True

    def is_accessible(self):
        if not current_user.is_authenticated:
            print("current_user not is_authenticated")
            return False

        return True

    def inaccessible_callback(self, name, **kwargs):
        # redirect to login page if user doesn't have access
        return redirect(url_for('admin.login_view', next=request.url))

    def view_this(view, context, model, name):
        value = getattr(model, name)
        if not value:
            return ''
        pk = getattr(model, 'id')
        if pk:
            print(view)
            endpoint = view.endpoint
            url = view.get_url('%s.details_view' % endpoint, id=pk)
            return Markup('<a href="%s">%s</a>' % (url, value))
        return value

    def format_image(view, context, model, name):
        value = getattr(model, name)
        if not value:
            return ''

        return Markup('<img class="img-admin-list-view" src="%s">' % getattr(model, name))

    def format_color(view, context, model, name):
        value = getattr(model, name)
        if not value:
            return ''

        color = "#%06x" % int(value)
        return Markup('<div style="color: %s">%s</div>' % (color, color))

    def format_datetime(view, context, model, name):
        date = getattr(model, name)
        if not date:
            return ''

        timezone = current_user.get_preferred_timezone()
        # Change date into users preferred time.
        date = date.astimezone(timezone)
        result = date.strftime('%Y-%m-%d %H:%M %Z')
        full = date.strftime('%Y-%m-%d %H:%M:%S.%f %Z')

        return Markup('<span title="%s">%s</span>' % (full, result))

    # Creates a view formatter which links to a details endpoint.
    @classmethod
    def _to_view_url(cls, endpoint):
        def _instance_view_url(view, context, model, name):
            value = getattr(model, name)
            if not value:
                # No profile
                return ''

            return Markup('<a href="%s">%s</a>') % (view.get_url('%s.details_view' % endpoint, id=value.id), value)

        return _instance_view_url

    column_formatters = {
        'date_created': format_datetime,
        'date_updated': format_datetime,
    }
