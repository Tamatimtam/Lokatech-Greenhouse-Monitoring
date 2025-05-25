from flask import Flask, render_template, session, redirect, request, jsonify
import firebase_admin
from firebase_admin import credentials, auth, firestore # Ensure firestore is imported
import secrets
import os
import json
import logging
from datetime import datetime, timedelta
import re
from flask_socketio import SocketIO, emit
from flask_cors import CORS

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger('GreenhouseApp')

app = Flask(__name__)
CORS(app)
app.secret_key = secrets.token_hex(16)
port = int(os.environ.get('PORT', 4443))

# Extract Firebase API key from firebase-init.js for server-side use
FIREBASE_API_KEY = None
firebase_init_path = os.path.join(app.root_path, 'static', 'js', 'firebase-init.js')
try:
    with open(firebase_init_path, 'r') as f:
        content = f.read()
        match = re.search(r"apiKey:\s*\"([^\"]+)\"", content)
        if match:
            FIREBASE_API_KEY = match.group(1)
            app.config['FIREBASE_API_KEY'] = FIREBASE_API_KEY
            logger.info("Firebase API Key extracted successfully from firebase-init.js")
        else:
            logger.warning("Firebase API Key not found in firebase-init.js")
except FileNotFoundError:
    logger.error(f"firebase-init.js not found at {firebase_init_path}")
except Exception as e:
    logger.error(f"Error extracting Firebase API Key: {e}")

# INIT FIREBASE (Default app)
local_path = os.path.join(os.path.dirname(__file__), "secrets", "firebase-credentials.json")
cloud_path = "/secrets/firebase-credentials.json" # For cloud deployment
credentials_path = local_path if os.path.exists(local_path) else cloud_path

db_client = None # Initialize
try:
    cred = credentials.Certificate(credentials_path)
    if not firebase_admin._apps:
        firebase_admin.initialize_app(cred)
        logger.info("Firebase default app initialized successfully")
    else:
        logger.info("Firebase default app was already initialized.")
    
    db_client = firestore.client() # Get client from the default app
    app.config['FIRESTORE_DB'] = db_client # Still useful for request-bound contexts
    logger.info("Firestore client configured in Flask app config.")

    # --- NEW: INJECT DB CLIENT INTO MODULES ---
    from blueprints.logs import firestore_logger as system_firestore_logger
    from blueprints.history import firestore as history_firestore

    if db_client:
        system_firestore_logger._db = db_client
        # Optionally set project ID if your logger uses it for checks
        # system_firestore_logger._initialized_project_id = db_client.project 
        logger.info("Firestore client injected into system_firestore_logger.")

        history_firestore._db = db_client
        # history_firestore._history_initialized_project_id = db_client.project
        logger.info("Firestore client injected into history_firestore.")
    else:
        logger.error("CRITICAL: db_client is None after Firebase init. Cannot inject into modules.")
    # --- END OF INJECTION ---

except Exception as e:
    logger.error(f"CRITICAL: Failed to initialize Firebase or Firestore client: {e}")
    # The app might not function correctly if db_client is None here.

# Now import modules that might use the logger, like sensor_manager
from blueprints.sensor.mqtt import sensor_manager # This import should now be safe

# System logger for SocketIO (this part is fine, it uses the modified firestore_logger)
try:
    from blueprints.logs.firestore_logger import log_event as system_log_event, LogType as SystemLogType, LogLevel as SystemLogLevel
    app_system_logger_available = True
except ImportError:
    # ... dummy logger setup ...
    pass

socketio = SocketIO(
    app, 
    async_mode='threading',  # Use threading with sync workers
    cors_allowed_origins=[
        "https://codename-amber-341209055572.asia-southeast1.run.app", 
        "http://localhost:4443", 
        "http://127.0.0.1:4443"
    ]
)
sensor_manager.set_socketio(socketio)

# Register blueprints (order here is less critical now for DB access, but keep logical)
from blueprints.auth import bp as auth_bp
from blueprints.dashboard import bp as dashboard_bp
from blueprints.sensor import bp as sensor_bp
from blueprints.plants import bp as plants_bp
from blueprints.profile import bp as profile_bp
from blueprints.history.routes import history as history_bp # Uses history_firestore
from blueprints.logs import logs_bp # Uses system_firestore_logger

app.register_blueprint(auth_bp, url_prefix='/auth')
app.register_blueprint(dashboard_bp)
app.register_blueprint(sensor_bp)
app.register_blueprint(plants_bp)
app.register_blueprint(profile_bp)
app.register_blueprint(history_bp)
app.register_blueprint(logs_bp, url_prefix='/logs')

# ... (rest of your app2.py: SocketIO handlers, root route, if __name__ == '__main__') ...
@socketio.on('connect')
def handle_connect(auth=None): # Add auth=None to accept optional argument
    logger.info(f"Client connected: {request.sid}")

@socketio.on('disconnect')
def handle_disconnect():
    logger.info(f"Client disconnected: {request.sid}")

@app.route("/")
def index():
    return render_template("login.html")

if __name__ == '__main__':
    logger.info(f"Starting Flask-SocketIO application on port {port}")
    socketio.run(app, debug=True, port=port, host='0.0.0.0', use_reloader=False,         allow_unsafe_werkzeug=True )
