#include <Arduino.h>
#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>
#include <ArduinoJson.h>
#include "../lib/Common/SensorData.h" // Include definition of CombinedData
#include "../lib/Common/NodeConfig.h" // Include WIFI_CHANNEL and MAC addresses

// --- Configuration ---
// MAC Address of the node sending data TO this gateway (Peremajaan Node) - DEFINED IN NodeConfig.h
// uint8_t peremajaanMac[] = {0xA8, 0x42, 0xE3, 0x5A, 0x78, 0xD4}; // REMOVED - Use MAC_ADDR_PEREMAJAAN

// Serial port for communication WITH Dewasa Node
// Using Serial2 (Default pins: RX2=GPIO16, TX2=GPIO17)
#define SERIAL_TO_DEWASA Serial2
const long SERIAL_BAUD_RATE = 115200;
// --- End Configuration ---

// Global variable to store received data
CombinedData receivedCombinedData;
volatile bool newDataReceived = false; // Flag to signal new data in the callback

// ESP-NOW Receive Callback
void OnDataRecv(const uint8_t *mac_addr, const uint8_t *incomingData, int len) {
    // Basic validation using central definition
    if (len != sizeof(CombinedData) || memcmp(mac_addr, MAC_ADDR_PEREMAJAAN, 6) != 0) {
         Serial.print("[Gateway] Received data from unexpected MAC or wrong size. MAC: ");
         for(int i=0; i<6; i++) { Serial.print(mac_addr[i], HEX); if(i<5) Serial.print(":"); }
         Serial.print(" Size: "); Serial.println(len);
        return;
    }

    // Copy data and set flag
    memcpy(&receivedCombinedData, incomingData, sizeof(CombinedData));
    newDataReceived = true; // Signal main loop to process
     // Keep Serial prints minimal in the callback if possible
     // Serial.println("[Gateway] Valid CombinedData received from Peremajaan.");
}

void setup() {
    // Initialize Serial for debugging output
    Serial.begin(115200);
    delay(1000);
    Serial.println("\n\n[GatewayNode] Starting ESP-NOW to Serial Gateway...");

    // Initialize Serial2 for communication with Dewasa
    SERIAL_TO_DEWASA.begin(SERIAL_BAUD_RATE, SERIAL_8N1, 16, 17); // RX2=16, TX2=17
    Serial.println("[GatewayNode] Serial2 initialized for Dewasa communication.");

    // Set WiFi Station mode
    WiFi.mode(WIFI_STA);
    WiFi.disconnect(); // Not connecting, just need STA mode for ESP-NOW channel setting
    Serial.print("[GatewayNode] MAC Address: ");
    Serial.println(WiFi.macAddress());

    // Set WiFi Channel (MUST match Peremajaan and Penyemaian)
    Serial.printf("[GatewayNode] Setting WiFi channel to %d...\n", WIFI_CHANNEL);
    if (esp_wifi_set_channel(WIFI_CHANNEL, WIFI_SECOND_CHAN_NONE) != ESP_OK) {
        Serial.println("[GatewayNode] ERROR setting WiFi channel!");
        // Consider halting or error state
    } else {
        Serial.println("[GatewayNode] WiFi channel set.");
    }

    // Initialize ESP-NOW
    if (esp_now_init() != ESP_OK) {
        Serial.println("[GatewayNode] Error initializing ESP-NOW");
        return; // Halt on failure
    }
    Serial.println("[GatewayNode] ESP-NOW Initialized.");

    // Register the receive callback function
    esp_now_register_recv_cb(OnDataRecv);
    Serial.println("[GatewayNode] ESP-NOW Receive Callback Registered.");

    // Optional: Add Peremajaan as a peer (helps with internal handling)
    esp_now_peer_info_t peerInfo = {};
    memcpy(peerInfo.peer_addr, MAC_ADDR_PEREMAJAAN, 6); // Use central definition
    peerInfo.channel = WIFI_CHANNEL;
    peerInfo.encrypt = false;
    if (esp_now_add_peer(&peerInfo) == ESP_OK) {
        Serial.println("[GatewayNode] Peremajaan node added as peer.");
    } else {
        Serial.println("[GatewayNode] Warning: Failed to add Peremajaan peer.");
    }

     Serial.println("[GatewayNode] Setup Complete. Waiting for data...");
}

void loop() {
    // Check if new data has arrived (flag set by callback)
    if (newDataReceived) {
        Serial.println("[GatewayNode] New data flag set. Processing...");

        // Reset the flag FIRST (critical to avoid race conditions if interrupt happens during processing)
        newDataReceived = false;

        // --- DEBUG: Print received validity flags ---
        Serial.println("[GatewayNode] DEBUG: Received Data Validity Flags:");
        Serial.printf("  Penyemaian Valid Overall (Recent): %s\n", receivedCombinedData.isPenyemaianDataValid ? "true" : "false");
        Serial.printf("  Penyemaian Temp Valid: %s\n", receivedCombinedData.penyemaianData.temperatureValid ? "true" : "false");
        Serial.printf("  Penyemaian Hum Valid: %s\n", receivedCombinedData.penyemaianData.humidityValid ? "true" : "false");
        Serial.printf("  Penyemaian Light Valid: %s\n", receivedCombinedData.penyemaianData.lightValid ? "true" : "false");
        Serial.printf("  Peremajaan Temp Valid: %s\n", receivedCombinedData.peremajaanData.temperatureValid ? "true" : "false");
        Serial.printf("  Peremajaan Hum Valid: %s\n", receivedCombinedData.peremajaanData.humidityValid ? "true" : "false");
        Serial.printf("  Peremajaan Light Valid: %s\n", receivedCombinedData.peremajaanData.lightValid ? "true" : "false");
        // --- END DEBUG ---


        // Create a JSON document to forward data
        // Adjust size if needed, 512 should be plenty
        StaticJsonDocument<512> doc;

        // Populate JSON from the received CombinedData struct
        doc["timestamp_ms"] = receivedCombinedData.timestamp; // Include original timestamp
        doc["isPenyemaianValid"] = receivedCombinedData.isPenyemaianDataValid;

        JsonObject peremajaan = doc.createNestedObject("peremajaan");
        // Use if/else for clarity (functionally same as ternary)
        if (receivedCombinedData.peremajaanData.temperatureValid) {
            peremajaan["temp"] = receivedCombinedData.peremajaanData.temperature;
        } else {
            peremajaan["temp"] = JsonVariant(); // Explicitly null
        }
        if (receivedCombinedData.peremajaanData.humidityValid) {
            peremajaan["hum"] = receivedCombinedData.peremajaanData.humidity;
        } else {
            peremajaan["hum"] = JsonVariant();
        }
        if (receivedCombinedData.peremajaanData.lightValid) {
            peremajaan["light"] = receivedCombinedData.peremajaanData.lightIntensity;
        } else {
            peremajaan["light"] = JsonVariant();
        }


        JsonObject penyemaian = doc.createNestedObject("penyemaian");
        // Use if/else for clarity
        if (receivedCombinedData.penyemaianData.temperatureValid) {
            penyemaian["temp"] = receivedCombinedData.penyemaianData.temperature;
        } else {
            penyemaian["temp"] = JsonVariant(); // Explicitly null
        }
        if (receivedCombinedData.penyemaianData.humidityValid) {
            penyemaian["hum"] = receivedCombinedData.penyemaianData.humidity;
        } else {
            penyemaian["hum"] = JsonVariant();
        }
        if (receivedCombinedData.penyemaianData.lightValid) {
            penyemaian["light"] = receivedCombinedData.penyemaianData.lightIntensity;
        } else {
            penyemaian["light"] = JsonVariant();
        }

        // Serialize JSON to String
        String outputJson;
        serializeJson(doc, outputJson);

        // Send the JSON string over Serial2 to the Dewasa node
        SERIAL_TO_DEWASA.println(outputJson);

        // Debug: Print to Serial0 what was sent to Serial2
        Serial.println("[GatewayNode] Forwarded JSON via Serial2 to Dewasa:");
        Serial.println(outputJson);

    } // End if(newDataReceived)

    // Small delay/yield to allow background tasks
     yield();
     // delay(5);
}
