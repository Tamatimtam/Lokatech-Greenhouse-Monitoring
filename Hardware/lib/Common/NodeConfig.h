#ifndef NODECONFIG_H
#define NODECONFIG_H

// --- Communication & Timing Configuration ---
#define WIFI_CHANNEL 1           // Define the operating channel (1-11 recommended)
#define SENSOR_READ_INTERVAL 2000UL // Read sensors every 3 seconds
#define SEND_INTERVAL 2000UL        // Send data every 3 seconds (Penyemaian, Peremajaan)
#define MQTT_PUBLISH_INTERVAL 2000UL // Publish MQTT every 3 seconds (Dewasa)

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


// Add other common configuration constants here as needed

#endif // NODECONFIG_H
