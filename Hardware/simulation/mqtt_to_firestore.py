import paho.mqtt.client as mqtt
import json
import time
import firebase_admin
from firebase_admin import credentials
from firebase_admin import firestore
import datetime
import threading
import statistics
import os

# Get the absolute path to the credentials file
script_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(os.path.dirname(script_dir))  # Go up to simpleLogin folder
cred_path = os.path.join(project_root, 'secrets', 'firebase-credentials.json')

# Initialize Firebase Admin
cred = credentials.Certificate(cred_path)
firebase_admin.initialize_app(cred)
db = firestore.client()

# MQTT Configuration
MQTT_SERVER = "broker.emqx.io"
MQTT_PORT = 1883
MQTT_SUBSCRIBE_TOPIC = "lokatech/greenhouse/sensors"

# Data Collection Configuration
COLLECTION_INTERVAL_MINUTES = 1  # Collect data for 5 minutes before saving
collection_data = {
    "dewasa": {
        "temps": [],
        "humidities": [],
        "lights": []
    },
    "peremajaan": {
        "temps": [],
        "humidities": [],
        "lights": []
    },
    "penyemaian": {
        "temps": [],
        "humidities": [],
        "lights": []
    },
    "averages": {
        "temps": [],
        "humidities": [],
        "lights": []
    }
}

last_save_time = time.time()


def on_connect(client, userdata, flags, rc):
    if rc == 0:
        print("Connected to MQTT Broker!")
        client.subscribe(MQTT_SUBSCRIBE_TOPIC)
        print(f"Subscribed to {MQTT_SUBSCRIBE_TOPIC}")
    else:
        print(f"Failed to connect, return code {rc}")


def on_message(client, userdata, msg):
    try:
        payload = json.loads(msg.payload.decode())
        process_mqtt_data(payload)
    except json.JSONDecodeError:
        print("Error: Received invalid JSON data")
        print(f"Raw payload: {msg.payload[:100]}...") # Print first 100 chars to help debug
    except Exception as e:
        print(f"Error in on_message: {e}")
        import traceback
        traceback.print_exc() # Print the full stack trace for debugging


def process_mqtt_data(payload):
    global collection_data, last_save_time
    
    try:
        # Extract data from sections
        for section in ["dewasa", "peremajaan", "penyemaian"]:
            if section in payload.get("sections", {}):
                section_data = payload["sections"][section]
                
                if "temp" in section_data and section_data["temp"] is not None:
                    collection_data[section]["temps"].append(section_data["temp"])
                
                if "humidity" in section_data and section_data["humidity"] is not None:
                    collection_data[section]["humidities"].append(section_data["humidity"])
                
                if "light" in section_data and section_data["light"] is not None:
                    collection_data[section]["lights"].append(section_data["light"])
        
        # Extract average data
        if "averages" in payload:
            avg_data = payload["averages"]
            
            if "temp" in avg_data and avg_data["temp"] is not None:
                collection_data["averages"]["temps"].append(avg_data["temp"])
            
            if "humidity" in avg_data and avg_data["humidity"] is not None:
                collection_data["averages"]["humidities"].append(avg_data["humidity"])
            
            if "light" in avg_data and avg_data["light"] is not None:
                collection_data["averages"]["lights"].append(avg_data["light"])
        
        # Check if it's time to save data
        current_time = time.time()
        elapsed_minutes = (current_time - last_save_time) / 60
        
        if elapsed_minutes >= COLLECTION_INTERVAL_MINUTES:
            save_data_to_firestore()
            reset_collection_data()
            last_save_time = current_time
    
    except Exception as e:
        print(f"Error processing message: {e}")
        # Continue execution even if we encounter an error


def calculate_stats(values):
    if not values:
        return None
    
    # Filter out None values
    filtered_values = [v for v in values if v is not None]
    
    if not filtered_values:
        return {
            "avg": None,
            "min": None,
            "max": None,
            "median": None,
            "count": 0
        }
    
    return {
        "avg": round(sum(filtered_values) / len(filtered_values), 2),
        "min": min(filtered_values),
        "max": max(filtered_values),
        "median": statistics.median(filtered_values),
        "count": len(filtered_values)
    }


def save_data_to_firestore():
    try:
        print("Saving aggregated data to Firestore...")
        
        # Create timestamp
        timestamp = datetime.datetime.now()
        timestamp_str = timestamp.strftime("%Y-%m-%d %H:%M:%S")
        
        # Create stats for each section
        stats = {}
        for section in ["dewasa", "peremajaan", "penyemaian", "averages"]:
            section_stats = {}
            
            for data_type, values in collection_data[section].items():
                if values:  # Only calculate if we have data
                    try:
                        section_stats[data_type] = calculate_stats(values)
                    except Exception as e:
                        print(f"Error calculating stats for {section}.{data_type}: {e}")
                        # If an error occurs, we'll skip this data point but continue with others
            
            stats[section] = section_stats
        
        # Create document in Firestore
        doc_ref = db.collection('greenhouse_data').document(timestamp_str)
        doc_ref.set({
            'timestamp': timestamp,
            'stats': stats,
            'metadata': {
                'collection_minutes': COLLECTION_INTERVAL_MINUTES,
                'samples_count': len(collection_data["averages"]["temps"]) if collection_data["averages"]["temps"] else 0
            }
        })
        
        print(f"Data saved to Firestore at {timestamp_str}")
    except Exception as e:
        print(f"Error saving data to Firestore: {e}")
        # Even if we fail to save, we'll reset the data to avoid accumulating too much


def reset_collection_data():
    global collection_data
    
    # Reset all data arrays
    for section in collection_data:
        for data_type in collection_data[section]:
            collection_data[section][data_type] = []


def run_collector():
    client = mqtt.Client()
    client.on_connect = on_connect
    client.on_message = on_message
    
    try:
        client.connect(MQTT_SERVER, MQTT_PORT)
        client.loop_forever()  # Start the MQTT client loop
    except KeyboardInterrupt:
        print("Collector stopped by user.")
    except Exception as e:
        print(f"An error occurred: {e}")
    finally:
        client.loop_stop()
        client.disconnect()
        print("MQTT client disconnected.")


if __name__ == "__main__":
    print(f"Starting MQTT to Firestore collector. Saving data every {COLLECTION_INTERVAL_MINUTES} minutes.")
    run_collector()
