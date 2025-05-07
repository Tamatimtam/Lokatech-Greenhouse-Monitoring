from flask import render_template, session, request, jsonify, current_app, redirect
from . import bp
from ..decorators import isloggedin
import logging
import firebase_admin
from firebase_admin import auth
import requests

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

# The update_password route below is removed as the password change flow
# is now handled by sending a reset email via Firebase client-side SDK.

@bp.route("/delete", methods=["POST"])
@isloggedin
def delete_account():
    """
    Permanently delete a user account
    
    Requires password verification for security
    """
    try:
        data = request.json
        password = data.get('password')
        
        # Validate password is provided
        if not password:
            logger.warning(f"Missing password in delete account attempt: {session['user']['email']}")
            return jsonify({'status': 'error', 'message': 'Kata sandi diperlukan untuk konfirmasi'}), 400
        
        # Get user email from session
        email = session['user']['email']
        
        try:
            # Get Firebase user by email
            firebase_user = auth.get_user_by_email(email)
            
            # Verify password using Firebase REST API
            firebase_api_key = current_app.config.get('FIREBASE_API_KEY')
            if not firebase_api_key:
                logger.error("Firebase API key not configured")
                return jsonify({'status': 'error', 'message': 'Konfigurasi server tidak lengkap'}), 500
            
            # Step 1: Verify password by attempting to sign in
            verify_url = f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={firebase_api_key}"
            verify_data = {
                "email": email,
                "password": password,
                "returnSecureToken": True
            }
            
            verify_response = requests.post(verify_url, json=verify_data)
            
            if not verify_response.ok:
                logger.warning(f"Invalid password in delete account attempt: {email}")
                return jsonify({'status': 'error', 'message': 'Kata sandi tidak valid'}), 401
            
            # Step 2: Delete user account using Firebase Admin SDK
            auth.delete_user(firebase_user.uid)
            
            # Clear user session
            session.clear()
            
            logger.info(f"User account deleted successfully: {email}")
            return jsonify({'status': 'success', 'message': 'Akun berhasil dihapus'})
            
        except auth.UserNotFoundError:
            logger.error(f"User not found in Firebase: {email}")
            return jsonify({'status': 'error', 'message': 'Pengguna tidak ditemukan'}), 404
        except Exception as e:
            logger.error(f"Firebase account deletion error: {str(e)}")
            return jsonify({'status': 'error', 'message': f'Gagal menghapus akun'}), 500
    except Exception as e:
        logger.error(f"Account deletion failed: {str(e)}")
        return jsonify({'status': 'error', 'message': f'Terjadi kesalahan sistem'}), 500

# The validate_password function below is removed as it was only used by the
# now-removed update_password route.
