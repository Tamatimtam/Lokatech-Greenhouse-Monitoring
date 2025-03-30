# Greenhouse Monitoring System - Hardware Setup Guide

## Project Structure and Implementation

This project is organized using PlatformIO's modular structure. Here's how the code is organized:

### Main Components

1. **DeWasaNode_Master.cpp** (src/DeWasaNode_Master.cpp)
   - Main file for the Dewasa/Master node
   - Coordinates sensor reading, ESP-NOW communication, and MQTT publishing
   - Integrates all the manager classes to provide a complete solution

2. **SensorManager Class** (lib/SensorManager/)
   - Handles DHT22 (temperature/humidity) and BH1750 (light) sensor operations
   - Provides simulation capability when sensors are unavailable
   - Reports raw sensor readings with validity flags

3. **ESPNowManager Class** (lib/ESPNowManager/) 
   - Manages ESP-NOW communication between nodes
   - Handles peer registration, data sending and receiving
   - Stores received data from satellite nodes

4. **MQTTManager Class** (lib/MQTTManager/)
   - Handles WiFi and MQTT connectivity
   - Creates and publishes JSON payloads in the required format
   - Manages connection loss and reconnection to both WiFi and MQTT
   - Includes enhanced error reporting and reconnection logic

### Building and Uploading

This project uses PlatformIO's multi-environment capability to manage different nodes:

- To build and upload the Dewasa/Master node: `pio run -e dewasa_master -t upload`
- Monitor serial output: `pio device monitor -b 115200`

### Configuration

Before uploading:

1. Update WiFi credentials in DeWasaNode_Master.cpp:
   ```cpp
   const char* ssid = "YourWiFiSSID";      // Replace with your WiFi SSID
   const char* password = "YourWiFiPass";   // Replace with your WiFi password
   ```

2. Update MQTT broker settings if needed:
   ```cpp
   const char* mqtt_server = "broker.emqx.io"; // Replace if using a different broker
   const int mqtt_port = 1883;                 // Standard MQTT port
   const char* mqtt_topic = "lokatech/greenhouse/sensors"; // Topic to publish data
   ```

3. Update the MAC addresses of the peer nodes:
   ```cpp
   uint8_t penyemaianMac[] = {0x30, 0xAE, 0xA4, 0x96, 0xA3, 0x48}; // Replace with actual MAC
   uint8_t peremajaanMac[] = {0x30, 0xAE, 0xA4, 0x96, 0xA3, 0x4C}; // Replace with actual MAC
   ```

4. Configure simulation mode if needed:
   ```cpp
   #define TEMP_HUMID_SIMULATION_MODE false  // Set to true to simulate DHT22 readings
   #define LIGHT_SIMULATION_MODE false       // Set to true to simulate BH1750 readings
   ```

### JSON Format

The system sends data in the following JSON format:

```json
{
  "timestamp": 123456789,
  "sections": {
    "dewasa": {
      "temp": 31,
      "humidity": 70,
      "light": 350,
      "trends": {
        "temp": "equals",
        "humidity": "equals",
        "light": "equals"
      }
    },
    "penyemaian": {
      "temp": 29,
      "humidity": 71,
      "light": 380,
      "trends": {
        "temp": "equals",
        "humidity": "equals",
        "light": "equals"
      }
    },
    "peremajaan": {
      "temp": 28,
      "humidity": 68,
      "light": 320,
      "trends": {
        "temp": "equals",
        "humidity": "equals",
        "light": "equals"
      }
    }
  },
  "averages": {
    "temp": 29,
    "humidity": 70,
    "light": 350
  }
}
```

Note: All numeric values are rounded to integers for cleaner presentation. Light intensity is reported in lux units.

If a sensor or entire node is not available, null values will be sent for those readings. The JSON dynamically adjusts to include only valid data.

## Tested and Confirmed Working Files
1. DeWasaNode_Master.cpp (all features implemented and tested) E4:65:B8:83:D1:40

## Not yet Tested Files (assume bugged or not working yet)
1. PenyemainNode.cpp
2. PeremajaanNode.cpp 4C:11:AE:64:D0:74

## Overview

This document provides complete instructions for setting up the hardware components of our greenhouse monitoring system. The system consists of three ESP32 nodes monitoring different growth zones:

1. **Dewasa Node (Master)** - Mature plants section
2. **Penyemaian Node** - Seedling section
3. **Peremajaan Node** - Young plants section

Each node has temperature, humidity, and light sensors. The Dewasa node acts as the master, collecting data from all nodes and sending it to the server via MQTT.

## Hardware Requirements

### For Each Node
- 1× ESP32 development board
- 1× DHT22 temperature and humidity sensor
- 1× BH1750 light intensity sensor
- 1× Breadboard
- Jumper wires (male-to-male, male-to-female)
- Power supply (USB cable or battery pack)

### Additional for Master Node (Dewasa)
- WiFi connectivity for MQTT communication

### Tools
- Soldering iron and solder (if making permanent connections)
- Wire cutters/strippers
- Multimeter (for troubleshooting)
- Hot glue gun or mounting hardware (for final installation)

## Pin Connections

### Dewasa Node (Master)

| Component | ESP32 Pin | Notes |
|-----------|-----------|-------|
| **DHT22** | | |
| Data Pin | GPIO4 | Digital input |
| VCC | 3.3V | Power supply |
| GND | GND | Ground |
| **BH1750** | | |
| SDA | GPIO21 | I2C data |
| SCL | GPIO22 | I2C clock |
| VCC | 3.3V | Power supply |
| GND | GND | Ground |

### Penyemaian Node

| Component | ESP32 Pin | Notes |
|-----------|-----------|-------|
| **DHT22** | | |
| Data Pin | GPIO4 | Digital input |
| VCC | 3.3V | Power supply |
| GND | GND | Ground |
| **BH1750** | | |
| SDA | GPIO21 | I2C data |
| SCL | GPIO22 | I2C clock |
| VCC | 3.3V | Power supply |
| GND | GND | Ground |

### Peremajaan Node

| Component | ESP32 Pin | Notes |
|-----------|-----------|-------|
| **DHT22** | | |
| Data Pin | GPIO4 | Digital input |
| VCC | 3.3V | Power supply |
| GND | GND | Ground |
| **BH1750** | | |
| SDA | GPIO21 | I2C data |
| SCL | GPIO22 | I2C clock |
| VCC | 3.3V | Power supply |
| GND | GND | Ground |

## Wiring Diagrams

### DHT22 Connection
```
ESP32                DHT22
-----                -----
3.3V    --------    VCC
GPIO4   --------    DATA
GND     --------    GND
```

### BH1750 Connection
```
ESP32                BH1750
-----                ------
3.3V    --------    VCC
GND     --------    GND
GPIO21  --------    SDA
GPIO22  --------    SCL
```

## Using Simulation Mode

The system includes a simulation mode that allows you to operate even when sensors are not connected. This is useful for:

1. **Testing and Development**: Test the system without physical sensors
2. **Debugging**: Isolate hardware vs. software issues
3. **Demo Purposes**: Demonstrate the system when not all hardware is available

### Configuration Options

In each node's cpp file, there are two main simulation configuration options:

```cpp
// Simulation mode configuration
#define TEMP_HUMID_SIMULATION_MODE false  // Set to true to simulate DHT22 readings
#define LIGHT_SIMULATION_MODE false       // Set to true to simulate BH1750 readings
```

You can change these values to:
- `true`: Always use simulated random data
- `false`: Always try to read from the physical sensor

### Simulated Sensor Values

When in simulation mode:
- Temperature: Random values between 20-35°C
- Humidity: Random values between 40-90%
- Light: Random values between 0-10000 lux (realistic indoor to outdoor light levels)

### Partial Sensor Setup

Each sensor type can be independently configured for simulation. This means you can:
- Connect only a DHT22 and simulate the light sensor
- Connect only a BH1750 and simulate the temperature/humidity sensor
- Simulate both sensors if no hardware is connected

## ESP-NOW Configuration

**IMPORTANT: You must update the MAC addresses in the code to match your actual ESP32 devices.**

1. Find each ESP32's MAC address:
   - Upload the following sketch to each ESP32:
     ```cpp
     #include <WiFi.h>
     void setup() {
       Serial.begin(115200);
       WiFi.mode(WIFI_STA);
       Serial.print("MAC Address: ");
       Serial.println(WiFi.macAddress());
     }
     void loop() {}
     ```
   - Open the Serial Monitor at 115200 baud
   - Note the MAC address displayed for each device

2. Update the MAC addresses in each cpp file:
   - In `DeWasaNode_Master.cpp`, update the `penyemaianMac` and `peremajaaanMac` arrays with the actual MAC addresses
   - In `PenyemaianNode.cpp` and `PeremajaanNode.cpp`, update the `masterMac` array with the Dewasa node's MAC address

## WiFi and MQTT Configuration (Master Node Only)

In the `DeWasaNode_Master.cpp` file, update the following variables:

```cpp
// WiFi configuration
const char* ssid = "YourWiFiSSID";      // Replace with your WiFi SSID
const char* password = "YourWiFiPass";  // Replace with your WiFi password

// MQTT configuration
const char* mqtt_server = "broker.emqx.io"; // Replace if using a different broker
const int mqtt_port = 1883;                // Standard MQTT port
const char* mqtt_topic = "lokatech/greenhouse/sensors"; // Topic to publish data
```

Note: If you experience connection issues with public MQTT brokers like `broker.emqx.io`, try alternatives like `test.mosquitto.org` or `broker.hivemq.com`.

## Troubleshooting

### MQTT Connection Issues

1. **Broker Connection Problems:**
   - Check the MQTT state value reported in log messages
   - Verify the broker address and port
   - Try increasing the buffer size if payloads are large
   - Consider switching to a different broker
   - Check if your network allows outbound connections to the MQTT port

2. **WiFi Connection:**
   - Verify SSID and password
   - Check WiFi signal strength (RSSI) reported in logs
   - Make sure the ESP32 has a stable power supply

### Sensor Reading Failures

1. **DHT22 Issues:**
   - Check wiring connections
   - Ensure adequate power supply (DHT22 needs stable 3.3V)
   - Check for "Failed to read from DHT sensor!" message
   - Try increasing the interval between readings (>2 seconds)
   - Enable simulation mode if the sensor is faulty or unavailable

2. **BH1750 Issues:**
   - Verify I2C connections (SDA/SCL)
   - Check for "Failed to initialize BH1750 sensor!" message
   - Try scanning I2C addresses with an I2C scanner sketch
   - Enable simulation mode if the sensor is faulty or unavailable

### ESP-NOW Communication Issues

1. **Check MAC Addresses:**
   - Verify all MAC addresses are correctly entered in the code
   - MAC addresses should be in the format: `{0x11, 0x22, 0x33, 0x44, 0x55, 0x66}`

2. **Check ESP-NOW Initialization:**
   - Look for "ESP-NOW initialized successfully" message in serial output
   - If failed, try resetting both devices

3. **Check Distance:**
   - ESP-NOW has a limited range (~40m line of sight)
   - Reduce distance or add a repeater node if necessary

## Light Measurement Units

The system now uses lux (lx) as the standard unit for light intensity measurements:

- Lux is the SI unit of illuminance, measuring lumens per square meter
- Typical indoor lighting: 100-500 lux
- Office lighting standard: ~500 lux
- Overcast day outdoors: ~1000 lux
- Full daylight (not direct sun): ~10,000 lux
- Direct sunlight: ~100,000 lux

The BH1750 sensor can measure from 1 lux to 65535 lux, making it suitable for both indoor and bright outdoor environments.

## Security Considerations

- The current implementation doesn't use MQTT authentication - add username/password for production
- ESP-NOW communication is not encrypted - enable encryption for sensitive environments
- Consider using TLS for MQTT communication in production environments

## Fuzzy Logic Control System

### Overview

The greenhouse monitoring system implements a fuzzy logic control system that automatically manages the fans and lights based on environmental conditions. This implementation runs on the Dewasa (master) node, which aggregates sensor data from all sections and makes control decisions.

### Input Variables and Membership Functions

1. **Temperature** 
   - **Range**: 15-35°C
   - **Fuzzy Sets**: COLD (15-22°C), OPTIMAL (20-25°C), HOT (23-35°C)

2. **Humidity**
   - **Range**: 20-100%
   - **Fuzzy Sets**: DRY (20-70%), NORMAL (65-95%), HUMID (90-100%)

3. **Light Level**
   - Now measured in lux rather than percentage:
   - **Range**: 0-10,000+ lux
   - **Fuzzy Sets**:
     - DARK: 0-200 lux (indoor environment with minimal lighting)
     - MEDIUM: 200-1000 lux (typical indoor lighting)
     - BRIGHT: 1000+ lux (well-lit indoor or outdoor conditions)

### Output Controls

1. **Fan Control**: Binary output (ON/OFF)
2. **Light Control**: Binary output (ON/OFF)

### Implementation Notes

The fuzzy logic controller is designed to work with the raw lux values now being used throughout the system. 

For any questions or issues, please contact the system administrator or review the firmware code in the cpp files for detailed implementation notes.

