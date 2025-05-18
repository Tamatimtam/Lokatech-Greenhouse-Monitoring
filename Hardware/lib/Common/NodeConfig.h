// File: Hardware/lib/Common/NodeConfig.h
#ifndef NODE_CONFIG_H
#define NODE_CONFIG_H

#include <Arduino.h> // For uint8_t

// --- Common Hardware Pins ---
#define DHT_PIN 4 // DHT22 data pin for all nodes that have it

// --- ESP-NOW Configuration ---
#define WIFI_CHANNEL 1 // IMPORTANT: All ESP-NOW nodes must be on the same channel (1-11 recommended)

// --- MAC Addresses of Nodes ---
// Note: Comments updated to reflect NEW LOGICAL ROLES.
// The physical boards and their MACs don't change, but their roles in the system do.

// MAC Address of the Penyemaian Node (sends to Gateway)
const uint8_t MAC_ADDR_PENYEMAIAN[] = {0x4C, 0x11, 0xAE, 0x64, 0xD0, 0x74}; // Replace with actual Penyemaian MAC 

// MAC Address of the (Old Peremajaan) Node, WHICH IS NOW THE NEW "DEWASA NODE" (sends to Gateway)
const uint8_t MAC_ADDR_DEWASA[]     = {0xA8, 0x42, 0xE3, 0x5A, 0x78, 0xD4}; // Replace with actual (Old Peremajaan) MAC  

// MAC Address of the Gateway Node (receives from Penyemaian & Dewasa, sends Serial to Remaja/Master)
const uint8_t MAC_ADDR_GATEWAY[]    = {0x20, 0x43, 0xA8, 0x64, 0xE4, 0xA8}; // Replace with actual Gateway MAC

// MAC Address of the (Old Dewasa) Node, WHICH IS NOW THE NEW "REMAJA NODE (MASTER)" (receives Serial from Gateway, does MQTT)
const uint8_t MAC_ADDR_REMAJA_MASTER[] = {0xE4, 0x65, 0xB8, 0x83, 0xD1, 0x40}; // Replace with actual (Old Dewasa) MAC


// --- Data Validity Timeouts (in milliseconds) ---
// How long to consider data from a preceding node as "fresh"

// For data received by Gateway from Penyemaian Node via ESP-NOW
const unsigned long PENYEMAIAN_ESP_NOW_TIMEOUT = 7000UL; // e.g., 7 seconds

// For data received by Gateway from Dewasa Node via ESP-NOW
const unsigned long DEWASA_ESP_NOW_TIMEOUT = 7000UL;     // e.g., 7 seconds

// For data received by Remaja (Master) from Gateway via Serial
const unsigned long GATEWAY_SERIAL_TIMEOUT = 9000UL;     // e.g., 9 seconds

// **NEWLY ADDED for ESPNowManager.cpp compilation**
// This timeout was for the old ESPNowManager that received CombinedData.
// It's added here to allow ESPNowManager.cpp to compile, even if not actively used
// by the new Remaja Master node.
const unsigned long COMBINED_DATA_TIMEOUT = 7000UL;      // e.g., 7 seconds


// --- Node-Specific Operation Intervals (in milliseconds) ---
const unsigned long SENSOR_READ_INTERVAL = 2000UL;  // How often nodes read their local sensors (2 seconds)
const unsigned long SEND_INTERVAL = 2000;         // How often nodes send data (was 5 seconds, now 2 to match MQTT)
const unsigned long MQTT_PUBLISH_INTERVAL = 2000; // How often Remaja (Master) publishes to MQTT (was 5 seconds, now 2)


// --- Serial Communication (Gateway <-> Remaja/Master) ---
const long SERIAL_BAUD_RATE = 115200;
// NEW: Serial Command ACK Configuration (Remaja Master <-> Gateway)
const unsigned long SERIAL_COMMAND_ACK_TIMEOUT_MS = 500UL; // Timeout for Remaja Master to wait for ACK from Gateway
const int MAX_SERIAL_COMMAND_RETRIES = 30;
const unsigned long SERIAL_COMMAND_RETRY_DELAY_MS = 200UL;


// --- Actuator Pins (for Remaja Node (Master) - Old Dewasa Hardware) ---
const int REMAJA_FAN_LED_PIN = 18;
const int REMAJA_LIGHT_LED_PIN = 19;

// --- Actuator Pins (for Dewasa Node - Old Peremajaan Hardware) ---
const int DEWASA_FAN_PIN = 18; // Example pin, adjust if different on that board
const int DEWASA_LIGHT_PIN = 19; // Example pin

// --- NTP Configuration (for Remaja Node (Master)) ---
extern const char* NTP_SERVER_1;
extern const char* NTP_SERVER_2;
const long  GMT_OFFSET_SEC = 7 * 3600; // WIB is UTC+7
const int   DAYLIGHT_OFFSET_SEC = 0;   // No daylight saving for WIB
const int NTP_SYNC_RETRY_COUNT = 5;
const unsigned long NTP_SYNC_RETRY_DELAY_MS = 2000; // 2 seconds between retries
const unsigned long NTP_RESYNC_INTERVAL_MS = 1 * 60 * 60 * 1000; // Resync NTP every 1 hour

// --- ESP-NOW Command Control (Gateway to Dewasa) ---
const unsigned long COMMAND_ACK_TIMEOUT_MS = 200UL; // Timeout for waiting for command ACK
const int MAX_COMMAND_SEND_RETRIES = 3;
const unsigned long COMMAND_RETRY_DELAY_MS = 150UL;


// --- Debug Flags (Optional) ---
// #define DEBUG_PENYEMAIAN
// #define DEBUG_DEWASA_NODE // For the new Dewasa Node (old Peremajaan)
 #define DEBUG_GATEWAY 1
 #define DEBUG_REMAJA_MASTER 1 // For the new Remaja Master (old Dewasa)
 #define DEBUG_MQTT_MANAGER 1
// #define DEBUG_SENSOR_MANAGER
 #define DEBUG_FUZZY_CONTROLLER_INTERNAL  1
 #define DEBUG_REMAJA_FUZZY_CONTROL 1
 #define DEBUG_NTP 1


#endif // NODE_CONFIG_H