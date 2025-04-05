from flask import render_template, session, request, jsonify
from . import bp
from ..decorators import isloggedin
import logging
import firebase_admin
from firebase_admin import auth

logger = logging.getLogger(__name__)

@bp.route("/")
@isloggedin
def profile():
    logger.debug(f"Serving profile page for user: {session['user']['email']}")
    return render_template("profile.html", user=session['user'])

@bp.route("/update", methods=["POST"])
@isloggedin
def update_profile():
    try:
        data = request.json
        display_name = data.get('displayName')
        
        if not display_name or not display_name.strip():
            logger.warning(f"Invalid display name attempt: {session['user']['email']}")
            return jsonify({'status': 'error', 'message': 'Nama tampilan tidak boleh kosong'}), 400
        
        # Get user email from session
        email = session['user']['email']
        
        try:
            # Get Firebase user by email (correct method)
            firebase_user = auth.get_user_by_email(email)
            
            # Update Firebase user display name
            auth.update_user(
                firebase_user.uid,
                display_name=display_name
            )
            
            # Update session
            session['user']['name'] = display_name
            session.modified = True
            
            logger.info(f"Profile updated for user: {email}, new name: {display_name}")
            return jsonify({'status': 'success', 'message': 'Profil berhasil diperbarui'})
        except auth.UserNotFoundError:
            logger.error(f"User not found in Firebase: {email}")
            return jsonify({'status': 'error', 'message': 'Pengguna tidak ditemukan'}), 404
    except Exception as e:
        logger.error(f"Profile update failed: {str(e)}")
        return jsonify({'status': 'error', 'message': f'Gagal memperbarui profil: {str(e)}'}), 500
