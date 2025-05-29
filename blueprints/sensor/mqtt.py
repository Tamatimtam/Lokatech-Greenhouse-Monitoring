import paho.mqtt.client as mqtt
import json
import logging
from datetime import datetime, timedelta, timezone
import time # For throughput calculation
import os # For process ID
import psutil # For CPU and Memory usage

# Import system logger
try:
    from ..logs.firestore_logger import log_event, LogType, LogLevel, log_sensor_error, log_sensor_operational, log_node_offline, log_node_online
    system_logger_available = True
except ImportError:
    system_logger_available = False
    # Define dummy logger functions if the import fails to prevent runtime errors
    class LogType: SENSOR_ERROR = "SENSOR_ERROR"; CONNECTION_LOST = "CONNECTION_LOST"; CONNECTION_RESTORED = "CONNECTION_RESTORED"; FAN_ON_AUTO = "FAN_ON_AUTO"; FAN_OFF_AUTO = "FAN_OFF_AUTO"; LIGHT_ON_AUTO = "LIGHT_ON_AUTO"; LIGHT_OFF_AUTO = "LIGHT_OFF_AUTO"; NODE_OFFLINE = "NODE_OFFLINE"; NODE_ONLINE = "NODE_ONLINE"
    class LogLevel: ERROR = "ERROR"; WARNING = "WARNING"; INFO = "INFO"; CRITICAL = "CRITICAL"
    def log_event(log_type, level, node=None, sensor_type=None, details=None, source=None): logging.warning(f"[DUMMY_SYS_LOG] Type: {log_type}, Level: {level}, Node: {node}, Details: {details}, Source: {source}")
    def log_sensor_error(node, sensor_type, details, source): logging.warning(f"[DUMMY_SYS_LOG_SENSOR_ERROR] Node: {node}, Sensor: {sensor_type}, Details: {details}, Source: {source}")
    def log_sensor_operational(node, sensor_type, details, source): logging.warning(f"[DUMMY_SYS_LOG_SENSOR_OPERATIONAL] Node: {node}, Sensor: {sensor_type}, Details: {details}, Source: {source}")
    def log_node_offline(node_name, details, level=LogLevel.WARNING, source="node_monitor"): logging.warning(f"[DUMMY_NODE_OFFLINE] Node: {node_name}, Details: {details}, Level: {level}, Source: {source}")
    def log_node_online(node_name, details, source="node_monitor"): logging.warning(f"[DUMMY_NODE_ONLINE] Node: {node_name}, Details: {details}, Source: {source}")

logger = logging.getLogger(__name__)

class SensorDataManager:
    NODE_OFFLINE_GRACE_PERIOD_SECONDS = 30  # Grace period before logging a node as offline
    NODE_STATUS_CHECK_INTERVAL_SECONDS = 10  # How often to check node statuses
    NODE_STALE_THRESHOLD_SECONDS = 15  # Threshold for overall MQTT feed staleness

    def __init__(self):
        self.latest_data = {
            "sections": {
                "penyemaian": {}, 
                "remaja": {},     
                "dewasa": {}      
            },
            "averages": {"temp": None, "humidity": None, "light": None},
            "timestamp": None,
            "actuators": { 
                "fan": {"state": None, "mode": "auto"},
                "light": {"state": None, "mode": "auto"}
            },
            "log_data": {
                "hardware_send_timestamp_str": None,
                "server_mqtt_recv_timestamp_str": None,
                "mqtt_latency_ms": None,
                "espnow_latency_penyemaian_ms": None,
                "espnow_latency_dewasa_ms": None,
                "websocket_send_timestamp_str": None,
                "packet_id": 0,
                # New fields for testing plan
                "cpu_backend_percent": None,
                "memory_backend_mb": None,
                "mqtt_jitter_ms": None,
                "espnow_penyemaian_jitter_ms": None,
                "espnow_dewasa_jitter_ms": None,
                "msgs_per_sec_backend": None,
                "throughput_backend_percentage": None,
                "packet_loss_backend_percentage": None,
            }
        }
        self.last_update = None  # Timestamp of the last MQTT message received from Remaja
        self.mqtt_connected = False
        self.socketio = None 
        self.packet_counter = 0
        self.source_identifier = "flask_sensor_manager"
        
        # New state for node online/offline logic with grace period
        self.node_last_valid_data_time = {
            # Initialize with current time to prevent immediate offline logs on startup
            'penyemaian': time.monotonic(),
            'remaja': time.monotonic(),
            'dewasa': time.monotonic()
        }
        self.node_logged_as_offline = {
            'penyemaian': False,
            'remaja': False,
            'dewasa': False
        }
        self.last_node_status_check_time = time.monotonic()
        
        # For psutil
        self.process = psutil.Process(os.getpid())
        self.process.cpu_percent(interval=None)  # Initialize cpu_percent, first call returns 0.0 or None

        # For jitter calculation
        self.prev_mqtt_latency = None
        self.prev_espnow_penyemaian_latency = None
        self.prev_espnow_dewasa_latency = None

        # For throughput/packet loss calculation
        self.last_received_packet_id_from_payload = 0
        self.total_expected_packets_from_payload = 0
        self.time_first_packet_received = None
        self.time_last_throughput_calc = time.monotonic()
        self.packets_since_last_throughput_calc = 0

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
            # When MQTT disconnects, Remaja (master) is definitely offline.
            if not self.node_logged_as_offline.get("remaja", False):
                log_node_offline(node_name="remaja", 
                                 details="CRITICAL: Lost connection to MQTT broker. Remaja Master is considered offline.", 
                                 level=LogLevel.CRITICAL, 
                                 source=self.source_identifier)
                self.node_logged_as_offline["remaja"] = True

    def check_and_log_node_statuses(self):
        """
        Periodically checks if nodes have been silent for too long and logs them as offline.
        """
        current_mono_time = time.monotonic()
        if current_mono_time - self.last_node_status_check_time < self.NODE_STATUS_CHECK_INTERVAL_SECONDS:
            return  # Not time to check yet

        self.last_node_status_check_time = current_mono_time

        for section_name in self.node_last_valid_data_time.keys():
            time_since_last_valid = current_mono_time - self.node_last_valid_data_time[section_name]

            if time_since_last_valid > self.NODE_OFFLINE_GRACE_PERIOD_SECONDS:
                if not self.node_logged_as_offline[section_name] and system_logger_available:
                    # Node has been silent or sending only nulls for longer than grace period
                    level = LogLevel.CRITICAL if section_name == "remaja" else LogLevel.WARNING
                    details_msg = (
                        f"Node {section_name} has not sent valid data for over "
                        f"{self.NODE_OFFLINE_GRACE_PERIOD_SECONDS} seconds. Node considered offline."
                    )
                    log_node_offline(
                        node_name=section_name,
                        details=details_msg,
                        level=level,
                        source=self.source_identifier + "_grace_period_check"
                    )
                    self.node_logged_as_offline[section_name] = True
                    # Update internal state for UI
                    if section_name in self.latest_data['sections']:
                        self.latest_data['sections'][section_name]['_internal_status_online'] = False

    
    def on_message(self, client, userdata, msg):
        server_mqtt_recv_time = datetime.now(timezone.utc)  # Record reception time immediately
        try:
            if self.debug:
                logger.debug(f"Raw MQTT message received on topic {msg.topic}: {msg.payload.decode()}")
            
            data = json.loads(msg.payload.decode())
            
            if self.debug:
                logger.debug(f"Parsed MQTT data: {json.dumps(data, indent=2)}")

            # Before validation, update the main last_update timestamp
            self.last_update = datetime.now(timezone.utc)  # MQTT message received from Remaja

            # If Remaja was logged as offline due to MQTT disconnect, mark it online now.
            if self.node_logged_as_offline.get("remaja", False) and system_logger_available:
                log_node_online(node_name="remaja", details="Remaja Master is back online and sending MQTT data.", source=self.source_identifier)
                self.node_logged_as_offline["remaja"] = False
                self.node_last_valid_data_time["remaja"] = time.monotonic()
                if 'remaja' in self.latest_data['sections']:
                    self.latest_data['sections']['remaja']['_internal_status_online'] = True
            
            self.validate_and_store_data(data, server_mqtt_recv_time)
            self.check_and_log_node_statuses()  # Check other node statuses after processing

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
        
        required_top_level_keys = ['hardware_send_timestamp_str', 'sections', 'averages', 'actuators']
        if 'log_data' in data and isinstance(data['log_data'], dict) and 'packet_id' in data['log_data']:
             pass # Simulator might be sending its own packet_id

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

        # --- MODIFIED: Node Online/Offline Data Update ---
        # Check data validity for each section and update last_valid_data_time
        expected_sections_in_payload = ["penyemaian", "remaja", "dewasa"]
        for section_name in expected_sections_in_payload:
            section_payload_data = data.get("sections", {}).get(section_name)
            node_has_any_valid_sensor_data = False
            if section_payload_data:  # If section data exists in payload
                primary_sensors = ['temp', 'humidity', 'light']
                # A section is considered sending valid data if at least one primary sensor is not null AND not 0
                for sensor_key in primary_sensors:
                    val = section_payload_data.get(sensor_key)
                    if val is not None and val != 0:  # Light can be 0 and valid, but temp/humidity usually not
                        if sensor_key == 'light' and val == 0:  # If light is 0, it's still valid data point
                            node_has_any_valid_sensor_data = True
                            break
                        elif sensor_key != 'light':  # temp or humidity
                            node_has_any_valid_sensor_data = True
                            break 
                
                # If section is present but all primary sensors are null or 0 (error state for temp/hum)
                # We still count this as the node "reporting", just reporting errors/nulls.
                # The grace period check will eventually mark it offline if this persists.
                is_section_present_in_payload = section_name in data.get("sections", {})
                if is_section_present_in_payload and not node_has_any_valid_sensor_data:
                    # Don't update last_valid_data_time, let grace period handle it.
                    logger.debug(f"Node {section_name} reported, but all primary sensors are null or in error state. Not updating last_valid_data_time.")
                
            if node_has_any_valid_sensor_data:
                self.node_last_valid_data_time[section_name] = time.monotonic()
                if self.node_logged_as_offline[section_name] and system_logger_available:
                    log_node_online(node_name=section_name, details=f"Node {section_name} data received. Node is back online.", source=self.source_identifier + "_data_reception")
                    self.node_logged_as_offline[section_name] = False
                # Update internal status for UI
                if section_name in self.latest_data['sections']:
                    self.latest_data['sections'][section_name]['_internal_status_online'] = True
 

        # Store core data
        self.latest_data["timestamp"] = data.get("hardware_send_timestamp_str")  # Use hardware ts as main ts
        self.latest_data["averages"] = data.get("averages", {"temp": None, "humidity": None, "light": None})
        self.latest_data["actuators"] = data.get("actuators") 

        for section_name in expected_sections_in_payload:  # Use MQTT keys
            self.latest_data["sections"][section_name] = data.get("sections", {}).get(section_name, {})
            # Add the online status to the data sent to frontend
            if section_name in self.latest_data["sections"]:
                self.latest_data["sections"][section_name]['_internal_status_online'] = not self.node_logged_as_offline.get(section_name, False)

        # --- Performance and Latency Data Processing ---
        self.packet_counter += 1
        self.packets_since_last_throughput_calc += 1

        current_log_data = self.latest_data["log_data"]
        current_log_data["packet_id"] = self.packet_counter
        
        hw_ts_str = data.get("hardware_send_timestamp_str")
        current_log_data["hardware_send_timestamp_str"] = hw_ts_str
        current_log_data["server_mqtt_recv_timestamp_str"] = server_mqtt_recv_time.isoformat().replace('+00:00', 'Z')

        # MQTT Latency
        current_mqtt_latency = None
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

                current_mqtt_latency = (server_mqtt_recv_time - hw_ts_dt).total_seconds() * 1000
                current_log_data["mqtt_latency_ms"] = round(current_mqtt_latency, 2)
            except ValueError as ve:
                logger.error(f"Error parsing hardware_send_timestamp_str '{hw_ts_str}': {ve}")
                current_log_data["mqtt_latency_ms"] = None
        else:
            current_log_data["mqtt_latency_ms"] = None
        
        # MQTT Jitter
        if current_mqtt_latency is not None and self.prev_mqtt_latency is not None:
            current_log_data["mqtt_jitter_ms"] = round(abs(current_mqtt_latency - self.prev_mqtt_latency), 2)
        else:
            current_log_data["mqtt_jitter_ms"] = None
        self.prev_mqtt_latency = current_mqtt_latency

        # ESP-NOW Latencies & Jitters
        espnow_penyemaian_ms = data.get("sections", {}).get("penyemaian", {}).get("espnow_latency_ms")
        current_log_data["espnow_latency_penyemaian_ms"] = espnow_penyemaian_ms
        if espnow_penyemaian_ms is not None and self.prev_espnow_penyemaian_latency is not None and espnow_penyemaian_ms != -1 and self.prev_espnow_penyemaian_latency != -1:
            current_log_data["espnow_penyemaian_jitter_ms"] = round(abs(espnow_penyemaian_ms - self.prev_espnow_penyemaian_latency), 2)
        else:
            current_log_data["espnow_penyemaian_jitter_ms"] = None
        self.prev_espnow_penyemaian_latency = espnow_penyemaian_ms if espnow_penyemaian_ms != -1 else self.prev_espnow_penyemaian_latency

        espnow_dewasa_ms = data.get("sections", {}).get("dewasa", {}).get("espnow_latency_ms")
        current_log_data["espnow_latency_dewasa_ms"] = espnow_dewasa_ms
        if espnow_dewasa_ms is not None and self.prev_espnow_dewasa_latency is not None and espnow_dewasa_ms != -1 and self.prev_espnow_dewasa_latency != -1:
            current_log_data["espnow_dewasa_jitter_ms"] = round(abs(espnow_dewasa_ms - self.prev_espnow_dewasa_latency), 2)
        else:
            current_log_data["espnow_dewasa_jitter_ms"] = None
        self.prev_espnow_dewasa_latency = espnow_dewasa_ms if espnow_dewasa_ms != -1 else self.prev_espnow_dewasa_latency
        
        # Backend CPU and Memory
        try:
            current_log_data["cpu_backend_percent"] = round(self.process.cpu_percent(interval=None), 2)
            memory_info = self.process.memory_info()
            current_log_data["memory_backend_mb"] = round(memory_info.rss / (1024 * 1024), 2)
        except Exception as e:
            logger.warning(f"Could not get CPU/Memory stats: {e}")
            current_log_data["cpu_backend_percent"] = None
            current_log_data["memory_backend_mb"] = None

        # Throughput and Packet Loss
        payload_packet_id = None
        if 'log_data' in data and isinstance(data['log_data'], dict) and 'packet_id' in data['log_data']:
            payload_packet_id = data['log_data']['packet_id']
        elif 'remaja' in data.get('sections', {}) and isinstance(data['sections']['remaja'], dict) and 'packet_id' in data['sections']['remaja']:
            payload_packet_id = data['sections']['remaja']['packet_id']

        if payload_packet_id is not None:
            try:
                payload_packet_id = int(payload_packet_id)
                if self.time_first_packet_received is None:
                    self.time_first_packet_received = time.monotonic()
                    self.last_received_packet_id_from_payload = payload_packet_id - 1
                
                if payload_packet_id > self.total_expected_packets_from_payload:
                    self.total_expected_packets_from_payload = payload_packet_id
            
            except ValueError:
                logger.warning(f"Could not parse payload_packet_id '{payload_packet_id}' as int.")
                payload_packet_id = None

        # Calculate msgs_per_sec_backend
        current_mono_time = time.monotonic()
        elapsed_throughput_time = current_mono_time - self.time_last_throughput_calc
        if elapsed_throughput_time >= 1.0:
            current_log_data["msgs_per_sec_backend"] = round(self.packets_since_last_throughput_calc / elapsed_throughput_time, 2)
            self.packets_since_last_throughput_calc = 0
            self.time_last_throughput_calc = current_mono_time
        elif "msgs_per_sec_backend" not in current_log_data or current_log_data["msgs_per_sec_backend"] is None:
             current_log_data["msgs_per_sec_backend"] = self.latest_data["log_data"].get("msgs_per_sec_backend")

        # Calculate throughput and packet loss
        if payload_packet_id is not None and self.total_expected_packets_from_payload > 0:
            processed_count_for_throughput = self.packet_counter
            if processed_count_for_throughput > self.total_expected_packets_from_payload:
                 logger.warning(f"Backend packet_counter ({processed_count_for_throughput}) > total_expected_from_payload ({self.total_expected_packets_from_payload}). Throughput might be >100% if not capped.")
            
            throughput_val = (processed_count_for_throughput / self.total_expected_packets_from_payload) * 100
            current_log_data["throughput_backend_percentage"] = round(min(100.0, throughput_val), 2)
            current_log_data["packet_loss_backend_percentage"] = round(max(0.0, 100.0 - current_log_data["throughput_backend_percentage"]), 2)
        else:
            current_log_data["throughput_backend_percentage"] = None
            current_log_data["packet_loss_backend_percentage"] = None
        
        # --- End Performance Data ---

        self.last_update = datetime.now(timezone.utc)
        logger.info(f"Updated sensor data (Backend PID: {current_log_data['packet_id']}, Sim PID: {payload_packet_id if payload_packet_id is not None else 'N/A'}). MQTT Latency: {current_log_data['mqtt_latency_ms'] if current_log_data['mqtt_latency_ms'] is not None else 'N/A'} ms")
        if self.debug:
            logger.debug(f"Stored data (incl. log_data): {json.dumps(self.latest_data, indent=2)}")

        if self.socketio:
            try:
                self.latest_data["log_data"]["websocket_send_timestamp_str"] = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')
                self.socketio.emit('sensor_update', self.latest_data)
                logger.info("Emitted 'sensor_update' via WebSocket")
            except Exception as emit_error:
                logger.error(f"Failed to emit WebSocket update: {emit_error}")
        return True
    
    def get_data(self):
        current_time_utc = datetime.now(timezone.utc)
        
        # Perform periodic node status check
        self.check_and_log_node_statuses()

        # Check if Remaja master is stale (no MQTT messages at all for a while)
        if self.last_update and (current_time_utc - self.last_update > timedelta(seconds=self.NODE_STALE_THRESHOLD_SECONDS)):
            logger.warning(f"Data from Remaja Master is STALE. Last MQTT message: {self.last_update}")
            if system_logger_available and not self.node_logged_as_offline.get("remaja", False):
                log_node_offline(node_name="remaja", 
                                 details=f"CRITICAL: No MQTT data received from Remaja Master for over {self.NODE_STALE_THRESHOLD_SECONDS} seconds.", 
                                 level=LogLevel.CRITICAL,
                                 source=self.source_identifier + "_staleness_check_master")
                self.node_logged_as_offline["remaja"] = True
                if 'remaja' in self.latest_data['sections']:
                    self.latest_data['sections']['remaja']['_internal_status_online'] = False
            # Return last known data but indicate overall staleness
            stale_data = self.latest_data.copy() 
            stale_data["status_message"] = "Data from Remaja Master is stale" 
            return stale_data
        
        if not self.latest_data or self.latest_data.get("timestamp") is None:
            logger.warning("No data available or no updates received yet from Remaja Master")
            return {
                "sections": { 
                    "penyemaian": {'_internal_status_online': False}, 
                    "remaja": {'_internal_status_online': False}, 
                    "dewasa": {'_internal_status_online': False} 
                },
                "averages": {"temp": None, "humidity": None, "light": None},
                "timestamp": None,
                "actuators": { 
                    "fan": {"state": None, "mode": "auto"},
                    "light": {"state": None, "mode": "auto"}
                },
                "log_data": {
                    "hardware_send_timestamp_str": None,
                    "server_mqtt_recv_timestamp_str": None,
                    "mqtt_latency_ms": None,
                    "espnow_latency_penyemaian_ms": None,
                    "espnow_latency_dewasa_ms": None,
                    "websocket_send_timestamp_str": None,
                    "packet_id": 0,
                    "cpu_backend_percent": None,
                    "memory_backend_mb": None,
                    "mqtt_jitter_ms": None,
                    "espnow_penyemaian_jitter_ms": None,
                    "espnow_dewasa_jitter_ms": None,
                    "msgs_per_sec_backend": None,
                    "throughput_backend_percentage": None,
                    "packet_loss_backend_percentage": None,
                },
                "status_message": "No data available from Remaja Master"
            }
            
        if self.debug:
            logger.debug(f"Returning data via get_data(): {json.dumps(self.latest_data, indent=2)}")
            
        # Ensure _internal_status_online is present for all sections when returning data
        for section_name in self.latest_data["sections"]:
            if '_internal_status_online' not in self.latest_data["sections"][section_name]:
                self.latest_data["sections"][section_name]['_internal_status_online'] = not self.node_logged_as_offline.get(section_name, True)  # Default to offline if not tracked

        return self.latest_data

sensor_manager = SensorDataManager()
