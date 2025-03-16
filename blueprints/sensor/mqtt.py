import paho.mqtt.client as mqtt
import json
import logging
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

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
            data = json.loads(msg.payload.decode())
            self.validate_and_store_data(data)
        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON in MQTT message: {e}")
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

# Create a global instance of the sensor data manager
sensor_manager = SensorDataManager()