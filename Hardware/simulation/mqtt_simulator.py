import paho.mqtt.client as mqtt
import json
import time
import random

# MQTT Configuration (from Hardware/new.md)
MQTT_SERVER = "broker.emqx.io"
MQTT_PORT = 1883
MQTT_PUBLISH_TOPIC = "lokatech/greenhouse/sensors"

# Simulation Configuration
PUBLISH_INTERVAL_SECONDS = 2 # Publish data every 15 seconds

# --- Data Simulation Functions ---
# Simple random simulation within realistic ranges based on fuzzy logic definitions
def simulate_temperature():
    return round(random.uniform(15.0, 35.0), 1) # Range 15-35 C

def simulate_humidity():
    return random.randint(30, 90) # Range 30-90 %

def simulate_light():
    return random.randint(100, 1000) # Range 100-1000 lux

# --- Data Processing Functions ---
def calculate_averages(sections_data):
    total_temp = 0
    temp_count = 0
    total_humidity = 0
    humidity_count = 0
    total_light = 0
    light_count = 0

    for section, data in sections_data.items():
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
def on_connect(client, userdata, flags, rc):
    if rc == 0:
        print("Connected to MQTT Broker!")
    else:
        print("Failed to connect, return code %d\n", rc)

client = mqtt.Client()
client.on_connect = on_connect

# --- Main Simulation Loop ---
def run_simulator():
    try:
        client.connect(MQTT_SERVER, MQTT_PORT)
        client.loop_start() # Start the MQTT client loop in a non-blocking way

        print(f"MQTT Simulator started. Publishing to topic: {MQTT_PUBLISH_TOPIC}")

        while True:
            # Simulate data for each section
            sections_data = {
                "dewasa": {
                    "temp": simulate_temperature(),
                    "humidity": simulate_humidity(),
                    "light": simulate_light(),
                    "trends": {"temp": "equals", "humidity": "equals", "light": "equals"} # Placeholders
                },
                "peremajaan": {
                    "temp": simulate_temperature(),
                    "humidity": simulate_humidity(),
                    "light": simulate_light(),
                    "trends": {"temp": "equals", "humidity": "equals", "light": "equals"} # Placeholders
                },
                "penyemaian": {
                    "temp": simulate_temperature(),
                    "humidity": simulate_humidity(),
                    "light": simulate_light(),
                    "trends": {"temp": "equals", "humidity": "equals", "light": "equals"} # Placeholders
                }
            }

            # Calculate averages
            averages_data = calculate_averages(sections_data)

            # Construct the full payload
            payload = {
                "timestamp": int(time.time()),
                "sections": sections_data,
                "averages": averages_data,
                "actuators": { # Simple fixed actuator state for simulation
                    "fan": {"state": False, "mode": "auto"},
                    "light": {"state": False, "mode": "auto"}
                }
            }

            # Publish the payload
            json_payload = json.dumps(payload)
            client.publish(MQTT_PUBLISH_TOPIC, json_payload)
            print(f"Published: {json_payload}")

            # Wait before publishing again
            time.sleep(PUBLISH_INTERVAL_SECONDS)

    except KeyboardInterrupt:
        print("Simulator stopped by user.")
    except Exception as e:
        print(f"An error occurred: {e}")
    finally:
        client.loop_stop()
        client.disconnect()
        print("MQTT client disconnected.")

if __name__ == "__main__":
    run_simulator()
