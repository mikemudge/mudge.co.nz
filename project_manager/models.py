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

    @classmethod
    def get(cls, name):
        file = FileUrl.query.filter_by(name=name).first()
        if not file:
            file = FileUrl(name=name)
            db.session.add(file)

        return file

    def __repr__(self):
        return self.name
