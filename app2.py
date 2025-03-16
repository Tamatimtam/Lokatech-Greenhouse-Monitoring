from flask import Flask, render_template, session, redirect, request, jsonify
import firebase_admin
from firebase_admin import credentials, auth
from functools import wraps
import secrets
import os
import json
import logging
import paho.mqtt.client as mqtt
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

# Data management
class SensorDataManager:
    def __init__(self):
        self.latest_data = None
        self.last_update = None
        self.mqtt_connected = False
        
        # Initialize MQTT client
        self.client = mqtt.Client()
        self.client.on_connect = self.on_connect
        self.client.on_message = self.on_message
        self.client.on_disconnect = self.on_disconnect
        
        # Connect to MQTT broker
        try:
            self.client.connect("broker.emqx.io", 1883, 60)
            self.client.loop_start()
            logger.info("Connected to MQTT broker")
        except Exception as e:
            logger.error(f"Failed to connect to MQTT broker: {e}")
    
    def on_connect(self, client, userdata, flags, rc):
        """Callback when connection is established"""
        self.mqtt_connected = True
        logger.info(f"Connected to MQTT broker with result code {rc}")
        client.subscribe("lokatech/greenhouse/sensors")
        logger.info("Subscribed to greenhouse sensor topic")
    
    def on_disconnect(self, client, userdata, rc):
        """Callback when connection is lost"""
        self.mqtt_connected = False
        logger.warning(f"Disconnected from MQTT broker with result code {rc}")
    
    def on_message(self, client, userdata, msg):
        """Callback when message is received"""
        try:
            logger.debug(f"Raw MQTT message received: {msg.payload}")
            data = json.loads(msg.payload.decode())
            logger.debug(f"Decoded JSON data: {json.dumps(data, indent=2)}")
            self.validate_and_store_data(data)
        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON in MQTT message: {e}")
            logger.error(f"Raw message causing error: {msg.payload}")
        except Exception as e:
            logger.error(f"Error processing MQTT message: {e}")
    
    def validate_and_store_data(self, data):
        """Validate and store received sensor data"""
        required_fields = ['timestamp', 'sections', 'averages']
        if not all(field in data for field in required_fields):
            logger.error("Received data missing required fields")
            return False
        
        self.latest_data = data
        self.last_update = datetime.now()
        logger.debug("Updated sensor data successfully")
        return True
    
    def get_data(self):
        """Get the latest sensor data if available and recent"""
        if not self.latest_data or not self.last_update:
            return None
            
        # Check if data is stale (older than 15 seconds)
        if datetime.now() - self.last_update > timedelta(seconds=15):
            logger.warning("Sensor data is stale")
            return None
            
        return self.latest_data

# Initialize sensor data manager
sensor_manager = SensorDataManager()

# Authentication decorator
def isloggedin(f):
    @wraps(f)
    def dummy(*args, **kwargs):
        if 'user' not in session:
            logger.warning("Unauthorized access attempt - user not in session")
            return redirect("/")
        logger.debug(f"Authenticated access by user: {session['user']['email']}")
        return f(*args, **kwargs)
    return dummy

# Routes
@app.route("/")
def index():
    return render_template("login.html")

@app.route("/dashboard")
@isloggedin
def dashboard():
    logger.debug(f"Serving dashboard for user: {session['user']['email']}")
    sensor_data = sensor_manager.get_data()
    return render_template("dashboard.html", user=session['user'], sensor_data=sensor_data)

@app.route("/controls")
@isloggedin
def controls():
    return render_template("controls.html", user=session['user'])

@app.route("/profile")
@isloggedin
def profile():
    logger.debug(f"Rendering profile for user: {session['user']['email']}")
    return render_template("profile.html", user=session['user'])

@app.route("/login", methods=["POST"])
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

@app.route("/logout")
def logout():
    if 'user' in session:
        logger.info(f"User logged out: {session['user']['email']}")
    session.clear()
    return redirect("/")

@app.route("/api/sensor-data")
@isloggedin
def get_sensor_data():
    """API endpoint to get the latest sensor data"""
    data = sensor_manager.get_data()
    if not data:
        logger.warning("No sensor data available")
        return jsonify({
            "error": "No sensor data available",
            "status": "offline",
            "message": "Tidak ada data dari jaringan ESP"
        }), 404
        
    try:
        # Ensure the data can be serialized to JSON before sending
        return app.response_class(
            response=json.dumps(data),
            status=200,
            mimetype='application/json'
        )
    except Exception as e:
        logger.error(f"Error serializing sensor data: {e}")
        logger.error(f"Problematic data: {data}")
        return jsonify({
            "error": "Internal server error",
            "status": "error",
            "message": "Kesalahan format data sensor"
        }), 500

if __name__ == '__main__':
    logger.info(f"Starting Flask application on port {port}")
    app.run(debug=True, port=port, host='0.0.0.0')