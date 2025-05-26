from flask import render_template, session, request, jsonify, current_app, redirect
from . import bp
from ..decorators import isloggedin
import logging
import firebase_admin
from firebase_admin import auth
import requests
# Import for user activity logging
from ..logs.firestore_logger import log_user_activity, UserActionType

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
        new_display_name = data.get('displayName')
        
        if not new_display_name or not new_display_name.strip():
            logger.warning(f"Invalid display name attempt: {session['user']['email']}")
            return jsonify({'status': 'error', 'message': 'Nama tampilan tidak boleh kosong'}), 400
        
        email = session['user']['email']
        old_display_name = session['user'].get('name', '') # Capture old display name

        try:
            firebase_user = auth.get_user_by_email(email)
            
            auth.update_user(
                firebase_user.uid,
                display_name=new_display_name
            )
            
            session['user']['name'] = new_display_name
            session.modified = True
            
            # Log profile update activity
            log_user_activity(
                username=email,
                action_type=UserActionType.PROFILE_UPDATE,
                event_details={
                    "field_updated": "displayName",
                    "old_value": old_display_name,
                    "new_value": new_display_name
                },
                source="profile_module",
                ip_address=request.remote_addr
            )
            
            logger.info(f"Profile updated for user: {email}, new name: {new_display_name}")
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
    email = session['user']['email'] # Get email early for logging
    try:
        data = request.json
        password = data.get('password')
        
        if not password:
            logger.warning(f"Missing password in delete account attempt: {email}")
            # Log failed deletion attempt (missing password) - though this might be too noisy.
            # Consider if logging every validation failure is necessary.
            # For now, let's stick to the spec: log on failed deletion due to invalid password.
            return jsonify({'status': 'error', 'message': 'Kata sandi diperlukan untuk konfirmasi'}), 400
        
        try:
            firebase_user = auth.get_user_by_email(email)
            
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
                # Log failed deletion attempt (invalid password)
                log_user_activity(
                    username=email,
                    action_type=UserActionType.ACCOUNT_DELETED,
                    event_details={
                        "status": "failure",
                        "reason": "invalid_password",
                        "attempted_account_email": email
                    },
                    source="profile_module",
                    ip_address=request.remote_addr
                )
                return jsonify({'status': 'error', 'message': 'Kata sandi tidak valid'}), 401
            
            # Step 2: Delete user account using Firebase Admin SDK
            auth.delete_user(firebase_user.uid)
            
            # Log successful deletion
            log_user_activity(
                username=email, # Username here is the email of the deleted account
                action_type=UserActionType.ACCOUNT_DELETED,
                event_details={
                    "status": "success",
                    "deleted_account_email": email 
                },
                source="profile_module",
                ip_address=request.remote_addr
            )
            
            session.clear()
            
            logger.info(f"User account deleted successfully: {email}")
            return jsonify({'status': 'success', 'message': 'Akun berhasil dihapus'})
            
        except auth.UserNotFoundError:
            logger.error(f"User not found in Firebase: {email}")
            # Potentially log this as a system error rather than user activity if it implies inconsistency
            return jsonify({'status': 'error', 'message': 'Pengguna tidak ditemukan'}), 404
        except Exception as e:
            logger.error(f"Firebase account deletion error: {str(e)}")
            # Log failed deletion attempt (other error)
            log_user_activity(
                username=email,
                action_type=UserActionType.ACCOUNT_DELETED,
                event_details={
                    "status": "failure",
                    "reason": f"firebase_error: {str(e)}",
                    "attempted_account_email": email
                },
                source="profile_module",
                ip_address=request.remote_addr
            )
            return jsonify({'status': 'error', 'message': f'Gagal menghapus akun'}), 500
    except Exception as e:
        logger.error(f"Account deletion failed: {str(e)}")
        # Generic error, consider if logging is needed here or if above catches are sufficient
        return jsonify({'status': 'error', 'message': f'Terjadi kesalahan sistem'}), 500

# The validate_password function below is removed as it was only used by the
# now-removed update_password route.
