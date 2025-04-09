import paho.mqtt.client as mqtt
import json
import logging
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

class SensorDataManager:
    def __init__(self):
        # Initialize with the expected structure, including actuators
        self.latest_data = {
            "sections": {},
            "averages": {},
            "timestamp": None,
            "actuators": {
                "fan": {"state": None, "mode": "auto"},
                "light": {"state": None, "mode": "auto"}
            }
        }
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
        
        # Add debug flag
        self.debug = True
    
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
            if self.debug:
                logger.debug(f"Raw MQTT message received: {msg.payload.decode()}")
            
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
        """Validate and store received sensor data"""
        # Log the validation attempt
        if self.debug:
            logger.debug(f"Validating data structure: {json.dumps(data, indent=2)}")
        # Include 'actuators' in required fields check (optional, but good practice)
        required_fields = ['timestamp', 'sections', 'averages', 'actuators']
        
        # Check required fields
        missing_fields = [field for field in required_fields if field not in data]
        if missing_fields:
            logger.error(f"Missing required fields: {missing_fields}")
            return False
            
        # Validate sections (allow empty sections)
        if not isinstance(data['sections'], dict):
            logger.error("'sections' must be an object")
            return False

        # Validate actuators structure (optional but recommended)
        if 'actuators' not in data or not isinstance(data['actuators'], dict) or \
           'fan' not in data['actuators'] or not isinstance(data['actuators']['fan'], dict) or \
           'light' not in data['actuators'] or not isinstance(data['actuators']['light'], dict) or \
           'state' not in data['actuators']['fan'] or 'mode' not in data['actuators']['fan'] or \
           'state' not in data['actuators']['light'] or 'mode' not in data['actuators']['light']:
             logger.error("Invalid or missing 'actuators' structure in MQTT data")
             # Decide if you want to reject the whole message or just ignore actuators
             # For now, let's store the rest but log the error
             # return False # Uncomment to reject message if actuators are malformed

        # Accept data even if some sections are empty
        if self.debug:
            logger.debug(f"Active sections: {list(filter(lambda x: x[1], data['sections'].items()))}")
            if 'actuators' in data:
                 logger.debug(f"Actuator data received: {json.dumps(data['actuators'], indent=2)}")
            else:
                 logger.warning("Actuator data missing from payload")

        # Store the entire received data structure
        self.latest_data = data 
        # Ensure actuators field exists even if missing from payload (initialize if needed)
        if 'actuators' not in self.latest_data:
             self.latest_data['actuators'] = {
                 "fan": {"state": None, "mode": "auto"},
                 "light": {"state": None, "mode": "auto"}
             }

        self.last_update = datetime.now()
        logger.info("Updated sensor data successfully (including actuators if present)")
        logger.debug(f"Stored data: {json.dumps(self.latest_data, indent=2)}")
        return True
    
    def get_data(self):
        """Get the latest sensor data if available and recent"""
        if not self.latest_data or not self.last_update:
            logger.warning("No data available or no updates received yet")
            return None
            
        # Check if data is stale (older than 5 seconds)
        if datetime.now() - self.last_update > timedelta(seconds=5):
            logger.warning(f"Data is stale. Last update: {self.last_update}")
            return None
        
        if self.debug:
            logger.debug(f"Returning data: {json.dumps(self.latest_data, indent=2)}")
            
        return self.latest_data

# Create a global instance of the sensor data manager
sensor_manager = SensorDataManager()
