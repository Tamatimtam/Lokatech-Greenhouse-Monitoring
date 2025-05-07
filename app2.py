from flask import Flask, render_template, session, redirect, request, jsonify
import firebase_admin
from firebase_admin import credentials, auth
import secrets
import os
import json
import logging
from datetime import datetime, timedelta
import re
from flask_socketio import SocketIO
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

# INIT FLASK
app = Flask(__name__)
app.secret_key = secrets.token_hex(16)
port = int(os.environ.get('PORT', 4443))

# Initialize SocketIO - async_mode='threading' is often easiest to start with
socketio = SocketIO(app, async_mode='threading', cors_allowed_origins="*") # Allow all origins for simplicity, refine later if needed

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

app.register_blueprint(auth_bp)
app.register_blueprint(dashboard_bp)
app.register_blueprint(sensor_bp)
app.register_blueprint(plants_bp)
app.register_blueprint(profile_bp)
app.register_blueprint(history_bp)

# Root route for login page
@app.route("/")
def index():
    return render_template("login.html")

if __name__ == '__main__':
    logger.info(f"Starting Flask-SocketIO application on port {port}")
    # Use socketio.run() instead of app.run()
    socketio.run(app, debug=True, port=port, host='0.0.0.0', use_reloader=False) # use_reloader=False often needed with SocketIO
