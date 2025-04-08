from flask import render_template, session, request, jsonify, current_app
from . import bp
from ..decorators import isloggedin
import logging
import firebase_admin
from firebase_admin import auth
import requests  # Add this import

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

@bp.route("/password", methods=["POST"])
@isloggedin
def update_password():
    """
    Update user password in Firebase
    
    Requires current password verification for security and validates 
    that the new password meets strength requirements
    """
    try:
        data = request.json
        current_password = data.get('currentPassword')
        new_password = data.get('newPassword')
        
        # Validate inputs
        if not current_password or not new_password:
            logger.warning(f"Missing password fields in update attempt: {session['user']['email']}")
            return jsonify({'status': 'error', 'message': 'Semua bidang kata sandi diperlukan'}), 400
        
        # Validate new password requirements
        if not validate_password(new_password):
            logger.warning(f"Weak password attempt: {session['user']['email']}")
            return jsonify({'status': 'error', 'message': 'Kata sandi baru tidak memenuhi persyaratan keamanan'}), 400
        
        # Get user email from session
        email = session['user']['email']
        
        try:
            # Get Firebase user by email
            firebase_user = auth.get_user_by_email(email)
            
            # Verify current password using Firebase REST API
            firebase_api_key = current_app.config.get('FIREBASE_API_KEY')
            if not firebase_api_key:
                logger.error("Firebase API key not configured")
                return jsonify({'status': 'error', 'message': 'Konfigurasi server tidak lengkap'}), 500
            
            # Step 1: Verify current password by attempting to sign in
            verify_url = f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={firebase_api_key}"
            verify_data = {
                "email": email,
                "password": current_password,
                "returnSecureToken": True
            }
            
            verify_response = requests.post(verify_url, json=verify_data)
            
            if not verify_response.ok:
                logger.warning(f"Invalid current password attempt: {email}")
                return jsonify({'status': 'error', 'message': 'Kata sandi saat ini tidak valid'}), 401
            
            # Step 2: Update password using Firebase Admin SDK
            auth.update_user(
                firebase_user.uid,
                password=new_password
            )
            
            logger.info(f"Password updated successfully for user: {email}")
            return jsonify({'status': 'success', 'message': 'Kata sandi berhasil diperbarui'})
            
        except auth.UserNotFoundError:
            logger.error(f"User not found in Firebase: {email}")
            return jsonify({'status': 'error', 'message': 'Pengguna tidak ditemukan'}), 404
        except Exception as e:
            logger.error(f"Firebase password update error: {str(e)}")
            return jsonify({'status': 'error', 'message': f'Gagal memperbarui kata sandi'}), 500
    except Exception as e:
        logger.error(f"Password update failed: {str(e)}")
        return jsonify({'status': 'error', 'message': f'Terjadi kesalahan sistem'}), 500

def validate_password(password):
    """
    Validate password meets security requirements:
    - At least 8 characters
    - At least one uppercase letter
    - At least one number
    - At least one special character
    """
    if len(password) < 8:
        return False
        
    if not any(c.isupper() for c in password):
        return False
        
    if not any(c.isdigit() for c in password):
        return False
        
    special_chars = "!@#$%^&*()_+-=[]{}|;:,.<>/?`~"
    if not any(c in special_chars for c in password):
        return False
        
    return True
