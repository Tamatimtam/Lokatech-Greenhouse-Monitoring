from functools import wraps
from flask import session, redirect, request, jsonify
import logging

logger = logging.getLogger(__name__)

def isloggedin(f):
    """Authentication decorator for routes"""
    @wraps(f)
    def dummy(*args, **kwargs):
        if 'user' not in session:
            logger.warning(f"Unauthorized access attempt to {request.path} - user not in session")
            if request.path.endswith('/data') or request.is_json or request.headers.get('X-Requested-With') == 'XMLHttpRequest' or 'application/json' in request.headers.get('Accept', ''):
                return jsonify({'status': 'error', 'message': 'Sesi telah berakhir, silakan masuk kembali'}), 401
            return redirect("/")
        logger.debug(f"Authenticated access by user: {session['user'].get('email', 'unknown')}")
        return f(*args, **kwargs)
    return dummy

