from flask import jsonify, request
from marshmallow.exceptions import ValidationError
from raven.contrib.flask import Sentry

import traceback
import json


sentry = Sentry()

class ErrorCodes:
    MALFORMED_OR_MISSING_BASIC_AUTH = 'MALFORMED_OR_MISSING_BASIC_AUTH'
    UNKNOWN_ERROR = 'UNKNOWN_ERROR'

class BaseException(Exception):
    # allows for a common parent.
    def __init__(self):
        self.status_code = 500
        self.error_code = ErrorCodes.UNKNOWN_ERROR
        pass

class AuthenticationException(BaseException):
    def __init__(self, message, error_code=None):
        Exception.__init__(self)
        self.message = message
        self.error_code = error_code
        self.status_code = 401

class BadRequestException(BaseException):
    def __init__(self, message, error_code=None):
        Exception.__init__(self)
        self.message = message
        self.error_code = error_code
        self.status_code = 400


status_code_messages = {
    404: 'Not found'
}

def registerHandlers(app):

    # An application specific exception has more structure.
    @app.errorhandler(BaseException)
    def handle_known_error(error):
        error_code = ErrorCodes.UNKNOWN_ERROR
        if hasattr(error, 'error_code'):
            error_code = error.error_code
        response = jsonify({
            'message': error.message,
            'status_code': error.status_code,
            'error_code': error_code,
        })
        response.status_code = error.status_code
        return response

    # TODO unused, but here for reference as to what marshmallow 2 did.
    def errorResponse(self, errors):
        # TODO structure this
        response = jsonify(error={
            'errors': errors
        })
        response.status_code = 400
        return response

    # The catch all error handler.
    @app.errorhandler(Exception)
    @app.errorhandler(500)
    def handle_unknown_error(error):
        # Unknown errors should always be 500's
        traceback.print_exc()
        sentry.captureException()
        print(error)
        print('Unknown Exception for route: %s' % request.url)
        response = jsonify({
            'message': str(error),
            'status_code': 500
        })
        response.status_code = 500
        return response

    # Handle the marshmallow Validation errors.
    @app.errorhandler(ValidationError)
    def handle_validation_error(error):
        if app.config.get('DEBUG', False):
            traceback.print_exc()
            print(error)

        invalid_fields = error.normalized_messages()
        response = jsonify({
            'errors': [{
                # This is for generic error handlers. Should prefer field errors for details.
                'message': 'You have some invalid fields\n%s' % json.dumps(invalid_fields),
            }],
            # Errors should be a map of field name to error message.
            'field_errors': invalid_fields
        })
        response.status_code = 400
        return response

    def handle_abort_error(error):
        traceback.print_exc()
        if error.code != 404:
            # So many 404's for random urls.
            sentry.captureException()
        print('abort for route: %s' % request.url)
        message = 'Unknown Error'
        if error.code in status_code_messages:
            message = status_code_messages[error.code]
        response = jsonify({
            'message': message,
            'status_code': error.code
        })
        response.status_code = error.code
        return response

    # called when abort(code) is called.
    app.register_error_handler(401, handle_abort_error)
    app.register_error_handler(403, handle_abort_error)
    app.register_error_handler(404, handle_abort_error)
