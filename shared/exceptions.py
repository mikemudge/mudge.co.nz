from flask import jsonify
import traceback


class ErrorCodes:
    MALFORMED_OR_MISSING_BASIC_AUTH = 'MALFORMED_OR_MISSING_BASIC_AUTH'
    UNKNOWN_ERROR = 'UNKNOWN_ERROR'


codes = ErrorCodes()

class BaseException(Exception):
    # allows for a common parent.
    def __init__(self):
        self.status_code = 500
        self.error_code = codes.UNKNOWN_ERROR
        pass

class ValidationException(BaseException):
    def __init__(self, message):
        Exception.__init__(self)
        self.message = message
        self.status_code = 400

class AuthenticationException(BaseException):
    def __init__(self, message, error_code=None):
        Exception.__init__(self)
        self.message = message
        self.error_code = error_code
        self.status_code = 401

def registerHandlers(app):

    # An application specific exception has more structure.
    @app.errorhandler(BaseException)
    def handle_known_error(error):
        error_code = codes.UNKNOWN_ERROR
        if hasattr(error, 'error_code'):
            error_code = error.error_code
        response = jsonify({
            'message': error.message,
            'status_code': error.status_code,
            'error_code': error_code,
        })
        response.status_code = error.status_code
        return response

    # The catch all error handler.
    @app.errorhandler(Exception)
    @app.errorhandler(500)
    def handle_unknown_error(error):
        # Unknown errors should always be 500's
        traceback.print_exc()
        response = jsonify({
            'message': error.message,
            'status_code': 500
        })
        response.status_code = 500
        return response

    def handle_abort_error(error):
        response = jsonify({
            'message': 'Unknown abort error',
            'status_code': error.code
        })
        response.status_code = error.code
        return response

    # called when abort(code) is called.
    app.register_error_handler(401, handle_abort_error)
    app.register_error_handler(403, handle_abort_error)
    app.register_error_handler(404, handle_abort_error)
