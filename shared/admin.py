from auth.custom_flask_admin import CustomAdminIndexView
from flask_admin.contrib.sqla import ModelView
from flask_admin import Admin
from flask_login import current_user
from jinja2 import Markup


admin = Admin(
    name='Mudge.co.nz',
    # name='Home',
    index_view=CustomAdminIndexView(
        url='/flask-admin',
        endpoint='admin'
    ),
    template_mode='bootstrap3',
    static_url_path="static",
    base_template='admin/master.html'
)

class BaseView(ModelView):
    form_excluded_columns = ['date_created']
    can_view_details = True
    can_export = True
    # can_create = True
    # can_edit = True

    def is_accessible(self):
        if not current_user.is_authenticated:
            return False

        return True

    def format_image(view, context, model, name):
        value = getattr(model, name)
        if not value:
            return ''

        return Markup('<img class="img-admin-list-view" src="%s">' % getattr(model, name))

    def format_datetime(view, context, model, name):
        date = getattr(model, name)
        if not date:
            return ''

        timezone = current_user.get_preferred_timezone()
        # Change date into users preferred time.
        date = date.astimezone(timezone)
        result = date.strftime('%Y-%m-%d %H:%M %Z')
        return result

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
