from flask import session, redirect, request, jsonify
import firebase_admin
from firebase_admin import auth
import logging
from . import bp
from .utils import isloggedin

logger = logging.getLogger(__name__)

@bp.route("/login", methods=["POST"])
def login():
    try:
        id_token = request.json['idToken']
        google_user = auth.verify_id_token(id_token, clock_skew_seconds=20)
        
        session['user'] = {
            'email': google_user['email'],
            'name': google_user.get('name', google_user['email'].split('@')[0]),
            'picture': google_user.get('picture', 'default_avatar.png')
        }
        session.modified = True
        
        logger.info(f"User logged in successfully: {session['user']['email']}")
        return {'status': 'success'}
    except Exception as e:
        logger.error(f"Login failed: {str(e)}")
        return {'status': 'error', 'message': 'Invalid credentials'}, 400

@bp.route("/logout")
def logout():
    if 'user' in session:
        logger.info(f"User logged out: {session['user']['email']}")
    session.clear()
    return redirect("/")

@bp.route("/session-test")
def session_test():
    if 'user' in session:
        logger.debug(f"Session test - user authenticated: {session['user']['email']}")
        return f"Logged in as {session['user']['email']}"
    logger.debug("Session test - no user authenticated")
    return "Not logged in"