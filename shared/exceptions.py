from flask import jsonify

class BaseException(Exception):
    # allows for a common parent.
    def __init__(self, errors):
        self.errors = errors
        # Unknown errors should always be 500's
        self.status_code = 500
        self.response = jsonify(errors=errors)

class ValidationException(BaseException):
    def __init__(self, errors):
        Exception.__init__(self)
        self.errors = errors
        self.status_code = 400
        # TODO structure this?
        self.response = jsonify(errors=errors)

class AuthenticationException(BaseException):
    def __init__(self, errors):
        Exception.__init__(self)
        self.errors = errors
        self.status_code = 400
        # TODO structure this?
        self.response = jsonify(errors=errors)

def registerHandlers(app):

    @app.errorhandler(BaseException)
    def handle_invalid_usage(error):
        response = error.response
        response.status_code = error.status_code
        return response
