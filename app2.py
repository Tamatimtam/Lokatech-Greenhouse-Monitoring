from flask import Flask, render_template, session, redirect, request, jsonify
import firebase_admin
from firebase_admin import credentials, auth
import secrets
import os
import json
import logging
from datetime import datetime, timedelta
import re
from flask_socketio import SocketIO, emit # Added emit for completeness
from flask_cors import CORS # Import CORS
from blueprints.sensor.mqtt import sensor_manager # Import the globally managed instance

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('app.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger('GreenhouseApp')

# Attempt to import system logger for SocketIO events
try:
    from blueprints.logs.firestore_logger import log_event as system_log_event, LogType as SystemLogType, LogLevel as SystemLogLevel
    app_system_logger_available = True
except ImportError:
    app_system_logger_available = False
    class SystemLogType: CONNECTION_LOST="CONNECTION_LOST"; CONNECTION_RESTORED="CONNECTION_RESTORED" # Dummy
    class SystemLogLevel: INFO="INFO"; WARNING="WARNING" # Dummy
    def system_log_event(log_type, level, node=None, sensor_type=None, details=None, source=None): logger.warning(f"[DUMMY_APP_SYS_LOG] Type: {log_type}, Level: {level}, Node: {node}, Details: {details}, Source: {source}")


# INIT FLASK
app = Flask(__name__)
CORS(app) # Enable CORS for all routes and origins by default
          # For production, you might want to restrict origins: CORS(app, resources={r"/auth/*": {"origins": "your_frontend_domain.com"}})
app.secret_key = secrets.token_hex(16)
port = int(os.environ.get('PORT', 4443))

# Initialize SocketIO - async_mode='threading' is often easiest to start with
socketio = SocketIO(app, async_mode='threading', cors_allowed_origins=["https://codename-amber-341209055572.asia-southeast1.run.app", "http://localhost:4443", "http://127.0.0.1:4443"])


# Provide the socketio instance to the sensor manager
sensor_manager.set_socketio(socketio)

# Extract Firebase API key from existing frontend config file
firebase_init_path = os.path.join(app.static_folder, 'js', 'firebase-init.js')
try:
    with open(firebase_init_path, 'r') as f:
        content = f.read()
        # Look for the apiKey value in the configuration
        api_key_match = re.search(r'apiKey:\s*["\']([^"\']+)["\']', content)
        if api_key_match:
            app.config['FIREBASE_API_KEY'] = api_key_match.group(1)
            print("Firebase API key configured successfully")
        else:
            print("WARNING: Could not find Firebase API key in firebase-init.js")
except Exception as e:
    print(f"WARNING: Could not extract Firebase API key: {str(e)}")

# INIT FIREBASE
local_path = os.path.join(os.path.dirname(__file__), "secrets", "firebase-credentials.json")
cloud_path = "/secrets/firebase-credentials.json"
credentials_path = local_path if os.path.exists(local_path) else cloud_path

try:
    cred = credentials.Certificate(credentials_path)
    firebase_admin.initialize_app(cred)
    logger.info("Firebase initialized successfully")
except Exception as e:
    logger.error(f"Failed to initialize Firebase: {e}")

# Register blueprints
from blueprints.auth import bp as auth_bp
from blueprints.dashboard import bp as dashboard_bp
from blueprints.sensor import bp as sensor_bp
from blueprints.plants import bp as plants_bp
from blueprints.profile import bp as profile_bp
from blueprints.history.routes import history as history_bp
from blueprints.logs import logs_bp

# Explicitly import firestore_logger after logs_bp and its parent module are initialized.
# This is to ensure any setup in firestore_logger.py happens,
# and to break the circular import.
try:
    import blueprints.logs.firestore_logger
    logger.info("Successfully imported and initialized blueprints.logs.firestore_logger")
except ImportError as e:
    logger.warning(f"Could not import blueprints.logs.firestore_logger: {e}")
except Exception as e:
    # Catching general exceptions in case firestore_logger's init has other issues
    logger.error(f"An error occurred during the import/setup of blueprints.logs.firestore_logger: {e}", exc_info=True)

app.register_blueprint(auth_bp, url_prefix='/auth') # MODIFIED: Added url_prefix
app.register_blueprint(dashboard_bp)
app.register_blueprint(sensor_bp)
app.register_blueprint(plants_bp)
app.register_blueprint(profile_bp)
app.register_blueprint(history_bp)
app.register_blueprint(logs_bp, url_prefix='/logs')

# SocketIO Event Handlers
@socketio.on('connect')
def handle_connect():
    logger.info(f"Client connected: {request.sid}")
    if app_system_logger_available:
        system_log_event(SystemLogType.CONNECTION_RESTORED, SystemLogLevel.INFO, node="socketio_client", details=f"Client connected with SID: {request.sid}", source="flask_socketio_server")

@socketio.on('disconnect')
def handle_disconnect():
    logger.info(f"Client disconnected: {request.sid}")
    if app_system_logger_available:
        system_log_event(SystemLogType.CONNECTION_LOST, SystemLogLevel.WARNING, node="socketio_client", details=f"Client disconnected with SID: {request.sid}", source="flask_socketio_server")

# Placeholder for where automated actuator control logic might reside and log
# def perform_automated_control():
#     # ... your automation logic (e.g., based on fuzzy.py output or sensor thresholds) ...
#     if fan_should_turn_on_auto:
#         # ... code to turn fan on ...
#         if app_system_logger_available:
#             from blueprints.logs.firestore_logger import log_fan_auto # Specific import if needed
#             log_fan_auto(node="specific_section_if_applicable", state=True, details="Automated by server logic due to high temperature.", source="automation_service")
#     # Similar for other automated actions (fan off, light on/off)


# Root route for login page
@app.route("/")
def index():
    return render_template("login.html")

if __name__ == '__main__':
    logger.info(f"Starting Flask-SocketIO application on port {port}")
    # Use socketio.run() instead of app.run()
    socketio.run(app, debug=True, port=port, host='0.0.0.0', use_reloader=False) # use_reloader=False often needed with SocketIO
