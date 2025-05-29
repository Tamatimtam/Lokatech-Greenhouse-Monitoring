# Section Naming Convention Update:
# - 'penyemaian' is now referred to as 'peremajaan'.
# - 'remaja' is now referred to as 'meja_apung'.
# This script reflects these updated names for simulation purposes.

import paho.mqtt.client as mqtt
import json
import time
import random
from datetime import datetime, timezone # Added for ISO timestamp
import argparse # For command-line arguments

# MQTT Configuration
MQTT_SERVER = "d1b364f4ed864e92b1fb464a3201e5ae.s1.eu.hivemq.cloud"
MQTT_PORT = 8883  # TLS port
MQTT_USER = "LokataniAdmin"
MQTT_PASSWORD = "LokataniAdmin123"
MQTT_PUBLISH_TOPIC = "lokatech/greenhouse/sensors_test"

# Simulation Configuration - Default, can be overridden by args
DEFAULT_PUBLISH_INTERVAL_SECONDS = 2 # Publish data every 2 seconds

# Global packet ID counter for this simulator instance
PACKET_ID_COUNTER = 0

# --- Data Simulation Functions ---
def simulate_temperature():
    return round(random.uniform(18.0, 32.0), 1)

def simulate_humidity():
    return random.randint(40, 90)

def simulate_light():
    return random.randint(50, 15000)

def simulate_espnow_latency():
    # Simulate latency to match hardware implementation: 18 + random(5) = 18-22ms range
    # Based on RemajaNode_Master.cpp: simulatedPenyemaianEspNowLatencyMs = 18 + random(5)
    # This provides more realistic ESP-NOW latency simulation
    
    return 18 + random.randint(0, 4) # Match hardware: 18 + random(5) gives range 18-22ms

def get_iso_timestamp():
    # Generate ISO 8601 timestamp with milliseconds and 'Z' for UTC
    return datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')

# --- Data Processing Functions ---
def calculate_averages(sections_data):
    total_temp = 0
    temp_count = 0
    total_humidity = 0
    humidity_count = 0
    total_light = 0
    light_count = 0

    # Iterate through all defined sections for averaging
    for section_key in ["peremajaan", "meja_apung", "dewasa"]: # Using new logical names
        data = sections_data.get(section_key, {})
        if data.get("temp") is not None:
            total_temp += data["temp"]
            temp_count += 1
        if data.get("humidity") is not None:
            total_humidity += data["humidity"]
            humidity_count += 1
        if data.get("light") is not None:
            total_light += data["light"]
            light_count += 1

    avg_temp = round(total_temp / temp_count, 1) if temp_count > 0 else None
    avg_humidity = round(total_humidity / humidity_count) if humidity_count > 0 else None
    avg_light = round(total_light / light_count) if light_count > 0 else None

    return {
        "temp": avg_temp,
        "humidity": avg_humidity,
        "light": avg_light
    }

# --- MQTT Client Setup ---
def on_connect(client, userdata, flags, rc): # Reverted for paho-mqtt v1.x compatibility
    if rc == 0:
        print("Connected to MQTT Broker!")
    else:
        print(f"Failed to connect, return code {rc}")

client = mqtt.Client(client_id=f"mqtt_simulator_py_{random.randint(1000,9999)}") 
client.on_connect = on_connect

# --- Main Simulation Loop ---
def run_simulator(publish_interval_seconds):
    global PACKET_ID_COUNTER
    try:
        client.username_pw_set(MQTT_USER, MQTT_PASSWORD)
        client.tls_set()
        client.connect(MQTT_SERVER, MQTT_PORT, 60)
        client.loop_start()

        print(f"MQTT Simulator started. Publishing to topic: {MQTT_PUBLISH_TOPIC} every {publish_interval_seconds}s")

        while True:
            PACKET_ID_COUNTER += 1
            current_iso_timestamp = get_iso_timestamp()

            sections_data = {
                "penyemaian": { # This will be mapped to 'peremajaan' by mqtt_to_firestore if used, but for direct backend testing, use backend's expected keys.
                               # The backend (SensorDataManager) expects "penyemaian", "remaja", "dewasa" from MQTT payload.
                    "temp": simulate_temperature(),
                    "humidity": simulate_humidity(),
                    "light": simulate_light(),
                    "espnow_latency_ms": simulate_espnow_latency(),
                    "trends": {"temp": random.choice(["equals", "up", "down"]), "humidity": random.choice(["equals", "up", "down"]), "light": random.choice(["equals", "up", "down"])}
                },
                "remaja": { # This is the master node's local sensors in the payload schema
                    "temp": simulate_temperature(),
                    "humidity": simulate_humidity(),
                    "light": simulate_light(),
                    # "espnow_latency_ms": None, # Remaja is master, no ESP-NOW latency *to itself* to report this way
                    "trends": {"temp": random.choice(["equals", "up", "down"]), "humidity": random.choice(["equals", "up", "down"]), "light": random.choice(["equals", "up", "down"])}
                },
                "dewasa": {
                    "temp": simulate_temperature(),
                    "humidity": simulate_humidity(),
                    "light": simulate_light(),
                    "espnow_latency_ms": simulate_espnow_latency(),
                    "trends": {"temp": random.choice(["equals", "up", "down"]), "humidity": random.choice(["equals", "up", "down"]), "light": random.choice(["equals", "up", "down"])}
                }
            }

            averages_data = calculate_averages(sections_data)

            remaja_fan_state = random.choice([ False])
            remaja_fan_mode = random.choice([ "manual"])
            remaja_light_state = random.choice([ False])
            remaja_light_mode = random.choice([ "manual"])

            payload = {
                "hardware_send_timestamp_str": current_iso_timestamp, # Actual current time
                "sections": sections_data,
                "averages": averages_data,
                "actuators": { 
                    "fan": {"state": remaja_fan_state, "mode": remaja_fan_mode},
                    "light": {"state": remaja_light_state, "mode": remaja_light_mode}
                },
                "log_data": { # Adding log_data from simulator
                    "packet_id": PACKET_ID_COUNTER 
                    # Simulator doesn't provide other log_data fields like CPU/Mem of ESP32
                }
            }

            json_payload = json.dumps(payload)
            publish_result = client.publish(MQTT_PUBLISH_TOPIC, json_payload)

            if publish_result.rc == mqtt.MQTT_ERR_SUCCESS:
                print(f"Sim PktID: {PACKET_ID_COUNTER} | Published: {json_payload}")
            else:
                print(f"Sim PktID: {PACKET_ID_COUNTER} | Failed to publish message: {mqtt.error_string(publish_result.rc)}")

            time.sleep(publish_interval_seconds)

    except KeyboardInterrupt:
        print("Simulator stopped by user.")
    except ConnectionRefusedError:
        print(f"Connection refused. Is the MQTT broker at {MQTT_SERVER}:{MQTT_PORT} running and accessible?")
    except Exception as e:
        print(f"An error occurred: {e}")
    finally:
        print("Stopping MQTT client loop and disconnecting...")
        client.loop_stop()
        client.disconnect()
        print("MQTT client disconnected.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="MQTT Sensor Data Simulator for LokaTech Greenhouse.")
    parser.add_argument(
        "--interval", 
        type=float, 
        default=DEFAULT_PUBLISH_INTERVAL_SECONDS,
        help=f"Interval in seconds for publishing data (default: {DEFAULT_PUBLISH_INTERVAL_SECONDS})"
    )
    args = parser.parse_args()
    
    run_simulator(args.interval)