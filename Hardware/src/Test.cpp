// filepath: /home/timtam/Documents/code/simpleLogin/Hardware/src/GatewayNode.cpp
#include <Arduino.h>
#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>
// #include <ArduinoJson.h> // Temporarily disabled
#include "../lib/Common/SensorData.h" // Still needed for CombinedData size reference if used later
#include "../lib/Common/NodeConfig.h" // Include WIFI_CHANNEL and MAC addresses

// --- Configuration ---
// Serial port for communication WITH Dewasa Node (Temporarily disabled)
// #define SERIAL_TO_DEWASA Serial2
// const long SERIAL_BAUD_RATE = 115200;
// --- End Configuration ---

// Global variable to store received data (Keep for potential future use, but not filled in simplified version)
// CombinedData receivedCombinedData; // Temporarily disabled direct use

volatile bool packetReceivedFlag = false; // Simple flag for ANY packet reception
volatile int lastPacketLen = 0;
uint8_t lastSenderMac[6] = {0};

// ESP-NOW Receive Callback - SIMPLIFIED FOR DEBUGGING
void OnDataRecv(const uint8_t *mac_addr, const uint8_t *incomingData, int len) {
    Serial.println("\n***********************************");
    Serial.println("[Gateway CB] ESP-NOW Packet Received!");
    Serial.print("  -> Source MAC: ");
    for(int i=0; i<6; i++) {
        Serial.print(mac_addr[i], HEX);
        if(i<5) Serial.print(":");
        lastSenderMac[i] = mac_addr[i]; // Store MAC for main loop reporting
    }
    Serial.println();
    Serial.print("  -> Data Length: ");
    Serial.println(len);
    lastPacketLen = len; // Store length for main loop reporting

    // --- VERY IMPORTANT ---
    // Check if it's the expected sender MAC (using NodeConfig.h)
    if (memcmp(mac_addr, MAC_ADDR_PEREMAJAAN, 6) == 0) {
        Serial.println("  -> MAC Address MATCHES expected PeremajaanNode.");
    } else {
        Serial.println("  -> WARNING: MAC Address does NOT match expected PeremajaanNode.");
        Serial.print("     Expected: ");
        for(int i=0; i<6; i++) { Serial.print(MAC_ADDR_PEREMAJAAN[i], HEX); if(i<5) Serial.print(":"); }
        Serial.println();
    }

    // Check if the length matches what we *expect* for CombinedData
    if (len == sizeof(CombinedData)) {
         Serial.println("  -> Data Length MATCHES expected sizeof(CombinedData).");
    } else {
         Serial.println("  -> WARNING: Data Length does NOT match sizeof(CombinedData).");
         Serial.print("     Expected: "); Serial.print(sizeof(CombinedData)); Serial.println(" bytes.");
    }
    // --- End Checks ---


    // Don't process data here, just set the flag
    packetReceivedFlag = true;
    Serial.println("[Gateway CB] Flag set for main loop.");
    Serial.println("***********************************\n");
}

void setup() {
    // Initialize Serial for debugging output
    Serial.begin(115200);
    delay(2000); // Longer delay to ensure Serial Monitor is ready
    Serial.println("\n\n[GatewayNode] Starting SIMPLIFIED ESP-NOW Gateway (Receive Debug Mode)...");

    // Initialize Serial2 for communication with Dewasa (Temporarily disabled)
    // SERIAL_TO_DEWASA.begin(SERIAL_BAUD_RATE, SERIAL_8N1, 16, 17);
    // Serial.println("[GatewayNode] Serial2 for Dewasa NOT initialized in this debug version.");

    // Set WiFi Station mode
    Serial.println("[GatewayNode] Setting WiFi mode to WIFI_STA...");
    WiFi.mode(WIFI_STA);
    Serial.println("[GatewayNode] Disconnecting WiFi (if connected)...");
    WiFi.disconnect(); // Not connecting, just need STA mode for ESP-NOW channel setting
    delay(100);
    Serial.print("[GatewayNode] Current MAC Address: ");
    Serial.println(WiFi.macAddress());

    // Set WiFi Channel (MUST match Peremajaan)
    Serial.printf("[GatewayNode] Attempting to set WiFi channel to %d (from NodeConfig.h)...\n", WIFI_CHANNEL);
    esp_err_t channel_set_result = esp_wifi_set_channel(WIFI_CHANNEL, WIFI_SECOND_CHAN_NONE);
    if (channel_set_result != ESP_OK) {
        Serial.printf("[GatewayNode] FATAL ERROR: Failed to set WiFi channel %d! ESP Error Code: %d. Halting.\n", WIFI_CHANNEL, channel_set_result);
        while(1) { delay(1000); } // Stop execution
    } else {
        Serial.printf("[GatewayNode] WiFi channel successfully set to %d.\n", WIFI_CHANNEL);
    }

    // Initialize ESP-NOW
    Serial.println("[GatewayNode] Initializing ESP-NOW...");
    if (esp_now_init() != ESP_OK) {
        Serial.println("[GatewayNode] FATAL ERROR: Failed to initialize ESP-NOW. Halting.");
        while(1) { delay(1000); } // Stop execution
    }
    Serial.println("[GatewayNode] ESP-NOW Initialized Successfully.");

    // Register the receive callback function
    Serial.println("[GatewayNode] Registering ESP-NOW Receive Callback...");
    if (esp_now_register_recv_cb(OnDataRecv) != ESP_OK) {
         Serial.println("[GatewayNode] FATAL ERROR: Failed to register Receive Callback. Halting.");
         while(1) { delay(1000); } // Stop execution
    }
    Serial.println("[GatewayNode] ESP-NOW Receive Callback Registered.");

    // Optional: Add Peremajaan as a peer (Good practice, helps ESP-NOW manage connections)
    Serial.println("[GatewayNode] Attempting to add Peremajaan node as peer...");
    esp_now_peer_info_t peerInfo = {};
    memcpy(peerInfo.peer_addr, MAC_ADDR_PEREMAJAAN, 6); // Use central definition
    peerInfo.channel = WIFI_CHANNEL; // Ensure channel matches
    peerInfo.encrypt = false;
    esp_err_t add_peer_result = esp_now_add_peer(&peerInfo);
    if (add_peer_result == ESP_OK) {
        Serial.println("[GatewayNode] Peremajaan node added as peer successfully.");
    } else if (add_peer_result == ESP_ERR_ESPNOW_EXIST) {
         Serial.println("[GatewayNode] Warning: Peremajaan node peer already exists.");
    }
     else {
        Serial.printf("[GatewayNode] Warning: Failed to add Peremajaan peer. ESP Error Code: %d\n", add_peer_result);
        // Note: Receiving might still work even if adding peer fails, but it's less reliable.
    }

     Serial.println("\n[GatewayNode] Setup Complete. Now actively listening for ANY ESP-NOW packets...");
     Serial.println("--------------------------------------------------");
}

void loop() {
    // Check if the callback flag was set
    if (packetReceivedFlag) {
        Serial.println("[Gateway Main Loop] Detected packetReceivedFlag was set by callback.");

        // --- Report details captured by the callback ---
        Serial.print("  -> Last Packet Sender MAC: ");
         for(int i=0; i<6; i++) { Serial.print(lastSenderMac[i], HEX); if(i<5) Serial.print(":"); }
         Serial.println();
         Serial.print("  -> Last Packet Length: ");
         Serial.println(lastPacketLen);
         Serial.println("--------------------------------------------------");
        // --- End Reporting ---


        // Reset the flag VERY IMPORTANTLY
        packetReceivedFlag = false;

        // --- JSON and Serial2 forwarding REMOVED for this test ---
        // Serial.println("[GatewayNode] JSON processing and Serial2 forwarding skipped in debug mode.");

    } // End if(packetReceivedFlag)

    // Keep the loop running, yield allows background tasks (like WiFi/ESP-NOW) to run
    yield();
    // Add a small delay if CPU usage is a concern, but yield is often enough
    // delay(10);
}
