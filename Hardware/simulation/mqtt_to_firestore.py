import paho.mqtt.client as mqtt 
import json                     
import time                     
import firebase_admin           
from firebase_admin import credentials 
from firebase_admin import firestore   
import datetime                 
import statistics               
import os                       

script_dir = os.path.dirname(os.path.abspath(__file__)) 
project_root = os.path.dirname(os.path.dirname(script_dir))  
cred_path = os.path.join(project_root, 'secrets', 'firebase-credentials.json') 

cred = credentials.Certificate(cred_path)
if not firebase_admin._apps: 
    firebase_admin.initialize_app(cred)
db = firestore.client() 

MQTT_SERVER = "d1b364f4ed864e92b1fb464a3201e5ae.s1.eu.hivemq.cloud" 
MQTT_PORT = 8883  
MQTT_USER = "LokataniAdmin" 
MQTT_PASSWORD = "LokataniAdmin123" 
MQTT_SUBSCRIBE_TOPIC = "lokatech/greenhouse/sensors" 

COLLECTION_INTERVAL_MINUTES = 1  

collection_data = {
    "penyemaian": { "temps": [], "humidities": [], "lights": [] },
    "remaja": { "temps": [], "humidities": [], "lights": [] }, # UPDATED
    "dewasa": { "temps": [], "humidities": [], "lights": [] },
    "averages": { "temps": [], "humidities": [], "lights": [] } 
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
        print(f"Error: Received invalid JSON data on topic {msg.topic}")
    except Exception as e:
        print(f"Error in on_message: {e}")

def process_mqtt_data(payload):
    global collection_data, last_save_time 

    try:
        # Iterate through NEW expected greenhouse sections
        for section_name in ["penyemaian", "remaja", "dewasa"]: # UPDATED
            if section_name in payload.get("sections", {}): 
                section_payload = payload["sections"][section_name]
                if "temp" in section_payload and section_payload["temp"] is not None:
                    collection_data[section_name]["temps"].append(float(section_payload["temp"]))
                if "humidity" in section_payload and section_payload["humidity"] is not None:
                    collection_data[section_name]["humidities"].append(float(section_payload["humidity"]))
                if "light" in section_payload and section_payload["light"] is not None:
                    collection_data[section_name]["lights"].append(float(section_payload["light"]))

        if "averages" in payload:
            avg_payload = payload["averages"]
            if "temp" in avg_payload and avg_payload["temp"] is not None:
                collection_data["averages"]["temps"].append(float(avg_payload["temp"]))
            if "humidity" in avg_payload and avg_payload["humidity"] is not None:
                collection_data["averages"]["humidities"].append(float(avg_payload["humidity"]))
            if "light" in avg_payload and avg_payload["light"] is not None:
                collection_data["averages"]["lights"].append(float(avg_payload["light"]))

        current_time = time.time()
        if (current_time - last_save_time) / 60 >= COLLECTION_INTERVAL_MINUTES:
            print(f"{(current_time - last_save_time) / 60:.2f} minutes elapsed. Time to save data.")
            save_data_to_firestore()    
            reset_collection_data()     
            last_save_time = current_time 
    except Exception as e:
        print(f"Error processing MQTT data payload: {e}")

def calculate_stats(values):
    if not values: return None
    filtered_values = [v for v in values if isinstance(v, (int, float))]
    if not filtered_values:
        return {"avg": None, "min": None, "max": None, "median": None, "count": 0}
    return {
        "avg": round(statistics.mean(filtered_values), 2),
        "min": round(min(filtered_values), 2),
        "max": round(max(filtered_values), 2),
        "median": round(statistics.median(filtered_values), 2),
        "count": len(filtered_values)
    }

def save_data_to_firestore():
    try:
        print("Attempting to save aggregated data to Firestore...")
        current_timestamp = datetime.datetime.now(datetime.timezone.utc) 
        document_id_str = current_timestamp.strftime("%Y-%m-%d %H:%M:%S.%f")[:-3] + "Z"

        firestore_doc_data = {
            "timestamp": current_timestamp, 
            "stats": {},
            "metadata": {
                "collection_minutes": COLLECTION_INTERVAL_MINUTES,
                "samples_count_avg_temp": len(collection_data["averages"]["temps"])
            }
        }
        for section_name, data_types in collection_data.items():
            firestore_doc_data["stats"][section_name] = {}
            for data_type_name, values_list in data_types.items():
                stats_results = calculate_stats(values_list) if values_list else None
                firestore_doc_data["stats"][section_name][data_type_name] = stats_results
        
        db.collection('greenhouse_data').document(document_id_str).set(firestore_doc_data)
        print(f"Data successfully saved to 'greenhouse_data' with ID: {document_id_str}")
        db.collection('lokatech_db').document(document_id_str).set(firestore_doc_data) # Also save to new collection
        print(f"Data successfully saved to 'lokatech_db' with ID: {document_id_str}")


    except Exception as e:
        print(f"Error saving data to Firestore: {e}")

def reset_collection_data():
    global collection_data
    for section_key in collection_data:
        for data_type_key in collection_data[section_key]:
            collection_data[section_key][data_type_key] = []

def run_collector():
    client = mqtt.Client(client_id="firestore_collector_client_v2") 
    client.on_connect = on_connect    
    client.on_message = on_message    
    try:
        client.username_pw_set(MQTT_USER, MQTT_PASSWORD)
        client.tls_set()
        print(f"Attempting to connect to MQTT broker: {MQTT_SERVER}:{MQTT_PORT}...")
        client.connect(MQTT_SERVER, MQTT_PORT, keepalive=60) 
        client.loop_forever()
    except KeyboardInterrupt: 
        print("Collector stopped by user.")
    except ConnectionRefusedError:
        print(f"Connection refused. Check MQTT broker address, port, and firewall.")
    except Exception as e:
        print(f"An unexpected error occurred: {e}")
    finally:
        print("Disconnecting MQTT client...")
        client.loop_stop() 
        client.disconnect()
        print("MQTT client disconnected.")

if __name__ == "__main__":
    print(f"Starting MQTT to Firestore data collector (for Penyemaian, Remaja, Dewasa).")
    print(f"Data will be aggregated approx. every {COLLECTION_INTERVAL_MINUTES} minute(s).")
    run_collector()
