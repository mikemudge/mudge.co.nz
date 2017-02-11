from functools import wraps

def ensure_user(f):
    @wraps(f)
    def wrapper(*args, **kwds):
        # TODO handle exceptions while checking this?
        user = getCurrentAuth()
        if user:
            return f(user, *args, **kwds)
        else:
            # TODO better responses?
            # return notLoggedIn('Expired credentials, log in again')
            return notLoggedIn('Not Logged In')

    return wrapper

def ensure_admin(f):
    @wraps(f)
    def wrapper(*args, **kwds):
        # TODO handle exceptions while checking this?
        auth = getCurrentAuth()
        if auth and auth.user.email == 'mike.mudge@gmail.com':
            # TODO support a better admin concept.
            return f(auth, *args, **kwds)
        if not auth:
            return notLoggedIn('Not Logged In')
        # TODO check expired or invalid token etc.
        return notLoggedIn('Not an admin')

    return wrapper
