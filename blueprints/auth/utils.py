from functools import wraps
from flask import session, redirect
import logging

logger = logging.getLogger(__name__)

def isloggedin(f):
    """Authentication decorator for routes"""
    @wraps(f)
    def dummy(*args, **kwargs):
        if 'user' not in session:
            logger.warning("Unauthorized access attempt - user not in session")
            return redirect("/")
        logger.debug(f"Authenticated access by user: {session['user']['email']}")
        return f(*args, **kwargs)
    return dummy