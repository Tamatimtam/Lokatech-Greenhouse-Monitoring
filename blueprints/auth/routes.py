from flask import session, redirect, request, jsonify, current_app
import firebase_admin
from firebase_admin import auth, credentials
import logging
from . import bp
from ..decorators import isloggedin
import re
import time # For rate limiting
import threading # For thread-safe access to rate limit store
# Import for user activity logging
from ..logs.firestore_logger import log_user_activity, UserActionType


logger = logging.getLogger(__name__)

# --- Rate Limiting Configuration ---
LOGIN_ATTEMPTS_LIMIT = 10
LOGIN_WINDOW_SECONDS = 60  # 1 minute
REGISTER_ATTEMPTS_LIMIT = 10 
REGISTER_WINDOW_SECONDS = 3600  # 1 hour
RESET_PASSWORD_ATTEMPTS_LIMIT = 5 # New limit for password reset
RESET_PASSWORD_WINDOW_SECONDS = 3600 # 1 hour, same as registration

_rate_limit_store = {}
_rate_limit_lock = threading.Lock()

def is_rate_limited(ip_address: str, action: str, limit: int, window_seconds: int) -> bool:
    """
    Checks if an IP address is rate-limited for a specific action.
    Returns True if limited, False otherwise.
    Manages timestamps in _rate_limit_store.
    """
    current_time = time.time()
    with _rate_limit_lock:
        # Get or create the entry for the IP address
        ip_data = _rate_limit_store.setdefault(ip_address, {})
        # Get or create the list of timestamps for the action
        timestamps = ip_data.setdefault(action, [])

        # Prune timestamps older than the window
        valid_timestamps = [t for t in timestamps if current_time - t < window_seconds]

        if len(valid_timestamps) >= limit:
            ip_data[action] = valid_timestamps  # Update with pruned list
            return True  # Rate limit exceeded
        else:
            valid_timestamps.append(current_time)
            ip_data[action] = valid_timestamps
            return False # Request allowed

# Basic email regex pattern - improved for common validity
EMAIL_REGEX = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
ALLOWED_DOMAINS = ['lokatani.id', 'mhsw.pnj.ac.id']

@bp.route("/guest", methods=["GET", "POST"])
def guest_login():
    session.permanent = True
    session['user'] = {
        'email': 'tamu@lokagrow.id',
        'name': 'Tamu Demo',
        'picture': 'default_avatar.png',
        'is_guest': True
    }
    session.modified = True
    logger.info("Guest user logged in to demo session")
    return redirect("/dashboard")

@bp.route("/login", methods=["POST"])
# Removed @current_app.limiter.limit decorator
def login():
    ip_address = request.remote_addr
    if is_rate_limited(ip_address, 'login', LOGIN_ATTEMPTS_LIMIT, LOGIN_WINDOW_SECONDS):
        logger.warning(f"Rate limit exceeded for login attempt from IP: {ip_address}")
        log_user_activity(
            username=ip_address, # Use IP as identifier
            action_type=UserActionType.RATE_LIMIT_EXCEEDED,
            event_details={
                "action": "login",
                "limit": f"{LOGIN_ATTEMPTS_LIMIT} requests per {LOGIN_WINDOW_SECONDS}s"
            },
            source="auth_rate_limiter",
            ip_address=ip_address
        )
        return jsonify({'status': 'error', 'message': 'Terlalu banyak percobaan login. Silakan coba lagi nanti.'}), 429
    
    try:
        id_token = request.json['idToken']
        google_user = auth.verify_id_token(id_token, clock_skew_seconds=20)

        session.permanent = True
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
# Removed @current_app.limiter.limit decorator
def register():
    """
    Register a new user by creating them in Firebase.
    The client will then trigger the password setup email.
    """
    ip_address = request.remote_addr
    if is_rate_limited(ip_address, 'register', REGISTER_ATTEMPTS_LIMIT, REGISTER_WINDOW_SECONDS):
        logger.warning(f"Rate limit exceeded for registration attempt from IP: {ip_address}")
        log_user_activity(
            username=ip_address, # Use IP as identifier
            action_type=UserActionType.RATE_LIMIT_EXCEEDED,
            event_details={
                "action": "register",
                "limit": f"{REGISTER_ATTEMPTS_LIMIT} requests per {REGISTER_WINDOW_SECONDS}s" # Updated to reflect new limit
            },
            source="auth_rate_limiter",
            ip_address=ip_address
        )
        return jsonify({'status': 'error', 'message': 'Terlalu banyak percobaan pendaftaran. Silakan coba lagi nanti.'}), 429

    # TODO: Implement CSRF protection
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

@bp.route("/request-password-reset", methods=["POST"])
def request_password_reset():
    ip_address = request.remote_addr
    action = 'reset-password'

    if is_rate_limited(ip_address, action, RESET_PASSWORD_ATTEMPTS_LIMIT, RESET_PASSWORD_WINDOW_SECONDS):
        logger.warning(f"Rate limit exceeded for password reset request from IP: {ip_address}")
        log_user_activity(
            username=ip_address, # Use IP as identifier
            action_type=UserActionType.RATE_LIMIT_EXCEEDED,
            event_details={
                "action": action,
                "limit": f"{RESET_PASSWORD_ATTEMPTS_LIMIT} requests per {RESET_PASSWORD_WINDOW_SECONDS}s"
            },
            source="auth_rate_limiter",
            ip_address=ip_address
        )
        return jsonify({'status': 'error', 'message': 'Terlalu banyak percobaan atur ulang kata sandi. Silakan coba lagi nanti.'}), 429

    try:
        data = request.get_json()
        if not data or 'email' not in data:
            logger.warning("Password reset request with missing email in payload.")
            return jsonify({'status': 'error', 'message': 'Email diperlukan dalam permintaan.'}), 400

        email = data['email'].strip().lower()

        if not email:
            return jsonify({'status': 'error', 'message': 'Email tidak boleh kosong.'}), 400
        
        if not re.fullmatch(EMAIL_REGEX, email):
            logger.warning(f"Password reset request with invalid email format: {email}")
            return jsonify({'status': 'error', 'message': 'Format email tidak valid.'}), 400
        
        # If all checks pass and not rate-limited, allow the client to proceed with Firebase.
        # We log the attempt from our side as well.
        log_user_activity(
            username=email, # Log with the email if available
            action_type=UserActionType.PASSWORD_RESET_REQUESTED, # Changed to more specific type
            event_details={"action": "password_reset_request_allowed", "email_provided": email},
            source="auth_module",
            ip_address=ip_address
        )
        return jsonify({'status': 'success', 'message': 'Permintaan atur ulang kata sandi diterima. Memproses...'})

    except Exception as e:
        logger.error(f"Error processing password reset request data: {str(e)}")
        return jsonify({'status': 'error', 'message': 'Format permintaan tidak valid.'}), 400
