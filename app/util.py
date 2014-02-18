from flask import request, flash, redirect, g
from database import Session, redis
from functools import wraps
from dateutil.relativedelta import relativedelta

def flashy(m, f="error", u="/"):
    flash(m, f)
    return redirect(u)

class DummyObj(object):
    def __init__(self, kwargs):
        self.__dict__.update(kwargs)

    def __getattr__(self, name):
        return None

def require(**need):
    result, missing = {}, False
    for k, v in need.items():
        if k not in request.values:
            missing = True
            continue
        try:
            result[k] = v(request.values.get(k))
        except:
            missing = True
    return DummyObj(result), not missing

def authed(level=0, err=None):
    def deco(f):
        @wraps(f)
        def _f(*args, **kwargs):
            if not g.user:
                return err() if err else "Error!", 400
            return f(*args, **kwargs)
        return _f
    return deco

def server():
    def deco(f):
        @wraps(f)
        def _f(*args, **kwargs):
            if not g.server:
                return jsonify({"success": False, "error": 3, "msg": "Invalid Server Session!"})
            return f(*args, **kwargs)
        return _f
    return deco

def limit(per_minute):
    """
    Enables ratelimiting for an endpoint, is ALWAYS ignored for server
    requests.
    """
    def deco(f):
        @wraps(f)
        def _f(*args, **kwargs):
            if not g.server:
                # TODO: this could be used as a DoS attack by filling up
                #  redis. Maybe add global rate limiting?
                k = "rl:%s_%s" % (f.__name__, request.remote_addr)
                if not redis.exists(k):
                    redis.setex(k, 1, 60)
                    return f(*args, **kwargs)
                if int(redis.get(k)) > per_minute:
                    return "Too many requests per minute!", 429
                redis.incr(k)
            return f(*args, **kwargs)
        return _f
    return deco

attrs = ['years', 'months', 'days', 'hours', 'minutes', 'seconds']
human_readable = lambda delta: ['%d %s' % (getattr(delta, attr), getattr(delta, attr) > 1 and attr or attr[:-1]) for attr in attrs if getattr(delta, attr)]