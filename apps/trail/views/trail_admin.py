from shared.admin import get_admin
from shared.admin import BaseView
from shared.database import db

from ..models import Trail, TrailProgress, TrailProfile
from wtforms.fields import SelectField

# Requirements for this API.
# Need to load and display a trail with all profiles on it.
# Need to load all trails + profiles for the current user.
# Need to add progress to a trail for a user.
# TODO consider allowing progress to be added for other profiles?

# Trail admin views.
class TrailProfileView(BaseView):
    column_searchable_list = ['name', 'user.email', 'trail.name']

    column_labels = {
        'user.email': 'User Email',
        'trail.name': 'Trail Name'
    }

    form_extra_fields = {
        'activity': SelectField(label='Activity', choices=TrailProfile.ACTIVITIES),
    }

    def on_form_prefill(self, form, id):
        # Select Fields don't prefill right.
        form.activity.data = form.activity.object_data.code

class TrailView(BaseView):
    column_searchable_list = ['name']

class TrailProgressView(BaseView):
    column_filters = ['trail_profile.user.email']

    column_labels = {
        'trail_profile.user.email': 'User Email'
    }

    column_searchable_list = ['trail_profile.user.email']

def admin_routes(app):
    admin = get_admin(app)

    admin.add_view(TrailView(Trail, db.session, category="Trail"))
    admin.add_view(TrailProgressView(TrailProgress, db.session, category="Trail"))
    admin.add_view(TrailProfileView(TrailProfile, db.session, category="Trail"))
