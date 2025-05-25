import paho.mqtt.client as mqtt
import json
import logging
from datetime import datetime, timedelta, timezone # Added timezone
# Import system logger
try:
    from ..logs.firestore_logger import log_event, LogType, LogLevel, log_sensor_error, log_sensor_operational, log_node_offline, log_node_online
    system_logger_available = True
except ImportError:
    system_logger_available = False
    # Define dummy logger functions if the import fails to prevent runtime errors
    class LogType: SENSOR_ERROR = "SENSOR_ERROR"; CONNECTION_LOST = "CONNECTION_LOST"; CONNECTION_RESTORED = "CONNECTION_RESTORED" # Dummy
    class LogLevel: ERROR = "ERROR"; WARNING = "WARNING"; INFO = "INFO" # Dummy
    def log_event(log_type, level, node=None, sensor_type=None, details=None, source=None): logging.warning(f"[DUMMY_SYS_LOG] Type: {log_type}, Level: {level}, Node: {node}, Details: {details}, Source: {source}")
    def log_sensor_error(node, sensor_type, details, source): logging.warning(f"[DUMMY_SYS_LOG_SENSOR_ERROR] Node: {node}, Sensor: {sensor_type}, Details: {details}, Source: {source}")
    def log_sensor_operational(node, sensor_type, details, source): logging.warning(f"[DUMMY_SYS_LOG_SENSOR_OPERATIONAL] Node: {node}, Sensor: {sensor_type}, Details: {details}, Source: {source}")
    def log_node_offline(node_name, details, level=LogLevel.WARNING, source="node_monitor"): logging.warning(f"[DUMMY_NODE_OFFLINE] Node: {node_name}, Details: {details}, Level: {level}, Source: {source}")
    def log_node_online(node_name, details, source="node_monitor"): logging.warning(f"[DUMMY_NODE_ONLINE] Node: {node_name}, Details: {details}, Source: {source}")


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
        self.source_identifier = "flask_sensor_manager" # For system logs
        self.node_online_status = {
            'penyemaian': True,
            'remaja': True,
            'dewasa': True
        }
        
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
            # Note: Connection success logged in on_connect
        except Exception as e:
            logger.error(f"Failed to connect to HiveMQ Cloud MQTT broker: {e}")
            if system_logger_available:
                log_event(LogType.CONNECTION_LOST, LogLevel.ERROR, node="server", details=f"Initial MQTT connection failed: {e}", source=self.source_identifier)
        
        self.debug = True # Keep True for now for easier debugging

    def set_socketio(self, socketio_instance):
        self.socketio = socketio_instance
        logger.info("SocketIO instance set for SensorDataManager")
    
    def on_connect(self, client, userdata, flags, rc):
        self.mqtt_connected = True
        logger.info(f"Connected to MQTT broker with result code {rc}")
        client.subscribe("lokatech/greenhouse/sensors") 
        logger.info("Subscribed to greenhouse sensor topic")
        if system_logger_available:
            if rc == 0:
                log_event(LogType.CONNECTION_RESTORED, LogLevel.INFO, node="server", details="Successfully connected to MQTT Broker.", source=self.source_identifier)
            else:
                log_event(LogType.CONNECTION_LOST, LogLevel.WARNING, node="server", details=f"MQTT connection attempt resulted in code: {rc}", source=self.source_identifier)

    
    def on_disconnect(self, client, userdata, rc):
        self.mqtt_connected = False
        logger.warning(f"Disconnected from MQTT broker with result code {rc}")
        if system_logger_available:
            log_event(LogType.CONNECTION_LOST, LogLevel.WARNING, node="server", details=f"Disconnected from MQTT Broker. Result code: {rc}", source=self.source_identifier)
            if self.node_online_status.get("remaja", True):
                self.node_online_status["remaja"] = False
                log_node_offline(node_name="remaja", 
                                 details="CRITICAL: Lost connection to MQTT broker. Remaja Master is considered offline.", 
                                 level=LogLevel.CRITICAL, 
                                 source=self.source_identifier)

    
    def on_message(self, client, userdata, msg):
        server_mqtt_recv_time = datetime.now(timezone.utc) # Record reception time immediately
        try:
            if self.debug:
                logger.debug(f"Raw MQTT message received on topic {msg.topic}: {msg.payload.decode()}")
            
            data = json.loads(msg.payload.decode())
            
            if self.debug:
                logger.debug(f"Parsed MQTT data: {json.dumps(data, indent=2)}")
            
            self.validate_and_store_data(data, server_mqtt_recv_time)

            if not self.node_online_status.get("remaja", False) and system_logger_available:
                self.node_online_status["remaja"] = True
                log_node_online(node_name="remaja", details="Remaja Master is back online and sending MQTT data.", source=self.source_identifier)
        except json.JSONDecodeError as e:
            err_details = f"Invalid JSON in MQTT message: {e}. Payload: {msg.payload.decode(errors='ignore')[:200]}"
            logger.error(err_details)
            if system_logger_available:
                log_sensor_error(node="mqtt_feed", sensor_type="json_payload", details=err_details, source=self.source_identifier)
        except UnicodeDecodeError as e:
            err_details = f"Unicode decode error in MQTT message: {e}. Raw Payload: {str(msg.payload)[:200]}"
            logger.error(err_details)
            if system_logger_available:
                log_sensor_error(node="mqtt_feed", sensor_type="payload_encoding", details=err_details, source=self.source_identifier)
        except Exception as e:
            err_details = f"Error processing MQTT message: {e}"
            logger.error(err_details)
            if system_logger_available:
                log_event(LogType.SENSOR_ERROR, LogLevel.ERROR, node="mqtt_feed_processing", details=err_details, source=self.source_identifier)

    
    def validate_and_store_data(self, data, server_mqtt_recv_time):
        if self.debug:
            logger.debug(f"Validating data structure: {json.dumps(data, indent=2)}")
        
        # Expected top-level keys, including the new hardware_send_timestamp_str
        required_top_level_keys = ['hardware_send_timestamp_str', 'sections', 'averages', 'actuators']
        missing_top_level = [key for key in required_top_level_keys if key not in data]
        if missing_top_level:
            details = f"MQTT data missing top-level keys: {missing_top_level}. Data: {str(data)[:200]}"
            logger.error(details)
            if system_logger_available:
                log_sensor_error(node="mqtt_data_validation", sensor_type="payload_structure", details=details, source=self.source_identifier)
            return False

        if not isinstance(data['sections'], dict):
            details = f"'sections' must be an object in MQTT data. Received: {type(data['sections'])}"
            logger.error(details)
            if system_logger_available:
                log_sensor_error(node="mqtt_data_validation", sensor_type="payload_structure", details=details, source=self.source_identifier)
            return False

        expected_sections = ["penyemaian", "remaja", "dewasa"]
        for section_name in expected_sections:
            if section_name not in data['sections']:
                details = f"Section '{section_name}' missing in MQTT data. Will be empty."
                logger.warning(details)
                # No system log for this warning as it's handled gracefully, unless desired
                self.latest_data["sections"].setdefault(section_name, {}) 
        
        actuators_data = data.get('actuators')
        if not isinstance(actuators_data, dict) or \
           not isinstance(actuators_data.get('fan'), dict) or \
           not isinstance(actuators_data.get('light'), dict) or \
           'state' not in actuators_data.get('fan', {}) or 'mode' not in actuators_data.get('fan', {}) or \
           'state' not in actuators_data.get('light', {}) or 'mode' not in actuators_data.get('light', {}):
             details = f"Invalid or missing 'actuators' structure in MQTT data: {str(actuators_data)[:200]}"
             logger.error(details)
             if system_logger_available:
                log_sensor_error(node="mqtt_data_validation", sensor_type="payload_structure_actuators", details=details, source=self.source_identifier)
             # Use default structure to prevent further errors
             data['actuators'] = {
                 "fan": {"state": None, "mode": "auto"},
                 "light": {"state": None, "mode": "auto"}
             }
        
        # Log changes in actuator states if mode is 'auto' as reported by hardware
        # This is not the server *performing* an auto action, but reporting the state.
        # For true "Kipas Hidup (Automated)" logs, the automation logic itself should log.
        # Here, we log the reported state if it's in 'auto' mode.
        current_actuators = self.latest_data.get("actuators", {})
        new_actuators = data.get("actuators", {})

        if system_logger_available:
            # Fan state logging
            old_fan_state = current_actuators.get("fan", {}).get("state")
            new_fan_state = new_actuators.get("fan", {}).get("state")
            new_fan_mode = new_actuators.get("fan", {}).get("mode")
            if new_fan_state is not None and new_fan_state != old_fan_state and new_fan_mode == "auto":
                log_type = LogType.FAN_ON_AUTO if new_fan_state else LogType.FAN_OFF_AUTO
                log_event(log_type, LogLevel.INFO, node="all_sections", # Assuming fan applies to all or is a general status
                          details=f"Fan state reported as {'ON' if new_fan_state else 'OFF'} in AUTO mode by hardware.", 
                          source=self.source_identifier + "_hardware_report")

            # Light state logging
            old_light_state = current_actuators.get("light", {}).get("state")
            new_light_state = new_actuators.get("light", {}).get("state")
            new_light_mode = new_actuators.get("light", {}).get("mode")
            if new_light_state is not None and new_light_state != old_light_state and new_light_mode == "auto":
                log_type = LogType.LIGHT_ON_AUTO if new_light_state else LogType.LIGHT_OFF_AUTO
                log_event(log_type, LogLevel.INFO, node="all_sections", # Assuming light applies to all
                          details=f"Light state reported as {'ON' if new_light_state else 'OFF'} in AUTO mode by hardware.",
                          source=self.source_identifier + "_hardware_report")

        # --- Sensor Error/Fix Logging ---
        if system_logger_available:
            expected_sections_for_sensor_check = ["penyemaian", "remaja", "dewasa"]
            for section_name in expected_sections_for_sensor_check:
                new_section_data = data.get("sections", {}).get(section_name, {})
                # Ensure self.latest_data["sections"] exists and has the section_name key
                old_section_data = self.latest_data.get("sections", {}).get(section_name, {})

                for sensor_key in ['temp', 'humidity', 'light']:
                    new_value = new_section_data.get(sensor_key)
                    old_value = old_section_data.get(sensor_key)
                    
                    new_value_is_error = (new_value == 0)
                    old_value_was_error = (old_value == 0)
                    
                    new_value_exists = new_value is not None
                    old_value_exists = old_value is not None

                    if new_value_exists and old_value_exists:
                        if new_value_is_error and not old_value_was_error:
                            log_sensor_error(
                                node=section_name,
                                sensor_type=sensor_key,
                                details=f"Sensor {sensor_key} in {section_name} started reporting 0 (error state).",
                                source=self.source_identifier + "_data_monitor"
                            )
                        elif not new_value_is_error and old_value_was_error:
                            log_sensor_operational(
                                node=section_name,
                                sensor_type=sensor_key,
                                details=f"Sensor {sensor_key} in {section_name} is now operational. Value: {new_value}",
                                source=self.source_identifier + "_data_monitor"
                            )
                    elif new_value_exists and not old_value_exists and new_value_is_error:
                        # Sensor just appeared in payload and is already in error state
                        log_sensor_error(
                            node=section_name,
                            sensor_type=sensor_key,
                            details=f"Sensor {sensor_key} in {section_name} reported 0 (error state) upon first valid data.",
                            source=self.source_identifier + "_data_monitor"
                        )
 

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
                if system_logger_available:
                    log_sensor_error(node="mqtt_data_validation", sensor_type="timestamp_parsing", details=f"Error parsing hardware_send_timestamp_str '{hw_ts_str}': {ve}", source=self.source_identifier)
                self.latest_data["log_data"]["mqtt_latency_ms"] = None
        else:
            self.latest_data["log_data"]["mqtt_latency_ms"] = None
            logger.warning("Hardware timestamp 'N/A' or missing, cannot calculate MQTT latency.")

        # Extract ESP-NOW latencies
        self.latest_data["log_data"]["espnow_latency_penyemaian_ms"] = data.get("sections", {}).get("penyemaian", {}).get("espnow_latency_ms")
        self.latest_data["log_data"]["espnow_latency_dewasa_ms"] = data.get("sections", {}).get("dewasa", {}).get("espnow_latency_ms")
        
        # --- End Latency Processing ---

        expected_sections_in_payload = ["penyemaian", "remaja", "dewasa"]
        for section_name in expected_sections_in_payload:
            section_data = data.get("sections", {}).get(section_name, {})
            section_data_present_and_valid = (
                section_name in data.get("sections", {}) and 
                isinstance(section_data, dict) and 
                bool(section_data) and
                # Check if at least one of the main sensor values is not null
                any(section_data.get(key) is not None for key in ['temp', 'humidity', 'light'])
            )

            if section_data_present_and_valid:
                if not self.node_online_status.get(section_name, False):
                    self.node_online_status[section_name] = True
                    if system_logger_available:
                        log_node_online(node_name=section_name, details=f"Node {section_name} data received. Marking as online.")
            else:
                if self.node_online_status.get(section_name, True):
                    self.node_online_status[section_name] = False
                    level = LogLevel.CRITICAL if section_name == "remaja" else LogLevel.WARNING
                    
                    # Create more detailed message based on the issue
                    if section_name not in data.get("sections", {}):
                        details_msg = f"Node {section_name} data section is completely missing from MQTT payload."
                    elif not isinstance(section_data, dict) or not section_data:
                        details_msg = f"Node {section_name} data section is empty or invalid in MQTT payload."
                    else:
                        # All sensor values are null
                        details_msg = f"Node {section_name} is sending null values for all sensors (temp, humidity, light). Node appears to be offline or malfunctioning."
                    
                    if section_name == "remaja" and level == LogLevel.CRITICAL:
                         details_msg = f"CRITICAL: {details_msg} This indicates a problem on the Remaja Master itself."
                    
                    if system_logger_available:
                        log_node_offline(node_name=section_name, details=details_msg, level=level)

        self.last_update = datetime.now(timezone.utc) # Use timezone-aware datetime
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
        current_time = datetime.now(timezone.utc)
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
        if self.last_update and (current_time - self.last_update > timedelta(seconds=15)):
            logger.warning(f"Data is stale. Last update: {self.last_update}")
            # Return last known data but with a status message
            stale_data = self.latest_data.copy() # Create a shallow copy
            stale_data["status_message"] = "Data is stale" 
            # We might want to nullify sensor values here or let UI handle staleness
            if self.node_online_status.get("remaja", True) and system_logger_available:
                self.node_online_status["remaja"] = False
                log_node_offline(node_name="remaja", 
                                 details="CRITICAL: No MQTT data received from Remaja Master for over 15 seconds.", 
                                 level=LogLevel.CRITICAL,
                                 source=self.source_identifier + "_staleness_check")
            return stale_data
        
        if self.debug:
            logger.debug(f"Returning data: {json.dumps(self.latest_data, indent=2)}")
            
        return self.latest_data

sensor_manager = SensorDataManager()
