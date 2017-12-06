from marshmallow import fields
from project_manager.models import Project, FileUrl
from shared.marshmallow import BaseSchema

class FileSchema(BaseSchema):
    class Meta:
        model = FileUrl

class ProjectSchema(BaseSchema):
    class Meta:
        model = Project

    css_files = fields.Nested(FileSchema, many=True)
    js_files = fields.Nested(FileSchema, many=True)
