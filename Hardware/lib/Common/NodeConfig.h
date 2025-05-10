#ifndef NODECONFIG_H
#define NODECONFIG_H

// --- Communication & Timing Configuration ---
#define WIFI_CHANNEL 1           // Define the operating channel (1-11 recommended)
#define SENSOR_READ_INTERVAL 2000UL // Read sensors every 2 seconds (was 3 seconds)
#define SEND_INTERVAL 2000UL        // Send data every 2 seconds (Penyemaian, Peremajaan)
#define MQTT_PUBLISH_INTERVAL 2000UL // Publish MQTT every 2 seconds (Dewasa)

// --- Data Validity Timeouts (Considered stale after this duration) ---
#define PENYEMAIAN_DATA_TIMEOUT 5000UL // Timeout for data from Penyemaian (on Peremajaan)
#define COMBINED_DATA_TIMEOUT 7000UL   // Timeout for data from Peremajaan (on Dewasa/Gateway)
#define GATEWAY_DATA_TIMEOUT 9000UL    // Timeout for data from Gateway (on Dewasa)

// --- Hardware Pins ---
#define DHT_PIN 4              // DHT22 data pin

// --- MAC ADDRESS CONFIGURATION ---
// *** UPDATE THESE WITH YOUR ACTUAL MAC ADDRESSES ***
// Find using GetMacAddress sketch or Serial Monitor output at boot

// MAC Address of the Penyemaian Node
const uint8_t MAC_ADDR_PENYEMAIAN[] = {0x4C, 0x11, 0xAE, 0x64, 0xD0, 0x74};  // Replace with actual

// MAC Address of the Peremajaan Node
const uint8_t MAC_ADDR_PEREMAJAAN[] = {0xA8, 0x42, 0xE3, 0x5A, 0x78, 0xD4}; // Replace with actual

// MAC Address of the NEW Gateway Node
const uint8_t MAC_ADDR_GATEWAY[]    = {0x20, 0x43, 0xA8, 0x64, 0xE4, 0xA8}; // Replace with actual

// MAC Address of the Dewasa/Master Node (even if not used for ESP-NOW)
const uint8_t MAC_ADDR_DEWASA[]     = {0xE4, 0x65, 0xB8, 0x83, 0xD1, 0x40}; // Replace with actual


// --- DEBUGGING FLAGS ---
// Master switch for all debug serial prints. Set to false to disable all below.
#define DEBUG_SERIAL_OUTPUT_ENABLED true 

#if DEBUG_SERIAL_OUTPUT_ENABLED
    // DewasaNode_Master.cpp specific debugs
    #define DEBUG_DEWASA_MAIN               true  // General setup and loop prints
    #define DEBUG_DEWASA_SERIAL_GATEWAY     false  // Serial2 communication with Gateway
    #define DEBUG_DEWASA_MQTT_CALLBACK      true  // Detailed MQTT callback processing
    #define DEBUG_DEWASA_FUZZY_CONTROL      false  // Periodic fuzzy logic debug summary
    #define DEBUG_DEWASA_AVERAGES           false // Detailed average calculation prints (can be verbose)
    #define DEBUG_DEWASA_MQTT_SELF_TEST     false // MQTT self-test message in loop

    // SensorManager.cpp specific debugs
    #define DEBUG_SENSOR_MANAGER            false  // Sensor readings and simulation status

    // FuzzyController.cpp specific debugs
    #define DEBUG_FUZZY_CONTROLLER_INTERNAL false  // Initialization and internal fuzzy steps

    // MQTTManager.cpp specific debugs
    #define DEBUG_MQTT_MANAGER              true  // WiFi connection, MQTT connection, publish attempts

    // Other Nodes (add as needed)
    #define DEBUG_PENYEMAIAN                true
    #define DEBUG_PEREMAJAAN                true
    #define DEBUG_GATEWAY                   true
#else
    // If master switch is off, all debug flags are turned off
    #define DEBUG_DEWASA_MAIN               false
    #define DEBUG_DEWASA_SERIAL_GATEWAY     false
    #define DEBUG_DEWASA_MQTT_CALLBACK      false
    #define DEBUG_DEWASA_FUZZY_CONTROL      false
    #define DEBUG_DEWASA_AVERAGES           false
    #define DEBUG_DEWASA_MQTT_SELF_TEST     false
    #define DEBUG_SENSOR_MANAGER            false
    #define DEBUG_FUZZY_CONTROLLER_INTERNAL false
    #define DEBUG_MQTT_MANAGER              false
    #define DEBUG_PENYEMAIAN                false
    #define DEBUG_PEREMAJAAN                false
    #define DEBUG_GATEWAY                   false
#endif

// Add other common configuration constants here as needed

#endif // NODECONFIG_H
