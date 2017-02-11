from flask import jsonify

class ValidationException(Exception):
    def __init__(self, errors):
        Exception.__init__(self)
        self.errors = errors
        self.status_code = 400
        # TODO structure this?
        self.response = jsonify(errors=errors)

class AuthenticationException(Exception):
    def __init__(self, errors):
        Exception.__init__(self)
        self.errors = errors
        self.status_code = 400
        # TODO structure this?
        self.response = jsonify(errors=errors)

def registerHandlers(app):

    @app.errorhandler(ValidationException)
    def handle_invalid_usage(error):
        response = error.response
        response.status_code = error.status_code
        return response
