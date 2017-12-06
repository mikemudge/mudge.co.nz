from shared.database import db, BaseModel, UUID

from sqlalchemy.orm import relationship

class Project(BaseModel):
    name = db.Column(db.String)
    base_url = db.Column(db.String)

class FileUrl(BaseModel):
    project_js_id = db.Column(UUID(), db.ForeignKey('project.id', ondelete='CASCADE'))
    project_js = relationship(
        Project,
        foreign_keys=project_js_id,
        backref=db.backref("js_files", lazy="dynamic"))

    project_css_id = db.Column(UUID(), db.ForeignKey('project.id', ondelete='CASCADE'))
    project_css = relationship(
        Project,
        foreign_keys=project_css_id,
        backref=db.backref("css_files", lazy="dynamic"))

    name = db.Column(db.String)
