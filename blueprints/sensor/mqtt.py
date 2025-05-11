import paho.mqtt.client as mqtt
import json
import logging
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

class SensorDataManager:
    def __init__(self):
        self.latest_data = {
            "sections": {
                "penyemaian": {}, # Will store temp, humidity, light, trends
                "remaja": {},     # New: for the master node's local sensors
                "dewasa": {}      # Was peremajaan, now represents the other sensor node
            },
            "averages": {"temp": None, "humidity": None, "light": None},
            "timestamp": None,
            "actuators": { # Actuators controlled by Remaja (Master)
                "fan": {"state": None, "mode": "auto"},
                "light": {"state": None, "mode": "auto"}
            }
        }
        self.last_update = None
        self.mqtt_connected = False
        self.socketio = None 
        
        self.client = mqtt.Client()
        self.client.on_connect = self.on_connect
        self.client.on_message = self.on_message
        self.client.on_disconnect = self.on_disconnect
        
        try:
            self.client.username_pw_set("LokataniAdmin", "LokataniAdmin123")
            self.client.tls_set() 
            self.client.connect("d1b364f4ed864e92b1fb464a3201e5ae.s1.eu.hivemq.cloud", 8883, 60)
            self.client.loop_start()
            logger.info("Connected to HiveMQ Cloud MQTT broker")
        except Exception as e:
            logger.error(f"Failed to connect to HiveMQ Cloud MQTT broker: {e}")
        
        self.debug = True

    def set_socketio(self, socketio_instance):
        self.socketio = socketio_instance
        logger.info("SocketIO instance set for SensorDataManager")
    
    def on_connect(self, client, userdata, flags, rc):
        self.mqtt_connected = True
        logger.info(f"Connected to MQTT broker with result code {rc}")
        # Topic for sensor data from Remaja (Master)
        client.subscribe("lokatech/greenhouse/sensors") 
        logger.info("Subscribed to greenhouse sensor topic")
    
    def on_disconnect(self, client, userdata, rc):
        self.mqtt_connected = False
        logger.warning(f"Disconnected from MQTT broker with result code {rc}")
    
    def on_message(self, client, userdata, msg):
        try:
            if self.debug:
                logger.debug(f"Raw MQTT message received on topic {msg.topic}: {msg.payload.decode()}")
            
            data = json.loads(msg.payload.decode())
            
            if self.debug:
                logger.debug(f"Parsed MQTT data: {json.dumps(data, indent=2)}")
            
            self.validate_and_store_data(data)
        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON in MQTT message: {e}")
            logger.error(f"Raw message: {msg.payload.decode()}")
        except Exception as e:
            logger.error(f"Error processing MQTT message: {e}")
    
    def validate_and_store_data(self, data):
        if self.debug:
            logger.debug(f"Validating data structure: {json.dumps(data, indent=2)}")
        
        # Expected top-level keys
        required_top_level_keys = ['timestamp', 'sections', 'averages', 'actuators']
        missing_top_level = [key for key in required_top_level_keys if key not in data]
        if missing_top_level:
            logger.error(f"MQTT data missing top-level keys: {missing_top_level}")
            return False

        if not isinstance(data['sections'], dict):
            logger.error("'sections' must be an object in MQTT data")
            return False

        # Expected sections (Penyemaian, Remaja, Dewasa)
        expected_sections = ["penyemaian", "remaja", "dewasa"]
        for section_name in expected_sections:
            if section_name not in data['sections']:
                logger.warning(f"Section '{section_name}' missing in MQTT data. Will be empty.")
                # Ensure the section exists in our local store, even if empty
                self.latest_data["sections"].setdefault(section_name, {}) 
        
        # Validate actuators structure (for Remaja node's actuators)
        if 'actuators' not in data or not isinstance(data['actuators'], dict) or \
           'fan' not in data['actuators'] or not isinstance(data['actuators']['fan'], dict) or \
           'light' not in data['actuators'] or not isinstance(data['actuators']['light'], dict) or \
           'state' not in data['actuators']['fan'] or 'mode' not in data['actuators']['fan'] or \
           'state' not in data['actuators']['light'] or 'mode' not in data['actuators']['light']:
             logger.error("Invalid or missing 'actuators' structure in MQTT data")
             # Initialize actuators if malformed or missing to prevent errors downstream
             data['actuators'] = {
                 "fan": {"state": None, "mode": "auto"},
                 "light": {"state": None, "mode": "auto"}
             }

        # Store the received data, ensuring all expected sections are present
        # even if they were missing from the payload (will be empty dicts)
        self.latest_data["timestamp"] = data.get("timestamp")
        self.latest_data["averages"] = data.get("averages", {"temp": None, "humidity": None, "light": None})
        self.latest_data["actuators"] = data.get("actuators") # Already validated/initialized

        for section_name in expected_sections:
            self.latest_data["sections"][section_name] = data.get("sections", {}).get(section_name, {})


        self.last_update = datetime.now()
        logger.info("Updated sensor data successfully (Penyemaian, Remaja, Dewasa)")
        logger.debug(f"Stored data: {json.dumps(self.latest_data, indent=2)}")

        if self.socketio:
            try:
                self.socketio.emit('sensor_update', self.latest_data)
                logger.info("Emitted 'sensor_update' via WebSocket")
            except Exception as emit_error:
                logger.error(f"Failed to emit WebSocket update: {emit_error}")
        return True
    
    def get_data(self):
        if not self.latest_data or self.latest_data.get("timestamp") is None or not self.last_update:
            logger.warning("No data available or no updates received yet")
            # Return a structured None or default structure
            return {
                "sections": { "penyemaian": {}, "remaja": {}, "dewasa": {} },
                "averages": {"temp": None, "humidity": None, "light": None},
                "timestamp": None,
                "actuators": {
                    "fan": {"state": None, "mode": "auto"},
                    "light": {"state": None, "mode": "auto"}
                }
            }
            
        # Check if data is stale (e.g., older than 10 seconds for MQTT)
        # The Remaja Master sends every 5s, so 10-15s timeout is reasonable.
        if datetime.now() - self.last_update > timedelta(seconds=15):
            logger.warning(f"Data is stale. Last update: {self.last_update}")
            # Return last known data but log staleness, or return default structure
            # For UI, better to show last known good data with a warning
            # For now, let's return the stale data. UI can indicate staleness.
            # Or, return the default structure to force UI to show "offline"
            return { # Return default on stale
                "sections": { "penyemaian": {}, "remaja": {}, "dewasa": {} },
                "averages": {"temp": None, "humidity": None, "light": None},
                "timestamp": self.latest_data.get("timestamp"), # Keep last timestamp
                "actuators": self.latest_data.get("actuators"), # Keep last actuators
                "status_message": "Data is stale" 
            }
        
        if self.debug:
            logger.debug(f"Returning data: {json.dumps(self.latest_data, indent=2)}")
            
        return self.latest_data

sensor_manager = SensorDataManager()
