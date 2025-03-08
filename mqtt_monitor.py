import paho.mqtt.client as mqtt
import json
import time
from datetime import datetime

# Callback when connecting to the MQTT broker
def on_connect(client, userdata, flags, rc):
    if rc == 0:
        print("Connected to MQTT broker")
        # Subscribe to all sensor data for all greenhouses
        client.subscribe("lokatani/greenhouse/+/sensors/#")
    else:
        print(f"Connection failed with code {rc}")

# Callback when a message is received
def on_message(client, userdata, msg):
    try:
        # Parse the topic to get greenhouse ID, sensor type and sensor ID
        topic_parts = msg.topic.split('/')
        greenhouse_id = topic_parts[2]
        sensor_type = topic_parts[4]
        sensor_id = topic_parts[5]
        
        # Parse the JSON payload
        payload = json.loads(msg.payload)
        value = payload['value']
        timestamp = payload['timestamp']
        unit = payload['unit']
        
        # Format timestamp for display
        dt = datetime.fromtimestamp(timestamp)
        time_str = dt.strftime("%H:%M:%S")
        
        # Display the received data
        print(f"[{time_str}] Greenhouse: {greenhouse_id} | {sensor_type} sensor {sensor_id}: {value}{unit}")
        
    except Exception as e:
        print(f"Error processing message: {str(e)}")

# Create MQTT client
client = mqtt.Client()
client.on_connect = on_connect
client.on_message = on_message

# Connect to broker
try:
    client.connect("localhost", 1883, 60)
    # Start the loop
    client.loop_forever()
except KeyboardInterrupt:
    print("Monitor stopped")
except Exception as e:
    print(f"Failed to connect to MQTT broker: {e}")
