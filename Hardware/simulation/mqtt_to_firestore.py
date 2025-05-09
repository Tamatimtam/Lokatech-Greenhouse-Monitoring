# This script listens to an MQTT topic for sensor data, aggregates it over
# a defined interval, calculates statistics (avg, min, max), and then
# saves these aggregated statistics to a Firestore database.

import paho.mqtt.client as mqtt # For MQTT communication
import json                     # For parsing JSON data from MQTT messages
import time                     # For handling time-related operations (e.g., collection interval)
import firebase_admin           # Firebase Admin SDK
from firebase_admin import credentials # For Firebase authentication
from firebase_admin import firestore   # For interacting with Firestore database
import datetime                 # For generating timestamps
import threading                # (Not actively used for complex threading here, but imported)
import statistics               # For calculating mean, median
import os                       # For path manipulation to locate credentials file

# --- Firebase Initialization ---
# Construct the absolute path to the Firebase credentials JSON file.
# This makes the script more portable as it doesn't rely on a hardcoded relative path.
script_dir = os.path.dirname(os.path.abspath(__file__)) # Directory of the current script
project_root = os.path.dirname(os.path.dirname(script_dir))  # Navigate up two levels to the project root
cred_path = os.path.join(project_root, 'secrets', 'firebase-credentials.json') # Path to credentials

# Load Firebase credentials and initialize the Firebase Admin app.
# This is done once when the script starts.
cred = credentials.Certificate(cred_path)
if not firebase_admin._apps: # Initialize only if no app has been initialized yet
    firebase_admin.initialize_app(cred)
db = firestore.client() # Get a Firestore client instance to interact with the database

# --- MQTT Configuration ---
MQTT_SERVER = "d1b364f4ed864e92b1fb464a3201e5ae.s1.eu.hivemq.cloud" # Address of the MQTT broker
MQTT_PORT = 8883  # Standard TLS port for MQTT
MQTT_USER = "LokataniAdmin" # Username for MQTT broker authentication
MQTT_PASSWORD = "LokataniAdmin123" # Password for MQTT broker authentication
MQTT_SUBSCRIBE_TOPIC = "lokatech/greenhouse/sensors" # The MQTT topic to listen to for sensor data

# --- Data Collection Configuration ---
COLLECTION_INTERVAL_MINUTES = 1  # Duration (in minutes) to collect data before calculating stats and saving to Firestore.
                                 # For example, if 1, data is aggregated and saved every minute.

# In-memory storage for accumulating sensor readings before processing and saving.
# Data is grouped by section (dewasa, peremajaan, penyemaian) and then by type (temps, humidities, lights).
collection_data = {
    "dewasa": { "temps": [], "humidities": [], "lights": [] },
    "peremajaan": { "temps": [], "humidities": [], "lights": [] },
    "penyemaian": { "temps": [], "humidities": [], "lights": [] },
    "averages": { "temps": [], "humidities": [], "lights": [] } # To store overall averages if provided directly
}

last_save_time = time.time() # Timestamp of the last time data was saved to Firestore. Used to manage the collection interval.

# --- MQTT Callback Functions ---

def on_connect(client, userdata, flags, rc):
    """
    Callback executed when the MQTT client successfully connects to the broker.
    rc (return code) indicates connection status. 0 means success.
    """
    if rc == 0:
        print("Connected to MQTT Broker!")
        # Subscribe to the defined topic once connected.
        client.subscribe(MQTT_SUBSCRIBE_TOPIC)
        print(f"Subscribed to {MQTT_SUBSCRIBE_TOPIC}")
    else:
        print(f"Failed to connect, return code {rc}")

def on_message(client, userdata, msg):
    """
    Callback executed when a message is received on a subscribed MQTT topic.
    `msg.topic` is the topic the message was published on.
    `msg.payload` is the message content (raw bytes).
    """
    try:
        # Decode the message payload from bytes to string, then parse as JSON.
        payload = json.loads(msg.payload.decode())
        # print(f"Received message on topic {msg.topic}: {payload}") # Optional: for debugging
        process_mqtt_data(payload) # Pass the parsed data for processing
    except json.JSONDecodeError:
        print(f"Error: Received invalid JSON data on topic {msg.topic}")
        print(f"Raw payload (first 100 chars): {msg.payload[:100]}...")
    except Exception as e:
        print(f"Error in on_message: {e}")
        import traceback
        traceback.print_exc() # Print full stack trace for detailed debugging

# --- Data Processing and Storage Functions ---

def process_mqtt_data(payload):
    """
    Processes the incoming JSON payload from MQTT.
    Extracts sensor readings and appends them to the `collection_data` lists.
    Checks if it's time to save the aggregated data to Firestore.
    """
    global collection_data, last_save_time # Declare use of global variables

    try:
        # Iterate through expected greenhouse sections
        for section_name in ["dewasa", "peremajaan", "penyemaian"]:
            if section_name in payload.get("sections", {}): # Check if section exists in payload
                section_payload = payload["sections"][section_name]

                # Append temperature, humidity, and light readings if they exist and are not None
                if "temp" in section_payload and section_payload["temp"] is not None:
                    collection_data[section_name]["temps"].append(float(section_payload["temp"]))
                if "humidity" in section_payload and section_payload["humidity"] is not None:
                    collection_data[section_name]["humidities"].append(float(section_payload["humidity"]))
                if "light" in section_payload and section_payload["light"] is not None:
                    collection_data[section_name]["lights"].append(float(section_payload["light"]))

        # Process overall average data if present in the payload
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
        elapsed_minutes = (current_time - last_save_time) / 60 # Calculate elapsed time in minutes

        if elapsed_minutes >= COLLECTION_INTERVAL_MINUTES:
            print(f"{elapsed_minutes:.2f} minutes elapsed. Time to save data.")
            save_data_to_firestore()    # Save aggregated data
            reset_collection_data()     # Clear temporary data for the next interval
            last_save_time = current_time # Update the last save time
            print("Collection data reset and last_save_time updated.")

    except Exception as e:
        print(f"Error processing MQTT data payload: {e}")
        # Depending on the error, you might want to log the payload for debugging
        # print(f"Problematic payload: {payload}")

def calculate_stats(values):
    """
    Calculates statistical measures (average, min, max, median, count) for a list of numerical values.
    Returns a dictionary of these stats, or None if input is empty or contains no valid numbers.
    """
    if not values: # Handle empty list
        return None

    # Filter out any None values that might have slipped in, or if data is not purely numerical
    filtered_values = [v for v in values if isinstance(v, (int, float))]

    if not filtered_values: # Handle list that becomes empty after filtering
        return {
            "avg": None, "min": None, "max": None,
            "median": None, "count": 0
        }

    return {
        "avg": round(statistics.mean(filtered_values), 2),
        "min": round(min(filtered_values), 2),
        "max": round(max(filtered_values), 2),
        "median": round(statistics.median(filtered_values), 2),
        "count": len(filtered_values)
    }

def save_data_to_firestore():
    """
    Calculates statistics for all collected data and saves it as a new document in Firestore.
    The document ID is the current timestamp.
    """
    try:
        print("Attempting to save aggregated data to Firestore...")
        current_timestamp = datetime.datetime.now(datetime.timezone.utc) # Use timezone-aware UTC timestamp
        # Firestore document ID will be the timestamp string for easy sorting/querying
        document_id_str = current_timestamp.strftime("%Y-%m-%d %H:%M:%S.%f")[:-3] + "Z" # ISO 8601 format

        firestore_doc_data = {
            "timestamp": current_timestamp, # Store as Firestore timestamp object
            "stats": {},
            "metadata": {
                "collection_minutes": COLLECTION_INTERVAL_MINUTES,
                # Example: count of samples contributing to the 'averages' temp, if available
                "samples_count_avg_temp": len(collection_data["averages"]["temps"]) if collection_data["averages"]["temps"] else 0
            }
        }

        # Calculate stats for each section and data type
        for section_name, data_types in collection_data.items():
            firestore_doc_data["stats"][section_name] = {}
            for data_type_name, values_list in data_types.items():
                if values_list: # Only calculate if there's data
                    stats_results = calculate_stats(values_list)
                    if stats_results: # Ensure stats were successfully calculated
                        firestore_doc_data["stats"][section_name][data_type_name] = stats_results
                    else:
                        # Store null or an indicator if stats couldn't be calculated but data was present
                        firestore_doc_data["stats"][section_name][data_type_name] = None
                else:
                    # If no data was collected for this type, store None or omit
                    firestore_doc_data["stats"][section_name][data_type_name] = None


        # Get a reference to the Firestore collection and set the document for the primary collection
        doc_ref_primary = db.collection('greenhouse_data').document(document_id_str)
        doc_ref_primary.set(firestore_doc_data)
        print(f"Data successfully saved to 'greenhouse_data' with document ID: {document_id_str}")

        # Also save to the new 'lokatech_db' collection
        doc_ref_new_collection = db.collection('lokatech_db').document(document_id_str)
        doc_ref_new_collection.set(firestore_doc_data)
        print(f"Data successfully saved to 'lokatech_db' with document ID: {document_id_str}")

    except Exception as e:
        print(f"Error saving data to Firestore: {e}")
        import traceback
        traceback.print_exc()

def reset_collection_data():
    """
    Resets the `collection_data` lists to empty, preparing for the next collection interval.
    """
    global collection_data
    for section_key in collection_data:
        for data_type_key in collection_data[section_key]:
            collection_data[section_key][data_type_key] = []
    # print("collection_data has been reset.") # Optional: for debugging

# --- Main Execution ---

def run_collector():
    """
    Initializes the MQTT client, sets up callbacks, connects to the broker,
    and starts the network loop to listen for messages.
    """
    client = mqtt.Client(client_id="firestore_collector_client") # Unique client ID
    client.on_connect = on_connect    # Assign the on_connect callback
    client.on_message = on_message    # Assign the on_message callback

    try:
        # Set username and password for MQTT broker authentication
        client.username_pw_set(MQTT_USER, MQTT_PASSWORD)

        # Enable TLS for a secure connection to the MQTT broker
        # This typically uses system CA certificates by default.
        # For specific CA certs: client.tls_set(ca_certs="path/to/ca.crt")
        client.tls_set()

        print(f"Attempting to connect to MQTT broker: {MQTT_SERVER} on port {MQTT_PORT}...")
        client.connect(MQTT_SERVER, MQTT_PORT, keepalive=60) # keepalive=60 seconds

        # `loop_forever()` is a blocking call that processes network traffic,
        # dispatches callbacks, and handles reconnecting.
        client.loop_forever()

    except KeyboardInterrupt: # Allow graceful shutdown with Ctrl+C
        print("Collector stopped by user (KeyboardInterrupt).")
    except ConnectionRefusedError:
        print(f"Connection refused. Check MQTT broker address, port, and firewall.")
    except Exception as e:
        print(f"An unexpected error occurred in run_collector: {e}")
        import traceback
        traceback.print_exc()
    finally:
        # Ensure the client disconnects cleanly if the loop exits.
        print("Disconnecting MQTT client...")
        client.loop_stop() # Stop the network loop
        client.disconnect()
        print("MQTT client disconnected.")

if __name__ == "__main__":
    # This block executes when the script is run directly.
    print(f"Starting MQTT to Firestore data collector.")
    print(f"Data will be aggregated and saved approximately every {COLLECTION_INTERVAL_MINUTES} minute(s).")
    print(f"Listening to MQTT topic: {MQTT_SUBSCRIBE_TOPIC}")
    run_collector()
