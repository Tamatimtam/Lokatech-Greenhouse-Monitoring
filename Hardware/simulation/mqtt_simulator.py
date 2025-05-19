import paho.mqtt.client as mqtt
import json
import time
import random
from datetime import datetime, timezone # Added for ISO timestamp

# MQTT Configuration
MQTT_SERVER = "d1b364f4ed864e92b1fb464a3201e5ae.s1.eu.hivemq.cloud"
MQTT_PORT = 8883  # TLS port
MQTT_USER = "LokataniAdmin"
MQTT_PASSWORD = "LokataniAdmin123"
MQTT_PUBLISH_TOPIC = "lokatech/greenhouse/sensors"

# Simulation Configuration
PUBLISH_INTERVAL_SECONDS = 2 # Publish data every 2 seconds

# --- Data Simulation Functions ---
def simulate_temperature():
    return round(random.uniform(18.0, 32.0), 1)

def simulate_humidity():
    return random.randint(40, 90)

def simulate_light():
    return random.randint(50, 15000)

def simulate_espnow_latency():
    # Simulate latency between 15ms and 80ms, or occasionally null
    if random.random() < 0.05: # 5% chance of being null (simulating packet loss/timeout before aggregation)
        return None
    return random.randint(15, 80)

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
    for section_key in ["penyemaian", "remaja", "dewasa"]:
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

client = mqtt.Client(client_id="mqtt_simulator_client_py_v1") # Reverted for paho-mqtt v1.x
client.on_connect = on_connect

# --- Main Simulation Loop ---
def run_simulator():
    try:
        client.username_pw_set(MQTT_USER, MQTT_PASSWORD)
        client.tls_set()
        client.connect(MQTT_SERVER, MQTT_PORT, 60)
        client.loop_start()

        print(f"MQTT Simulator started. Publishing to topic: {MQTT_PUBLISH_TOPIC}")

        while True:
            current_iso_timestamp = get_iso_timestamp()

            sections_data = {
                "penyemaian": {
                    "temp": simulate_temperature(),
                    "humidity": simulate_humidity(),
                    "light": simulate_light(),
                    "espnow_latency_ms": simulate_espnow_latency(),
                    "trends": {"temp": random.choice(["equals", "up", "down"]), "humidity": random.choice(["equals", "up", "down"]), "light": random.choice(["equals", "up", "down"])}
                },
                "remaja": { # Remaja is the master, no ESP-NOW latency from itself
                    "temp": simulate_temperature(),
                    "humidity": simulate_humidity(),
                    "light": simulate_light(),
                    # "espnow_latency_ms": None, # Explicitly not present or null
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

            remaja_fan_state = random.choice([True, False])
            remaja_fan_mode = random.choice(["auto", "manual"])
            remaja_light_state = random.choice([True, False])
            remaja_light_mode = random.choice(["auto", "manual"])

            payload = {
                "hardware_send_timestamp_str": current_iso_timestamp,
                "sections": sections_data,
                "averages": averages_data,
                "actuators": {
                    "fan": {"state": remaja_fan_state, "mode": remaja_fan_mode},
                    "light": {"state": remaja_light_state, "mode": remaja_light_mode}
                }
            }

            json_payload = json.dumps(payload)
            publish_result = client.publish(MQTT_PUBLISH_TOPIC, json_payload)

            if publish_result.rc == mqtt.MQTT_ERR_SUCCESS:
                print(f"Published: {json_payload}")
            else:
                print(f"Failed to publish message: {mqtt.error_string(publish_result.rc)}")

            time.sleep(PUBLISH_INTERVAL_SECONDS)

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
    run_simulator()