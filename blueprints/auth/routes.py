from flask import session, redirect, request, jsonify
import firebase_admin
from firebase_admin import auth
import logging
from . import bp
from ..decorators import isloggedin

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

@bp.route("/logout", methods=["GET", "POST"])
def logout():
    """
    Log out the current user by clearing their session
    Supports both GET (direct link) and POST (AJAX request) methods for flexibility
    """
    if 'user' in session:
        logger.info(f"User logged out: {session['user']['email']}")
    
    session.clear()
    
    # Return JSON response for AJAX requests
    if request.method == "POST":
        return jsonify({'status': 'success', 'message': 'Berhasil keluar'})
    
    # Redirect for direct link access
    return redirect("/")
