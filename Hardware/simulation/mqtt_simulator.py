import paho.mqtt.client as mqtt
import json
import time
import random

# MQTT Configuration
MQTT_SERVER = "d1b364f4ed864e92b1fb464a3201e5ae.s1.eu.hivemq.cloud"
MQTT_PORT = 8883  # TLS port
MQTT_USER = "LokataniAdmin"
MQTT_PASSWORD = "LokataniAdmin123"
MQTT_PUBLISH_TOPIC = "lokatech/greenhouse/sensors"

# Simulation Configuration
PUBLISH_INTERVAL_SECONDS = 2 # Publish data every 2 seconds

# --- Data Simulation Functions ---
# Simple random simulation within realistic ranges
def simulate_temperature():
    return round(random.uniform(18.0, 32.0), 1) # Range 18-32 C

def simulate_humidity():
    return random.randint(40, 90) # Range 40-90 %

def simulate_light():
    # Simulate a wider range for light, as different sections might have different needs
    # and the master node (Remaja) also has its own light sensor.
    return random.randint(50, 15000) # Range 50-15000 lux

# --- Data Processing Functions ---
def calculate_averages(sections_data):
    total_temp = 0
    temp_count = 0
    total_humidity = 0
    humidity_count = 0
    total_light = 0
    light_count = 0

    for section_key in ["penyemaian", "remaja", "dewasa"]: # Iterate in defined order
        data = sections_data.get(section_key, {}) # Get section data, or empty dict if not present
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
        print(f"Failed to connect, return code {rc}")

client = mqtt.Client(client_id="mqtt_simulator_client_py") # Added a client ID
client.on_connect = on_connect

# --- Main Simulation Loop ---
def run_simulator():
    try:
        client.username_pw_set(MQTT_USER, MQTT_PASSWORD)
        client.tls_set() 
        client.connect(MQTT_SERVER, MQTT_PORT, 60) # Added keepalive
        client.loop_start()

        print(f"MQTT Simulator started. Publishing to topic: {MQTT_PUBLISH_TOPIC}")

        while True:
            # Simulate data for each section according to the new structure
            sections_data = {
                "penyemaian": { # Data that would come from Penyemaian node via Gateway
                    "temp": simulate_temperature(),
                    "humidity": simulate_humidity(),
                    "light": simulate_light(),
                    "trends": {"temp": "equals", "humidity": "up", "light": "down"} # Example trends
                },
                "remaja": { # Data from Remaja Master's local sensors
                    "temp": simulate_temperature(),
                    "humidity": simulate_humidity(),
                    "light": simulate_light(),
                    "trends": {"temp": "up", "humidity": "equals", "light": "equals"}
                },
                "dewasa": { # Data that would come from the new Dewasa node (old Peremajaan) via Gateway
                    "temp": simulate_temperature(),
                    "humidity": simulate_humidity(),
                    "light": simulate_light(),
                    "trends": {"temp": "down", "humidity": "down", "light": "up"}
                }
            }

            averages_data = calculate_averages(sections_data)

            # Simulate Remaja Master's actuator states
            # These would be determined by its fuzzy logic or manual override
            remaja_fan_state = random.choice([True, False])
            remaja_fan_mode = random.choice(["auto", "manual"])
            remaja_light_state = random.choice([True, False])
            remaja_light_mode = random.choice(["auto", "manual"])

            payload = {
                "timestamp": int(time.time()), # Unix timestamp in seconds
                "sections": sections_data,
                "averages": averages_data,
                "actuators": { # Actuators controlled by Remaja Master
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