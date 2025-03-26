# Greenhouse Monitoring System - Hardware Setup Guide

## Tested and Confirmed Working Files
1. DeWasaNode_Master.ino (all features working, individual sensor error works on the front end)

## Not yet Tested Files (assume bugged or not working yet)
1. PenyemainNode.ino
2. PeremajaanNode.ino

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
- 2× LED indicators (optional for status display)
- 2× 220Ω resistors (for LEDs if used)
- Power supply (USB cable or battery pack)
- 1× Push button (optional for simulation mode toggle)
- 1× 10kΩ resistor (for button pull-up if needed)

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
| **Optional Status LEDs** | | |
| Status LED | GPIO2 | With 220Ω resistor |
| Error LED | GPIO15 | With 220Ω resistor |
| **Simulation Toggle** | | |
| Button | GPIO13 | Connect to GND when pressed |

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
| **Battery Monitor** | | |
| Battery Level | GPIO34 | Analog input |
| **Optional Status LEDs** | | |
| Status LED | GPIO2 | With 220Ω resistor |
| Error LED | GPIO15 | With 220Ω resistor |
| **Simulation Toggle** | | |
| Button | GPIO13 | Connect to GND when pressed |

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
| **Optional Status LEDs** | | |
| Status LED | GPIO2 | With 220Ω resistor |
| Error LED | GPIO15 | With 220Ω resistor |
| **Simulation Toggle** | | |
| Button | GPIO13 | Connect to GND when pressed |

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

### Status LED Connection (Optional)
```
ESP32                LED         Resistor       
-----                ---         --------
GPIO2   --------    Anode  ---> 220Ω  ---> GND
GPIO15  --------    Anode  ---> 220Ω  ---> GND
```

### Simulation Toggle Button (Optional)
```
ESP32                Button
-----                ------
GPIO13  --------    Pin 1
GND     --------    Pin 2
```

## Using Simulation Mode

The system now includes a simulation mode that allows you to operate even when sensors are not connected. This is useful for:

1. **Testing and Development**: Test the system without physical sensors
2. **Debugging**: Isolate hardware vs. software issues
3. **Demo Purposes**: Demonstrate the system when not all hardware is available

### Configuration Options

In each node's INO file, there are two main simulation configuration options:

```cpp
// Simulation mode configuration
#define TEMP_HUMID_SIMULATION_MODE false  // Set to true to simulate DHT22 readings
#define LIGHT_SIMULATION_MODE false       // Set to true to simulate BH1750 readings
```

You can change these values to:
- `true`: Always use simulated random data
- `false`: Always try to read from the physical sensor

### Runtime Toggle

You can also toggle the simulation mode at runtime by connecting a button to the `SIMULATION_TOGGLE_PIN` (default: GPIO13). When pressed:

1. The node will toggle between simulation and real sensor mode
2. A debug message will be printed to the serial monitor
3. The status LEDs will blink to confirm the change

### Simulated Sensor Values

When in simulation mode:
- Temperature: Random values between 20-35°C
- Humidity: Random values between 40-90%
- Light: Random values between 0-100%

### Partial Sensor Setup

Each sensor type can be independently configured for simulation. This means you can:
- Connect only a DHT22 and simulate the light sensor
- Connect only a BH1750 and simulate the temperature/humidity sensor
- Simulate both sensors if no hardware is connected

## Detailed Setup Instructions

### Step 1: Setting Up the ESP32 Development Environment
1. Install Arduino IDE from [arduino.cc](https://www.arduino.cc/en/software)
2. Add ESP32 board support:
   - Open Arduino IDE
   - Go to **File > Preferences**
   - Add `https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json` to the "Additional Board Manager URLs" field
   - Go to **Tools > Board > Boards Manager**
   - Search for "ESP32" and install "ESP32 by Espressif Systems"
3. Install required libraries:
   - Go to **Tools > Manage Libraries**
   - Search for and install the following libraries:
     - "DHT sensor library" by Adafruit
     - "BH1750" by Christopher Laws
     - "PubSubClient" by Nick O'Leary
     - "ArduinoJson" by Benoit Blanchon
     - "ESP32" (should already be installed from board manager)

### Step 2: Hardware Assembly

#### For All Nodes:

1. **DHT22 Sensor Connection (Optional if using simulation mode):**
   - Connect VCC pin to ESP32's 3.3V
   - Connect GND pin to ESP32's GND
   - Connect DATA pin to GPIO4
   - Note: If your DHT22 has a 4-pin package, the 3rd pin is not used

2. **BH1750 Sensor Connection (Optional if using simulation mode):**
   - Connect VCC pin to ESP32's 3.3V
   - Connect GND pin to ESP32's GND
   - Connect SDA pin to GPIO21
   - Connect SCL pin to GPIO22
   - Note: Make sure pull-up resistors are present (usually included on BH1750 module)

3. **Optional: Status LEDs**
   - Connect the anode (longer leg) of the status LED to GPIO2 through a 220Ω resistor
   - Connect the anode of the error LED to GPIO15 through a 220Ω resistor
   - Connect the cathodes (shorter legs) of both LEDs to GND

4. **Optional: Simulation Toggle Button**
   - Connect one pin of the button to GPIO13
   - Connect the other pin to GND
   - When pressed, the button will toggle simulation mode for all sensors

### Step 3: Configuring Simulation Mode

1. **Edit the INO files:**
   - Open the INO file for the node you're configuring
   - Set `TEMP_HUMID_SIMULATION_MODE` to `true` if you don't have a DHT22 connected
   - Set `LIGHT_SIMULATION_MODE` to `true` if you don't have a BH1750 connected

2. **Using the toggle button:**
   - Connect a pushbutton between GPIO13 and GND
   - Press the button during operation to toggle simulation mode
   - The serial monitor will show the current simulation status

### Step 3: ESP-NOW Configuration

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

2. Update the MAC addresses in each INO file:
   - In `DeWasaNode_Master.ino`, update the `penyemaianMac` and `peremajaaanMac` arrays with the actual MAC addresses
   - In `PenyemaianNode.ino` and `PeremajaanNode.ino`, update the `masterMac` array with the Dewasa node's MAC address

### Step 4: WiFi and MQTT Configuration (Master Node Only)

In the `DeWasaNode_Master.ino` file, update the following variables:

```cpp
// WiFi configuration
const char* ssid = "YourWiFiSSID";      // Replace with your WiFi SSID
const char* password = "YourWiFiPass";  // Replace with your WiFi password

// MQTT configuration
const char* mqtt_server = "broker.emqx.io"; // Replace if using a different broker
const int mqtt_port = 1883;                // Standard MQTT port
const char* mqtt_topic = "lokatech/greenhouse/sensors"; // Topic to publish data
```

### Step 5: Flashing the Firmware

1. **For Dewasa (Master) Node:**
   - Connect the ESP32 to your computer
   - Open `DeWasaNode_Master.ino` in Arduino IDE
   - Select the correct board and port under the Tools menu
   - Click the Upload button
   - Open Serial Monitor (115200 baud) to verify successful initialization

2. **For Penyemaian Node:**
   - Connect the ESP32 to your computer
   - Open `PenyemaianNode.ino` in Arduino IDE
   - Select the correct board and port
   - Click Upload
   - Verify initialization in Serial Monitor

3. **For Peremajaan Node:**
   - Connect the ESP32 to your computer
   - Open `PeremajaanNode.ino` in Arduino IDE
   - Select the correct board and port
   - Click Upload
   - Verify initialization in Serial Monitor

## Using Partial Sensor Setups

The system is designed to work with partial sensor setups. This means you can:

1. **Use only the master node (Dewasa)** - The dashboard will display data from just this node.
2. **Connect only a DHT22 sensor** - The system will transmit temperature and humidity data, while the light sensor data will be marked as unavailable.
3. **Connect only a BH1750 sensor** - The system will transmit light data, while temperature and humidity will be marked as unavailable.

Each node independently reports the status of its sensors, and the dashboard automatically handles missing data. This is useful for:

- Testing with minimal hardware
- Deploying with different sensor combinations based on needs
- Continuing operation even if some sensors fail

### Dashboard Error Handling

The dashboard (`dashboard.js`) includes comprehensive error handling that will:

1. Show which nodes and sensors are online/offline
2. Display appropriate status messages
3. Hide or show "sensor error" indicators for problematic sensors
4. Calculate averages only from working sensors
5. Maintain a connection status display that shows overall system health

## Power Management

### Master Node (Dewasa)
The master node must remain powered continuously as it handles communication with the MQTT server. Connect it to a reliable power source.

### Satellite Nodes (Penyemaian and Peremajaan)
These nodes can be battery-powered. To extend battery life:

1. **Enable Deep Sleep:**
   - Uncomment the deep sleep code in the INO files:
     ```cpp
     esp_sleep_enable_timer_wakeup(SENSOR_READ_INTERVAL * 1000);
     esp_deep_sleep_start();
     ```
   - Adjust `SENSOR_READ_INTERVAL` based on how frequently you need data (higher values save more power)

2. **For Battery Level Monitoring:**
   - Connect a voltage divider to measure battery voltage on GPIO34
   - Calibrate the `readBatteryLevel()` function for your specific battery by adjusting the mapping values

## Waterproofing and Environmental Protection

For greenhouse deployment, protect the electronics from moisture:

1. **Waterproof Enclosures:**
   - Use IP65 or higher rated junction boxes
   - Drill small holes for sensors and seal with silicone
   - Use cable glands for any wire entry points

2. **Sensor Protection:**
   - For DHT22: Use a vented enclosure that allows airflow but blocks direct water
   - For BH1750: Place behind a clear plastic window in the enclosure

## Troubleshooting

### No Communication Between Nodes

1. **Check MAC Addresses:**
   - Verify all MAC addresses are correctly entered in the code
   - MAC addresses should be in the format: `{0x11, 0x22, 0x33, 0x44, 0x55, 0x66}`

2. **Check ESP-NOW Initialization:**
   - Look for "ESP-NOW initialized successfully" message in serial output
   - If failed, try resetting both devices

3. **Check Distance:**
   - ESP-NOW has a limited range (~40m line of sight)
   - Reduce distance or add a repeater node if necessary

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

### Master Node MQTT Connection Problems

1. **WiFi Connectivity:**
   - Check SSID and password
   - Verify WiFi signal strength at installation location
   - Look for "WiFi connected" message

2. **MQTT Broker Connection:**
   - Verify broker address and port
   - Check for "MQTT publish successful" messages
   - Try an alternative public broker for testing

### Simulation Mode Issues

1. **Simulation Mode Not Working:**
   - Check that the `SIMULATION_TOGGLE_PIN` is correctly defined in the code
   - Verify button wiring
   - Check the serial monitor for debug messages when toggling the mode

2. **Inconsistent Simulation Behavior:**
   - Restart the device after changing simulation settings
   - Make sure the random number generator is properly seeded

## Maintenance

### Regular Checks
- Monitor battery levels in satellite nodes (if battery-powered)
- Check for moisture in enclosures
- Clean any dust from sensor openings
- Verify all nodes are reporting in the web dashboard

### Firmware Updates
To update the firmware:
1. Make changes to the INO files
2. Reconnect each ESP32 to your computer
3. Upload the new firmware
4. Verify operation

## Data Format Reference

For reference, here's the JSON data format sent by the master node to MQTT:

```json
{
  "timestamp": 123456789,
  "sections": {
    "dewasa": {
      "temp": 28.5,
      "humidity": 65.2,
      "light": 75.8,
      "trends": {
        "temp": "equals",
        "humidity": "equals",
        "light": "equals"
      }
    },
    "penyemaian": {
      "temp": 29.1,
      "humidity": 70.5,
      "light": 80.2,
      "trends": {
        "temp": "equals",
        "humidity": "equals",
        "light": "equals"
      }
    },
    "peremajaan": {
      "temp": 27.8,
      "humidity": 68.3,
      "light": 72.4,
      "trends": {
        "temp": "equals",
        "humidity": "equals",
        "light": "equals"
      }
    }
  },
  "averages": {
    "temp": 28.5,
    "humidity": 68.0,
    "light": 76.1
  }
}
```

## Security Considerations

- The current implementation doesn't use MQTT authentication - add username/password for production
- ESP-NOW communication is not encrypted - enable encryption for sensitive environments
- Consider using TLS for MQTT communication in production environments

## Conclusion

After completing this setup, you should have a fully functional greenhouse monitoring system with three sensor nodes communicating via ESP-NOW, with the master node publishing data to an MQTT broker for the web dashboard to display.

For any questions or issues, please contact the system administrator or review the firmware code in the INO files for detailed implementation notes.

# Fuzzy Logic Control System

## Overview

The greenhouse monitoring system now implements a fuzzy logic control system that automatically manages the fans and lights based on environmental conditions. This implementation runs on the Dewasa (master) node, which aggregates sensor data from all sections and makes control decisions.

## Design Considerations

The fuzzy logic system takes into account several important constraints:

1. **Shared Control Systems**: All greenhouse sections (Dewasa, Penyemaian, Peremajaan) share a single lighting system and a single ventilation system that can only be turned fully ON or OFF.

2. **Multiple Input Parameters**: The system considers temperature, humidity, and light level from all three sections.

## Fuzzy Logic Variables and Membership Functions

### What are Membership Functions?

In fuzzy logic, a membership function defines how much a value belongs to a particular category (fuzzy set). For example, a temperature of 18°C might be 100% COLD, while 21°C might be 60% COLD and 40% OPTIMAL.

These functions are typically represented as triangular or trapezoidal shapes that overlap, allowing a value to partially belong to multiple categories at once.

### Input Variables and Membership Functions

1. **Temperature** 
   - **Range**: 15-35°C
   - **Fuzzy Sets**:
     - COLD: 15-22°C 
       * Full membership (100%): ≤18°C
       * Partial membership: 18-22°C (decreasing linearly from 100% to 0%)
     - OPTIMAL: 20-25°C 
       * Full membership (100%): 22-23°C
       * Partial membership: 20-22°C (increasing linearly from 0% to 100%)
       * Partial membership: 23-25°C (decreasing linearly from 100% to 0%)
     - HOT: 23-35°C
       * Full membership (100%): ≥28°C
       * Partial membership: 23-28°C (increasing linearly from 0% to 100%)

   **Example**: At 21°C:
   * COLD membership: 25% (partially cold)
   * OPTIMAL membership: 50% (partially optimal)
   * HOT membership: 0% (not hot at all)

2. **Humidity | Source: https://www.mdpi.com/2304-8158/10/7/1524**
   - **Range**: 20-100%
   - **Fuzzy Sets**:
     - DRY: 20-70% 
       * Full membership (100%): ≤50%
       * Partial membership: 50-70% (decreasing linearly from 100% to 0%)
     - NORMAL: 65-95% 
       * Full membership (100%): 80-90%
       * Partial membership: 65-80% (increasing linearly from 0% to 100%)
       * Partial membership: 90-95% (decreasing linearly from 100% to 0%)
     - HUMID: 90-100%
       * Full membership (100%): ≥95%
       * Partial membership: 90-95% (increasing linearly from 0% to 100%)

   **Example**: At 85% humidity:
   * DRY membership: 0% (not dry at all)
   * NORMAL membership: 100% (optimal for kale)
   * HUMID membership: 0% (not humid)

3. **Light Level**
   - **Range**: 0-100%
   - **Fuzzy Sets**:
     - DARK: 0-40% 
       * Full membership (100%): ≤20%
       * Partial membership: 20-40% (decreasing linearly from 100% to 0%)
     - MEDIUM: 30-70% 
       * Full membership (100%): 45-55%
       * Partial membership: 30-45% (increasing linearly from 0% to 100%)
       * Partial membership: 55-70% (decreasing linearly from 100% to 0%)
     - BRIGHT: 60-100%
       * Full membership (100%): ≥80%
       * Partial membership: 60-80% (increasing linearly from 0% to 100%)

   **Example**: At 30% light:
   * DARK membership: 50% (partially dark)
   * MEDIUM membership: 0% (barely medium)
   * BRIGHT membership: 0% (not bright at all)

### Visual Representation of Membership Functions

Temperature membership functions would look something like this:
```
    Membership
    100% |   COLD     OPTIMAL     HOT
         |    /\        /\        /\
         |   /  \      /  \      /  \
         |  /    \    /    \    /    \
     0%  |_/______\__/______\__/______\___
         15      20      25      30     35
                Temperature (°C)
```

### Output Variables

1. **Fan Control**
   - Binary output: ON or OFF
   - Based on defuzzified value with threshold at 0.5
   
2. **Light Control**
   - Binary output: ON or OFF
   - Based on defuzzified value with threshold at 0.5

## Fuzzy Rule Base

### Fan Control Rules

| Rule | Temperature | Humidity | Light | Fan Output |
|------|-------------|----------|-------|------------|
| 1    | HOT         | *        | *     | ON         |
| 2    | OPTIMAL     | HUMID    | *     | ON         |
| 3    | OPTIMAL     | NORMAL   | *     | OFF        |
| 4    | OPTIMAL     | DRY      | *     | OFF        |
| 5    | COLD        | HUMID    | *     | OFF  |
| 6    | COLD        | NORMAL   | *     | OFF        |
| 7    | COLD        | DRY      | *     | OFF        |

_* = Any value (doesn't affect this rule)_

### Light Control Rules

| Rule | Light  | Light Output |
|------|--------|--------------|
| 1    | DARK   | ON           |
| 2    | MEDIUM | OFF          |
| 3    | BRIGHT | OFF          |

_Note: Light control is based solely on light level, ignoring temperature and humidity_

## How Defuzzification Works

Let's walk through a complete example to show how the system makes decisions:

### Example: Temperature = 24°C, Humidity = 75%, Light = 30%

1. **Step 1: Calculate membership values**

   Temperature (24°C):
   * COLD: 0% (not cold)
   * OPTIMAL: 50% (partially optimal)
   * HOT: 20% (slightly hot)

   Humidity (75%):
   * DRY: 0% (not dry)
   * NORMAL: 0% (not normal)
   * HUMID: 75% (mostly humid)

   Light (30%):
   * DARK: 50% (partially dark)
   * MEDIUM: 0% (not medium)
   * BRIGHT: 0% (not bright)

2. **Step 2: Apply rules for fan control**

   Rule 1: IF temperature is HOT (20%) THEN fan is ON = 20%
   Rule 2: IF temperature is OPTIMAL (50%) AND humidity is HUMID (75%) THEN fan is ON = min(50%, 75%) = 50%
   Rule 3: IF temperature is OPTIMAL (50%) AND humidity is NORMAL (0%) THEN fan is OFF = min(50%, 0%) = 0%
   Rule 4: IF temperature is OPTIMAL (50%) AND humidity is DRY (0%) THEN fan is OFF = min(50%, 0%) = 0%
   Rule 5: IF temperature is COLD (0%) AND humidity is HUMID (75%) THEN fan is OFF = min(0%, 75%) = 0%
   Rule 6: IF temperature is COLD (0%) AND humidity is NORMAL (0%) THEN fan is OFF = min(0%, 0%) = 0%
   Rule 7: IF temperature is COLD (0%) AND humidity is DRY (0%) THEN fan is OFF = min(0%, 0%) = 0%

4. **Step 4: Apply rules for light control**

   Rule 1: IF light is DARK (50%) THEN light is ON = 50%
   Rule 2: IF light is MEDIUM (0%) THEN light is OFF = 0%
   Rule 3: IF light is BRIGHT (0%) THEN light is OFF = 0%

6. **Step 6: Make final decisions**

   Fan: 50% ON vs 0% OFF → Fan turns ON (50% > 0%)
   Light: 50% ON vs 0% OFF → Light turns ON (50% > 0%)

## Example Scenarios

### Scenario 1: Hot Afternoon

If temperature readings are high across all sections (above 30°C), the fan will automatically turn ON regardless of other conditions to prevent overheating.

### Scenario 2: Early Morning

If light levels are low (below 30%) and temperature is in the COLD range, the lights will turn ON to provide both light and heat for the plants.

### Scenario 3: High Humidity

If humidity reaches the HUMID range with OPTIMAL temperature, fans will turn ON to reduce moisture and prevent fungal diseases, even if this means sacrificing some heat.

## Implementation Notes

The fuzzy logic system is implemented in the DeWasaNode_Master.ino file. The controller:

1. Collects data from all nodes via ESP-NOW
2. Processes data through the fuzzy logic system
3. Makes control decisions
4. Applies the controls by activating relays for the fan and lights (Relay controls is not yet implemented. Only the DHT and BH1750 is finalized)
5. Includes the control state in MQTT messages for monitoring

## Maintenance and Calibration

Regularly calibrate the sensors and adjust the membership functions as needed to ensure accurate control decisions. Monitor the system's performance and make adjustments based on observed conditions and plant health.

