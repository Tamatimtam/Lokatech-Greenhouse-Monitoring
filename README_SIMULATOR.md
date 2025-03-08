# Greenhouse Sensor Simulator

This application allows you to simulate multiple sensors for your greenhouse monitoring system.

## How to Install

1. Install the required dependencies:
   ```
   pip install -r requirements.txt
   ```

2. Install Mosquitto MQTT Broker:
   - On Ubuntu: `sudo apt-get install mosquitto mosquitto-clients`
   - On macOS: `brew install mosquitto`
   - On Windows: Download from https://mosquitto.org/download/

3. Start the MQTT broker:
   ```
   mosquitto -v
   ```

## How to Use the Simulator

1. **Adding Sensors**: Click "Add Sensor" and provide an ID and sensor type
2. **Controlling Sensors**: Each sensor has three simulation modes:
   - **Fixed**: Value stays constant
   - **Manual**: Adjust value using the slider
   - **Automatic**: The value gradually moves toward a target with random fluctuations
3. **Disconnecting Sensors**: Uncheck the "Connected" checkbox to simulate a disconnected sensor
4. **Removing Sensors**: Click the "Remove" button on a sensor card or "Remove All Sensors" to clear everything

## Features

The simulator provides:

- Individual control for each sensor
- Three ways to change sensor values:
  - Immediate value setting with slider or exact input
  - Target value with transition time
- Toggle sensor connection to simulate sensor failures
- All data is published to MQTT once per second

## MQTT Topic Structure

The simulator uses the following MQTT topic structure:

```
greenhouse/sensors/<sensor_type>/<sensor_id>
```

Where:
- `greenhouse/sensors` is the base topic
- `<sensor_type>` is the type of sensor (temperature, humidity, light, etc.)
- `<sensor_id>` is the unique identifier for the sensor

### Examples:
- `greenhouse/sensors/temperature/temp1` - Temperature sensor with ID "temp1"
- `greenhouse/sensors/humidity/humid1` - Humidity sensor with ID "humid1"

## Payload Structure

Each sensor publishes JSON data in the following format:

For connected sensors:
```json
{
  "value": 25.5,
  "unit": "°C",
  "status": "connected",
  "timestamp": 1683045678
}
```

For disconnected sensors:
```json
{
  "status": "disconnected",
  "timestamp": 1683045678
}
```

## Understanding MQTT

MQTT (Message Queuing Telemetry Transport) is a lightweight messaging protocol for IoT devices. Think of it like a post office:

1. **Topics**: Like mailboxes with addresses (e.g., "greenhouse/sensors/temperature/temp1")
2. **Publishers**: Send messages to topics (our simulator)
3. **Subscribers**: Receive messages from topics (our dashboard)
4. **Broker**: The central post office that routes messages (Mosquitto)

Our topic structure uses a hierarchy separated by slashes (/):
- `greenhouse/sensors` - The base topic
- `<sensor_type>` - Specific sensor type
- `<sensor_id>` - Specific sensor ID

This structure makes it easy to subscribe to exactly what you need.

## Extending the Simulator

To add a new sensor type:

1. Add it to the `SensorType` class:
```python
class SensorType:
    # Add your new sensor type
    MY_NEW_SENSOR = "my_new_sensor"
    
    # Add its properties to the PROPERTIES dictionary
    PROPERTIES = {
        # existing entries...
        MY_NEW_SENSOR: {"unit": "units", "min": 0, "max": 100, "default": 50, "color": "#HEX_COLOR"},
    }
    
    @classmethod
    def get_all_types(cls) -> List[str]:
        # Update to include your new sensor type
        return [cls.TEMPERATURE, cls.HUMIDITY, ..., cls.MY_NEW_SENSOR]
```

## Requirements

- Python 3.6+
- Paho MQTT client: `pip install paho-mqtt`
- MQTT broker (like Mosquitto) running
