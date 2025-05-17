import paho.mqtt.client as mqtt
import json
import logging
from datetime import datetime, timedelta, timezone # Added timezone

logger = logging.getLogger(__name__)

class SensorDataManager:
    def __init__(self):
        self.latest_data = {
            "sections": {
                "penyemaian": {}, 
                "remaja": {},     
                "dewasa": {}      
            },
            "averages": {"temp": None, "humidity": None, "light": None},
            "timestamp": None, # This will be the hardware_send_timestamp_str
            "actuators": { 
                "fan": {"state": None, "mode": "auto"},
                "light": {"state": None, "mode": "auto"}
            },
            "log_data": { # New section for latency and log related data
                "hardware_send_timestamp_str": None,
                "server_mqtt_recv_timestamp_str": None,
                "mqtt_latency_ms": None,
                "espnow_latency_penyemaian_ms": None,
                "espnow_latency_dewasa_ms": None,
                "websocket_send_timestamp_str": None, # Will be set before emitting
                "packet_id": 0 # Simple packet counter
            }
        }
        self.last_update = None
        self.mqtt_connected = False
        self.socketio = None 
        self.packet_counter = 0
        
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
        
        self.debug = True # Keep True for now for easier debugging

    def set_socketio(self, socketio_instance):
        self.socketio = socketio_instance
        logger.info("SocketIO instance set for SensorDataManager")
    
    def on_connect(self, client, userdata, flags, rc):
        self.mqtt_connected = True
        logger.info(f"Connected to MQTT broker with result code {rc}")
        client.subscribe("lokatech/greenhouse/sensors") 
        logger.info("Subscribed to greenhouse sensor topic")
    
    def on_disconnect(self, client, userdata, rc):
        self.mqtt_connected = False
        logger.warning(f"Disconnected from MQTT broker with result code {rc}")
    
    def on_message(self, client, userdata, msg):
        server_mqtt_recv_time = datetime.now(timezone.utc) # Record reception time immediately
        try:
            if self.debug:
                logger.debug(f"Raw MQTT message received on topic {msg.topic}: {msg.payload.decode()}")
            
            data = json.loads(msg.payload.decode())
            
            if self.debug:
                logger.debug(f"Parsed MQTT data: {json.dumps(data, indent=2)}")
            
            self.validate_and_store_data(data, server_mqtt_recv_time)
        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON in MQTT message: {e}")
            logger.error(f"Raw message: {msg.payload.decode()}")
        except Exception as e:
            logger.error(f"Error processing MQTT message: {e}")
    
    def validate_and_store_data(self, data, server_mqtt_recv_time):
        if self.debug:
            logger.debug(f"Validating data structure: {json.dumps(data, indent=2)}")
        
        # Expected top-level keys, including the new hardware_send_timestamp_str
        required_top_level_keys = ['hardware_send_timestamp_str', 'sections', 'averages', 'actuators']
        missing_top_level = [key for key in required_top_level_keys if key not in data]
        if missing_top_level:
            logger.error(f"MQTT data missing top-level keys: {missing_top_level}")
            return False

        if not isinstance(data['sections'], dict):
            logger.error("'sections' must be an object in MQTT data")
            return False

        expected_sections = ["penyemaian", "remaja", "dewasa"]
        for section_name in expected_sections:
            if section_name not in data['sections']:
                logger.warning(f"Section '{section_name}' missing in MQTT data. Will be empty.")
                self.latest_data["sections"].setdefault(section_name, {}) 
        
        if 'actuators' not in data or not isinstance(data['actuators'], dict) or \
           'fan' not in data['actuators'] or not isinstance(data['actuators']['fan'], dict) or \
           'light' not in data['actuators'] or not isinstance(data['actuators']['light'], dict) or \
           'state' not in data['actuators']['fan'] or 'mode' not in data['actuators']['fan'] or \
           'state' not in data['actuators']['light'] or 'mode' not in data['actuators']['light']:
             logger.error("Invalid or missing 'actuators' structure in MQTT data")
             data['actuators'] = {
                 "fan": {"state": None, "mode": "auto"},
                 "light": {"state": None, "mode": "auto"}
             }

        # Store core data
        self.latest_data["timestamp"] = data.get("hardware_send_timestamp_str") # Use hardware ts as main ts
        self.latest_data["averages"] = data.get("averages", {"temp": None, "humidity": None, "light": None})
        self.latest_data["actuators"] = data.get("actuators") 

        for section_name in expected_sections:
            self.latest_data["sections"][section_name] = data.get("sections", {}).get(section_name, {})

        # --- Latency and Log Data Processing ---
        self.packet_counter += 1
        self.latest_data["log_data"]["packet_id"] = self.packet_counter
        
        hw_ts_str = data.get("hardware_send_timestamp_str")
        self.latest_data["log_data"]["hardware_send_timestamp_str"] = hw_ts_str
        self.latest_data["log_data"]["server_mqtt_recv_timestamp_str"] = server_mqtt_recv_time.isoformat().replace('+00:00', 'Z')

        mqtt_lat = None
        if hw_ts_str and hw_ts_str != "N/A":
            try:
                # Handle potential "Z" for UTC or offset like +07:00
                if hw_ts_str.endswith('Z'):
                    hw_ts_dt = datetime.fromisoformat(hw_ts_str[:-1] + '+00:00')
                else:
                    hw_ts_dt = datetime.fromisoformat(hw_ts_str)
                
                # Ensure hw_ts_dt is offset-aware (UTC) if server_mqtt_recv_time is
                if hw_ts_dt.tzinfo is None:
                     hw_ts_dt = hw_ts_dt.replace(tzinfo=timezone.utc)


                mqtt_lat = (server_mqtt_recv_time - hw_ts_dt).total_seconds() * 1000
                self.latest_data["log_data"]["mqtt_latency_ms"] = round(mqtt_lat, 2)
            except ValueError as ve:
                logger.error(f"Error parsing hardware_send_timestamp_str '{hw_ts_str}': {ve}")
                self.latest_data["log_data"]["mqtt_latency_ms"] = None
        else:
            self.latest_data["log_data"]["mqtt_latency_ms"] = None
            logger.warning("Hardware timestamp 'N/A' or missing, cannot calculate MQTT latency.")

        # Extract ESP-NOW latencies
        self.latest_data["log_data"]["espnow_latency_penyemaian_ms"] = data.get("sections", {}).get("penyemaian", {}).get("espnow_latency_ms")
        self.latest_data["log_data"]["espnow_latency_dewasa_ms"] = data.get("sections", {}).get("dewasa", {}).get("espnow_latency_ms")
        
        # --- End Latency Processing ---

        self.last_update = datetime.now() # Local server time for staleness check
        logger.info(f"Updated sensor data (Packet ID: {self.packet_counter}). MQTT Latency: {mqtt_lat if mqtt_lat is not None else 'N/A'} ms")
        if self.debug:
            logger.debug(f"Stored data (incl. log_data): {json.dumps(self.latest_data, indent=2)}")

        if self.socketio:
            try:
                # Set WebSocket send timestamp just before emitting
                self.latest_data["log_data"]["websocket_send_timestamp_str"] = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')
                self.socketio.emit('sensor_update', self.latest_data)
                logger.info("Emitted 'sensor_update' via WebSocket")
            except Exception as emit_error:
                logger.error(f"Failed to emit WebSocket update: {emit_error}")
        return True
    
    def get_data(self):
        if not self.latest_data or self.latest_data.get("timestamp") is None or not self.last_update:
            logger.warning("No data available or no updates received yet")
            # Return a structured None or default structure
            return { # Return default structure
                "sections": { "penyemaian": {}, "remaja": {}, "dewasa": {} },
                "averages": {"temp": None, "humidity": None, "light": None},
                "timestamp": None, # hardware_send_timestamp_str
                "actuators": {
                    "fan": {"state": None, "mode": "auto"},
                    "light": {"state": None, "mode": "auto"}
                },
                "log_data": { # Default log_data
                    "hardware_send_timestamp_str": None,
                    "server_mqtt_recv_timestamp_str": None,
                    "mqtt_latency_ms": None,
                    "espnow_latency_penyemaian_ms": None,
                    "espnow_latency_dewasa_ms": None,
                    "websocket_send_timestamp_str": None,
                    "packet_id": 0
                },
                "status_message": "No data available"
            }
            
        # Check if data is stale (e.g., older than 15 seconds for MQTT)
        if datetime.now() - self.last_update > timedelta(seconds=15):
            logger.warning(f"Data is stale. Last update: {self.last_update}")
            # Return last known data but with a status message
            stale_data = self.latest_data.copy() # Create a shallow copy
            stale_data["status_message"] = "Data is stale" 
            # We might want to nullify sensor values here or let UI handle staleness
            return stale_data
        
        if self.debug:
            logger.debug(f"Returning data: {json.dumps(self.latest_data, indent=2)}")
            
        return self.latest_data

sensor_manager = SensorDataManager()
