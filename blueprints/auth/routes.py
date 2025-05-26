from flask import session, redirect, request, jsonify, current_app # Added current_app
import firebase_admin
from firebase_admin import auth, credentials # Added credentials for type hinting if needed, auth is main
import logging
from . import bp
from ..decorators import isloggedin
import re # For email validation
# Import for user activity logging
from ..logs.firestore_logger import log_user_activity, UserActionType


logger = logging.getLogger(__name__)

# Basic email regex pattern - improved for common validity
EMAIL_REGEX = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
ALLOWED_DOMAINS = ['lokatani.id', 'mhsw.pnj.ac.id']

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

@bp.route("/register", methods=["POST"])
def register():
    """
    Register a new user by creating them in Firebase.
    The client will then trigger the password setup email.
    """
    # TODO: Implement CSRF protection
    # TODO: Implement robust rate limiting
    try:
        data = request.get_json()
        if not data or 'email' not in data:
            logger.warning("Registration attempt with missing email in payload.")
            return jsonify({'status': 'error', 'message': 'Email diperlukan dalam permintaan.'}), 400

        email = data['email'].strip().lower()

        # Server-side validation
        if not email:
            return jsonify({'status': 'error', 'message': 'Email tidak boleh kosong.'}), 400
        
        if not re.fullmatch(EMAIL_REGEX, email):
            logger.warning(f"Registration attempt with invalid email format: {email}")
            return jsonify({'status': 'error', 'message': 'Format email tidak valid.'}), 400

        domain = email.split('@')[-1]
        if domain not in ALLOWED_DOMAINS:
            logger.warning(f"Registration attempt with disallowed domain: {email}")
            return jsonify({'status': 'error', 'message': f"Pendaftaran hanya diizinkan untuk domain: {', '.join(ALLOWED_DOMAINS)}."}), 400

        try:
            # Create user in Firebase. email_verified is False by default.
            firebase_user = auth.create_user(email=email) 
            logger.info(f"User account created successfully in Firebase: {firebase_user.uid} for email {email}")
            
            # Log successful registration
            log_user_activity(
                username=email, # The newly registered email
                action_type=UserActionType.REGISTRATION_SUCCESS,
                event_details={"registered_email": email},
                source="auth_module",
                ip_address=request.remote_addr
            )
            
            # Backend's job is done here for account creation.
            # Client will now trigger the password setup email.
            return jsonify({
                'status': 'success',
                'message': 'Akun berhasil dibuat. Mengirim email pengaturan kata sandi...' # Message for client before it sends email
            }), 200

        except auth.EmailAlreadyExistsError:
            logger.warning(f"Registration attempt for an email that already exists: {email}")
            return jsonify({'status': 'error', 'message': 'Email ini sudah terdaftar. Silakan coba login atau gunakan fitur lupa kata sandi.'}), 409
        except auth.FirebaseAuthError as e:
            logger.error(f"Firebase Authentication error during user creation for {email}: {str(e)}. Code: {getattr(e, 'code', 'N/A')}")
            return jsonify({'status': 'error', 'message': 'Terjadi kesalahan saat membuat akun. Silakan coba lagi.'}), 500
        except Exception as e:
            logger.error(f"Unexpected error during Firebase user creation for {email}: {str(e)}")
            return jsonify({'status': 'error', 'message': 'Terjadi kesalahan internal sistem. Silakan coba lagi nanti.'}), 500

    except Exception as e:
        logger.error(f"Error processing registration request data: {str(e)}")
        return jsonify({'status': 'error', 'message': 'Format permintaan tidak valid.'}), 400
