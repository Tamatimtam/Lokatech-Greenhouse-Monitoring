# This script listens to an MQTT topic for greenhouse sensor data, aggregates it over
# a defined interval, calculates statistics (avg, min, max, median), and then
# saves these aggregated statistics to a Firestore database.

import paho.mqtt.client as mqtt # For MQTT communication with the sensor network
import json                     # For parsing JSON data from MQTT messages
import time                     # For handling time-related operations (tracking collection intervals)
import firebase_admin           # Firebase Admin SDK for database connectivity
from firebase_admin import credentials # For Firebase authentication using service account
from firebase_admin import firestore   # For interacting with Firestore database collections
import datetime                 # For generating timestamps for data records
import statistics               # For calculating statistical measures (mean, median, etc.)
import os                       # For path manipulation to locate credentials file
import sys # Add sys for path manipulation

# Add project root to sys.path to allow importing blueprints
script_dir_for_import = os.path.dirname(os.path.abspath(__file__))
project_root_for_import = os.path.dirname(os.path.dirname(script_dir_for_import))
if project_root_for_import not in sys.path:
    sys.path.insert(0, project_root_for_import)

try:
    from blueprints.logs.firestore_logger import log_event, LogType, LogLevel, log_sensor_error
    logger_available = True
except ImportError as e:
    print(f"Warning: System logger (firestore_logger) not found due to ImportError: {e}. "
          "Errors from this script will not be logged to the system_logs collection.")
    logger_available = False
    # Define dummy logger functions if the import fails
    class LogType: SENSOR_ERROR = "SENSOR_ERROR"; CONNECTION_LOST = "CONNECTION_LOST"; CONNECTION_RESTORED = "CONNECTION_RESTORED" # Dummy
    class LogLevel: ERROR = "ERROR"; WARNING = "WARNING"; INFO = "INFO" # Dummy
    def log_event(log_type, level, node=None, sensor_type=None, details=None, source=None): print(f"[DUMMY_LOG] Type: {log_type}, Level: {level}, Node: {node}, Details: {details}, Source: {source}")
    def log_sensor_error(node, sensor_type, details, source): print(f"[DUMMY_LOG_SENSOR_ERROR] Node: {node}, Sensor: {sensor_type}, Details: {details}, Source: {source}")


# --- Firebase Setup and Initialization ---
# Construct the absolute path to the Firebase credentials JSON file.
# This makes the script more portable as it doesn't rely on hardcoded paths.
script_dir = os.path.dirname(os.path.abspath(__file__)) # Get directory of current script
project_root = os.path.dirname(os.path.dirname(script_dir))  # Navigate up two levels to project root
cred_path = os.path.join(project_root, 'secrets', 'firebase-credentials.json') # Path to Firebase credentials

# Load Firebase credentials and initialize the Firebase Admin app
# This happens once when the script starts
cred = credentials.Certificate(cred_path)
if not firebase_admin._apps: # Check if app is already initialized to avoid duplicate initialization
    firebase_admin.initialize_app(cred)
db = firestore.client() # Get a Firestore client instance to interact with the database

# --- MQTT Configuration ---
# Connection details for the MQTT broker (server)
MQTT_SERVER = "d1b364f4ed864e92b1fb464a3201e5ae.s1.eu.hivemq.cloud" # Address of the MQTT broker
MQTT_PORT = 8883  # Standard TLS/SSL port for secure MQTT connections
MQTT_USER = "LokataniAdmin" # Username for MQTT broker authentication
MQTT_PASSWORD = "LokataniAdmin123" # Password for MQTT broker authentication
MQTT_SUBSCRIBE_TOPIC = "lokatech/greenhouse/sensors" # The topic where sensor data is published

# --- Data Collection Configuration ---
COLLECTION_INTERVAL_MINUTES = 1  # How long to collect data before aggregating and saving to Firestore
                                 # With value 1, data is processed and saved every minute

# In-memory storage for accumulating sensor readings during the collection interval
# Data is organized by greenhouse section and sensor type (temperature, humidity, light)
collection_data = {
    "penyemaian": { "temps": [], "humidities": [], "lights": [] }, # Seedling/germination section
    "remaja": { "temps": [], "humidities": [], "lights": [] },     # Juvenile/growing section
    "dewasa": { "temps": [], "humidities": [], "lights": [] },     # Mature/adult section
    "averages": { "temps": [], "humidities": [], "lights": [] }    # Overall greenhouse averages
}
last_save_time = time.time() # Timestamp of when data was last saved, used to track collection intervals

# --- MQTT Callback Functions ---

def on_connect(client, userdata, flags, rc):
    """
    Callback executed when the MQTT client connects to the broker.
    
    Parameters:
    - client: The client instance that connected
    - userdata: User data passed to the client constructor (not used here)
    - flags: Response flags sent by the broker
    - rc: Return code indicating connection success (0) or failure (non-zero)
    """
    if rc == 0:
        print("Connected to MQTT Broker!")
        # Once connected, subscribe to the topic to receive sensor data
        client.subscribe(MQTT_SUBSCRIBE_TOPIC)
        print(f"Subscribed to {MQTT_SUBSCRIBE_TOPIC}")
        if logger_available:
            log_event(LogType.CONNECTION_RESTORED, LogLevel.INFO, node="mqtt_aggregator_script", details="Successfully connected to MQTT Broker.", source="mqtt_to_firestore.py")
    else:
        print(f"Failed to connect, return code {rc}")
        if logger_available:
            log_event(LogType.CONNECTION_LOST, LogLevel.ERROR, node="mqtt_aggregator_script", details=f"Failed to connect to MQTT Broker. Return code: {rc}", source="mqtt_to_firestore.py")
        # Common return codes: 1 (incorrect protocol), 3 (server unavailable), 5 (unauthorized)

def on_message(client, userdata, msg):
    """
    Callback executed whenever a message is received on the subscribed topic.
    
    Parameters:
    - client: The client instance that received the message
    - userdata: User data passed to the client constructor (not used here)
    - msg: An object containing the topic and payload of the received message
    """
    try:
        payload_str = msg.payload.decode()
        payload = json.loads(payload_str)
        process_mqtt_data(payload) # Pass the parsed data for processing
    except json.JSONDecodeError as e:
        err_details = f"Invalid JSON on topic {msg.topic}. Error: {e}. Payload: {msg.payload.decode(errors='ignore')[:200]}"
        print(f"Error: {err_details}")
        if logger_available:
            log_sensor_error(node="mqtt_aggregator_script", sensor_type="json_payload", details=err_details, source="mqtt_to_firestore.py")
    except UnicodeDecodeError as e:
        err_details = f"Unicode decode error on topic {msg.topic}. Error: {e}. Raw Payload: {str(msg.payload)[:200]}"
        print(f"Error: {err_details}")
        if logger_available:
            log_sensor_error(node="mqtt_aggregator_script", sensor_type="payload_encoding", details=err_details, source="mqtt_to_firestore.py")
    except Exception as e:
        err_details = f"Generic error in on_message: {e}"
        print(f"Error: {err_details}")
        if logger_available:
            log_event(LogType.SENSOR_ERROR, LogLevel.ERROR, node="mqtt_aggregator_script", details=err_details, source="mqtt_to_firestore.py")


# --- Data Processing Functions ---

def process_mqtt_data(payload):
    """
    Processes incoming sensor data from MQTT, storing values for later aggregation.
    Also checks if it's time to calculate statistics and save to Firestore.
    
    Parameters:
    - payload: JSON data containing sensor readings from the greenhouse
    """
    global collection_data, last_save_time # Access these variables from global scope
    source_script = "mqtt_to_firestore.py"

    try:
        # Extract sensor data for each greenhouse section from the payload
        for section_name in ["penyemaian", "remaja", "dewasa"]: # Each growing stage
            if section_name in payload.get("sections", {}): # Check if section exists in payload
                section_payload = payload["sections"][section_name]
                
                # Extract and store temperature readings if available
                temp_val = section_payload.get("temp")
                if temp_val is not None:
                    try:
                        collection_data[section_name]["temps"].append(float(temp_val))
                    except (ValueError, TypeError) as e:
                        if logger_available:
                            log_sensor_error(node=section_name, sensor_type="temp", details=f"Invalid temp value: '{temp_val}'. Error: {e}", source=source_script)
                else:
                    if logger_available:
                         log_sensor_error(node=section_name, sensor_type="temp", details="Temp data missing or null.", source=source_script)
                
                # Extract and store humidity readings if available
                humidity_val = section_payload.get("humidity")
                if humidity_val is not None:
                    try:
                        collection_data[section_name]["humidities"].append(float(humidity_val))
                    except (ValueError, TypeError) as e:
                        if logger_available:
                            log_sensor_error(node=section_name, sensor_type="humidity", details=f"Invalid humidity value: '{humidity_val}'. Error: {e}", source=source_script)
                else:
                    if logger_available:
                        log_sensor_error(node=section_name, sensor_type="humidity", details="Humidity data missing or null.", source=source_script)
                
                # Extract and store light intensity readings if available
                light_val = section_payload.get("light")
                if light_val is not None:
                    try:
                        collection_data[section_name]["lights"].append(float(light_val))
                    except (ValueError, TypeError) as e:
                        if logger_available:
                            log_sensor_error(node=section_name, sensor_type="light", details=f"Invalid light value: '{light_val}'. Error: {e}", source=source_script)
                else:
                    if logger_available:
                        log_sensor_error(node=section_name, sensor_type="light", details="Light data missing or null.", source=source_script)
            else:
                if logger_available:
                    log_event(LogType.SENSOR_ERROR, LogLevel.WARNING, node=section_name, details=f"Section data missing in payload for '{section_name}'.", source=source_script)


        # Also process overall average values if provided in the payload
        if "averages" in payload:
            avg_payload = payload["averages"]
            if "temp" in avg_payload and avg_payload["temp"] is not None:
                collection_data["averages"]["temps"].append(float(avg_payload["temp"]))
            if "humidity" in avg_payload and avg_payload["humidity"] is not None:
                collection_data["averages"]["humidities"].append(float(avg_payload["humidity"]))
            if "light" in avg_payload and avg_payload["light"] is not None:
                collection_data["averages"]["lights"].append(float(avg_payload["light"]))

        # Check if the collection interval has elapsed
        current_time = time.time()
        # Calculate minutes since last save
        if (current_time - last_save_time) / 60 >= COLLECTION_INTERVAL_MINUTES:
            print(f"{(current_time - last_save_time) / 60:.2f} minutes elapsed. Time to save data.")
            save_data_to_firestore()    # Calculate stats and save to Firestore
            reset_collection_data()     # Clear collected data for next interval
            last_save_time = current_time # Reset the timer
    except Exception as e:
        err_details = f"Error processing MQTT data payload: {e}"
        print(err_details)
        if logger_available:
            log_event(LogType.SENSOR_ERROR, LogLevel.ERROR, node="mqtt_aggregator_script", details=err_details, source=source_script)

def calculate_stats(values):
    """
    Calculates statistical measures for a list of sensor readings.
    
    Parameters:
    - values: List of numerical values (sensor readings)
    
    Returns:
    - Dictionary containing average, min, max, median, and count statistics
    - None if the input list is empty or contains no valid numbers
    """
    if not values: return None  # Handle empty lists
    
    # Filter out any non-numeric values that might have been included
    filtered_values = [v for v in values if isinstance(v, (int, float))]
    
    if not filtered_values:
        # Return placeholder if no valid numeric values were found
        return {"avg": None, "min": None, "max": None, "median": None, "count": 0}
    
    # Calculate statistics, rounding to 2 decimal places for readability
    return {
        "avg": round(statistics.mean(filtered_values), 2),     # Average value
        "min": round(min(filtered_values), 2),                 # Minimum value
        "max": round(max(filtered_values), 2),                 # Maximum value
        "median": round(statistics.median(filtered_values), 2), # Median value
        "count": len(filtered_values)                          # Number of readings
    }

def save_data_to_firestore():
    """
    Calculates statistics for all collected sensor data and saves 
    the results to Firestore database collections.
    
    Creates a new document with current timestamp as ID containing:
    - Timestamp when data was saved
    - Statistics for each section and sensor type
    - Metadata about the collection process
    """
    try:
        print("Attempting to save aggregated data to Firestore...")
        # Create a timezone-aware UTC timestamp for the document
        current_timestamp = datetime.datetime.now(datetime.timezone.utc)
        # Format timestamp as string for document ID (ISO format without microsecond precision)
        document_id_str = current_timestamp.strftime("%Y-%m-%d %H:%M:%S.%f")[:-3] + "Z"

        # Prepare the document data structure
        firestore_doc_data = {
            "timestamp": current_timestamp, # Stored as Firestore timestamp type
            "stats": {},                    # Will contain all calculated statistics
            "metadata": {
                "collection_minutes": COLLECTION_INTERVAL_MINUTES,
                "samples_count_avg_temp": len(collection_data["averages"]["temps"])
            }
        }
        
        # Calculate statistics for each section and data type
        for section_name, data_types in collection_data.items():
            firestore_doc_data["stats"][section_name] = {}
            for data_type_name, values_list in data_types.items():
                # Calculate stats only if we have data
                stats_results = calculate_stats(values_list) if values_list else None
                firestore_doc_data["stats"][section_name][data_type_name] = stats_results
        
        # Save to primary 'greenhouse_data' collection in Firestore
        db.collection('greenhouse_data').document(document_id_str).set(firestore_doc_data)
        print(f"Data successfully saved to 'greenhouse_data' with ID: {document_id_str}")
        
        # Also save to 'lokatech_db' collection (possibly for different application access)
        db.collection('lokatech_db').document(document_id_str).set(firestore_doc_data)
        print(f"Data successfully saved to 'lokatech_db' with ID: {document_id_str}")

    except Exception as e:
        print(f"Error saving data to Firestore: {e}")

def reset_collection_data():
    """
    Clears all accumulated sensor data after it has been processed and saved.
    This prepares the collection containers for the next interval.
    """
    global collection_data
    # Reset all data arrays to empty lists
    for section_key in collection_data:
        for data_type_key in collection_data[section_key]:
            collection_data[section_key][data_type_key] = []

def run_collector():
    """
    Main function that initializes the MQTT client, connects to the broker,
    and starts the network loop to listen for incoming messages.
    
    This function includes error handling and graceful shutdown procedures.
    """
    # Create a unique client ID to avoid conflicts with other clients
    client = mqtt.Client(client_id="firestore_collector_client_v2")
    client.on_connect = on_connect  # Set connect callback
    client.on_message = on_message  # Set message callback
    
    try:
        # Configure secure connection with credentials
        client.username_pw_set(MQTT_USER, MQTT_PASSWORD)
        client.tls_set()  # Enable TLS/SSL for secure communication
        
        print(f"Attempting to connect to MQTT broker: {MQTT_SERVER}:{MQTT_PORT}...")
        client.connect(MQTT_SERVER, MQTT_PORT, keepalive=60) # Connect with 60s keepalive
        
        # Start network loop - this is a blocking call that handles
        # receiving messages and maintaining the connection
        client.loop_forever()
        
    except KeyboardInterrupt: 
        print("Collector stopped by user.")
    except ConnectionRefusedError:
        err_details = "Connection refused. Check MQTT broker address, port, and firewall."
        print(err_details)
        if logger_available:
            log_event(LogType.CONNECTION_LOST, LogLevel.CRITICAL, node="mqtt_aggregator_script", details=err_details, source="mqtt_to_firestore.py")
    except Exception as e:
        err_details = f"An unexpected error occurred in run_collector: {e}"
        print(err_details)
        if logger_available:
            log_event(LogType.CONNECTION_LOST, LogLevel.CRITICAL, node="mqtt_aggregator_script", details=err_details, source="mqtt_to_firestore.py")
    finally:
        # Ensure clean disconnection in all cases
        print("Disconnecting MQTT client...")
        client.loop_stop()  # Stop the background thread
        client.disconnect() # Disconnect from broker
        print("MQTT client disconnected.")

if __name__ == "__main__":
    print(f"Starting MQTT to Firestore data collector (for Penyemaian, Remaja, Dewasa).")
    print(f"Data will be aggregated approx. every {COLLECTION_INTERVAL_MINUTES} minute(s).")
    run_collector()
