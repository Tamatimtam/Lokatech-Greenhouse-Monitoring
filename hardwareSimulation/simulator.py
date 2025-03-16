import paho.mqtt.client as mqtt
import json
import random
import time
import logging
from datetime import datetime
from typing import Dict, Optional

# Configure logging
logging.basicConfig(
    level=logging.DEBUG,  # Changed from INFO to DEBUG
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('simulator.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger('GreenhouseSimulator')

class SensorSimulator:
    """Simulates individual sensor behavior and failures"""
    def __init__(self, initial_value: float, min_value: float, max_value: float):
        self.value = initial_value
        self.min_value = min_value
        self.max_value = max_value
        self.working = True
        self.last_value = initial_value

    def read(self) -> Optional[float]:
        """Simulate reading from sensor"""
        if not self.working:
            return None
            
        # Add small random variations
        variation = random.uniform(-0.5, 0.5)
        new_value = self.value + variation
        
        # Keep within bounds
        self.value = max(self.min_value, min(self.max_value, new_value))
        self.last_value = self.value
        
        return round(self.value, 1)

    def get_trend(self) -> str:
        """Determine trend based on previous value"""
        if not self.working:
            return "circle-exclamation"
        
        diff = self.value - self.last_value
        if abs(diff) < 0.5:
            return "equals"
        return "arrow-up" if diff > 0 else "arrow-down"

class NodeSimulator:
    """Simulates an ESP32 node with multiple sensors"""
    def __init__(self, name: str):
        self.name = name
        self.online = True
        self.sensors = {
            'temp': SensorSimulator(25.0, 20.0, 35.0),
            'humidity': SensorSimulator(65.0, 40.0, 90.0),
            'light': SensorSimulator(50.0, 0.0, 100.0)
        }
        logger.info(f"Initialized node {name}")

    def read_sensors(self) -> Dict:
        """Read all sensors if node is online"""
        if not self.online:
            logger.warning(f"Node {self.name} is offline - no sensor readings available")
            return {}

        readings = {}
        trends = {}
        
        for sensor_type, sensor in self.sensors.items():
            value = sensor.read()
            if value is not None:
                readings[sensor_type] = value
                trends[sensor_type] = sensor.get_trend()
            else:
                logger.warning(f"{sensor_type.capitalize()} sensor on node {self.name} is not working")

        return {
            **readings,
            "trends": trends
        } if readings else {}

    def set_sensor_status(self, sensor_type: str, working: bool):
        """Simulate sensor failure or recovery"""
        if sensor_type in self.sensors:
            self.sensors[sensor_type].working = working
            logger.info(f"{sensor_type.capitalize()} sensor on node {self.name} {'recovered' if working else 'failed'}")

    def set_online_status(self, online: bool):
        """Simulate node going offline or coming online"""
        self.online = online
        logger.info(f"Node {self.name} went {'online' if online else 'offline'}")

class GreenhouseSimulator:
    """Main simulator class managing all nodes and MQTT communication"""
    def __init__(self):
        # Initialize nodes
        self.nodes = {
            "penyemaian": NodeSimulator("penyemaian"),
            "peremajaan": NodeSimulator("peremajaan"),
            "dewasa": NodeSimulator("dewasa")  # Master node
        }
        
        # MQTT Setup
        self.client = mqtt.Client("GreenhouseSimulator")
        self.client.on_connect = self.on_connect
        self.client.on_disconnect = self.on_disconnect
        self.connected = False
        
        try:
            self.client.connect("broker.emqx.io", 1883)
            self.client.loop_start()
            logger.info("Connected to MQTT broker")
        except Exception as e:
            logger.error(f"Failed to connect to MQTT broker: {e}")

    def on_connect(self, client, userdata, flags, rc):
        """Callback for when MQTT connection is established"""
        self.connected = True
        logger.info(f"Connected to MQTT broker with result code {rc}")

    def on_disconnect(self, client, userdata, rc):
        """Callback for when MQTT connection is lost"""
        self.connected = False
        logger.warning(f"Disconnected from MQTT broker with result code {rc}")

    def calculate_averages(self) -> Dict:
        """Calculate average values from all online nodes"""
        readings = {
            'temp': [],
            'humidity': [],
            'light': []
        }
        
        for node in self.nodes.values():
            if node.online:
                sensor_data = node.read_sensors()
                for sensor_type in readings:
                    if sensor_type in sensor_data:
                        readings[sensor_type].append(sensor_data[sensor_type])
        
        averages = {}
        for sensor_type, values in readings.items():
            if values:  # Only calculate average if we have values
                averages[sensor_type] = round(sum(values) / len(values), 1)
        
        return averages

    def publish_data(self):
        """Gather and publish data from all nodes"""
        if not self.connected:
            logger.error("Cannot publish - not connected to MQTT broker")
            return

        # Gather data from each node
        sections_data = {}
        for section, node in self.nodes.items():
            sensor_data = node.read_sensors()
            if sensor_data:  # Only include nodes that return data
                sections_data[section] = sensor_data

        # Calculate averages
        averages = self.calculate_averages()

        # Prepare payload
        payload = {
            "timestamp": datetime.now().isoformat(),
            "averages": averages,
            "sections": sections_data
        }

        try:
            self.client.publish("lokatech/greenhouse/sensors", json.dumps(payload))
            logger.debug(f"Published data: {json.dumps(payload, indent=2)}")
        except Exception as e:
            logger.error(f"Failed to publish data: {e}")

    def simulate_failure(self, node: str, component: Optional[str] = None):
        """Simulate failure of a node or specific sensor"""
        if node not in self.nodes:
            logger.error(f"Invalid node name: {node}")
            return

        if component is None:
            # Simulate entire node failure
            self.nodes[node].set_online_status(False)
        elif component in self.nodes[node].sensors:
            # Simulate specific sensor failure
            self.nodes[node].set_sensor_status(component, False)
        else:
            logger.error(f"Invalid component: {component}")

    def simulate_recovery(self, node: str, component: Optional[str] = None):
        """Simulate recovery of a node or specific sensor"""
        if node not in self.nodes:
            logger.error(f"Invalid node name: {node}")
            return

        if component is None:
            # Simulate entire node recovery
            self.nodes[node].set_online_status(True)
        elif component in self.nodes[node].sensors:
            # Simulate specific sensor recovery
            self.nodes[node].set_sensor_status(component, True)
        else:
            logger.error(f"Invalid component: {component}")

    def run(self):
        """Main simulation loop"""
        logger.info("Starting greenhouse simulation")
        try:
            while True:
                self.publish_data()
                time.sleep(5)  # Update every 5 seconds
        except KeyboardInterrupt:
            logger.info("Simulation stopped by user")
            self.client.loop_stop()
            self.client.disconnect()
        except Exception as e:
            logger.error(f"Simulation error: {e}")
            self.client.loop_stop()
            self.client.disconnect()

if __name__ == "__main__":
    simulator = GreenhouseSimulator()
    simulator.run()
