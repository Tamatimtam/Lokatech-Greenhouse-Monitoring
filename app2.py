from flask import Flask, render_template, session, redirect, request, jsonify
import firebase_admin
from firebase_admin import credentials, auth
import secrets
import os
import json
import logging
from datetime import datetime, timedelta

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
from blueprints.controls import bp as controls_bp
from blueprints.profile import bp as profile_bp

app.register_blueprint(auth_bp)
app.register_blueprint(dashboard_bp)
app.register_blueprint(sensor_bp)
app.register_blueprint(controls_bp)
app.register_blueprint(profile_bp)

# Root route for login page
@app.route("/")
def index():
    return render_template("login.html")

if __name__ == '__main__':
    logger.info(f"Starting Flask application on port {port}")
    app.run(debug=True, port=port, host='0.0.0.0')