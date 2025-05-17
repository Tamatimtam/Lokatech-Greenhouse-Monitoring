#include <Arduino.h>
#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>
#include <ArduinoJson.h>
#include "../lib/Common/SensorData.h" 
#include "../lib/Common/NodeConfig.h" 

// --- Serial Communication with Remaja Node (Master) ---
#define SERIAL_TO_REMAJA_MASTER Serial2 

// --- Data Storage ---
SensorData receivedPenyemaianData;
SensorData receivedDewasaData;

volatile bool newPenyemaianDataFlag = false;
volatile bool newDewasaDataFlag = false;

unsigned long lastPenyemaianReceiveTime = 0;
unsigned long lastDewasaReceiveTime = 0;

// --- Timing for Forwarding Data ---
unsigned long lastSerialForwardTime = 0;
const unsigned long SERIAL_FORWARD_INTERVAL = 2500UL; 

// --- Simulated ESP-NOW Latency ---
int simulatedPenyemaianLatencyMs = -1;
int simulatedDewasaLatencyMs = -1;

// ESP-NOW Receive Callback
void OnDataRecv(const uint8_t *mac_addr, const uint8_t *incomingData, int len) {
    if (len != sizeof(SensorData)) {
        Serial.print("[Gateway] Received data with incorrect size. MAC: ");
        for(int i=0; i<6; i++) { Serial.print(mac_addr[i], HEX); if(i<5) Serial.print(":"); }
        Serial.print(" Size: "); Serial.println(len);
        return;
    }

    // Simulate ESP-NOW latency (20-80 ms)
    int simulated_latency = random(20, 81); // Upper bound is exclusive for random()

    if (memcmp(mac_addr, MAC_ADDR_PENYEMAIAN, 6) == 0) {
        memcpy(&receivedPenyemaianData, incomingData, sizeof(SensorData));
        lastPenyemaianReceiveTime = millis();
        newPenyemaianDataFlag = true;
        simulatedPenyemaianLatencyMs = simulated_latency;
        #if DEBUG_GATEWAY
        Serial.printf("[Gateway] Data received from Penyemaian. ESP-NOW Latency (Simulated): %d ms\n", simulated_latency);
        #endif
    } else if (memcmp(mac_addr, MAC_ADDR_DEWASA, 6) == 0) { 
        memcpy(&receivedDewasaData, incomingData, sizeof(SensorData));
        lastDewasaReceiveTime = millis();
        newDewasaDataFlag = true;
        simulatedDewasaLatencyMs = simulated_latency;
        #if DEBUG_GATEWAY
        Serial.printf("[Gateway] Data received from Dewasa. ESP-NOW Latency (Simulated): %d ms\n", simulated_latency);
        #endif
    } else {
        Serial.print("[Gateway] Received data from unrecognized MAC: ");
        for(int i=0; i<6; i++) { Serial.print(mac_addr[i], HEX); if(i<5) Serial.print(":"); }
        Serial.println();
    }
}

void setup() {
    Serial.begin(115200);
    delay(1000);
    Serial.println("\n\n[GatewayNode] Starting ESP-NOW to Serial Gateway (Dual Input)...");
    randomSeed(analogRead(0)); // Seed for random latency simulation

    SERIAL_TO_REMAJA_MASTER.begin(SERIAL_BAUD_RATE, SERIAL_8N1, 16, 17); 
    Serial.println("[GatewayNode] Serial to Remaja Master initialized.");

    WiFi.mode(WIFI_STA);
    WiFi.disconnect(); 
    Serial.print("[GatewayNode] MAC Address: ");
    Serial.println(WiFi.macAddress()); 

    Serial.printf("[GatewayNode] Setting WiFi channel to %d...\n", WIFI_CHANNEL);
    if (esp_wifi_set_channel(WIFI_CHANNEL, WIFI_SECOND_CHAN_NONE) != ESP_OK) {
        Serial.println("[GatewayNode] ERROR setting WiFi channel!");
        return; 
    }
    Serial.println("[GatewayNode] WiFi channel set.");

    if (esp_now_init() != ESP_OK) {
        Serial.println("[GatewayNode] Error initializing ESP-NOW");
        return; 
    }
    Serial.println("[GatewayNode] ESP-NOW Initialized.");
    esp_now_register_recv_cb(OnDataRecv);
    Serial.println("[GatewayNode] ESP-NOW Receive Callback Registered.");

    esp_now_peer_info_t penyemaianPeer = {};
    memcpy(penyemaianPeer.peer_addr, MAC_ADDR_PENYEMAIAN, 6);
    penyemaianPeer.channel = WIFI_CHANNEL;
    penyemaianPeer.encrypt = false;
    if (esp_now_add_peer(&penyemaianPeer) == ESP_OK) {
        Serial.println("[GatewayNode] Penyemaian node added as peer.");
    } else {
        Serial.println("[GatewayNode] Warning: Failed to add Penyemaian peer.");
    }

    esp_now_peer_info_t dewasaPeer = {};
    memcpy(dewasaPeer.peer_addr, MAC_ADDR_DEWASA, 6);
    dewasaPeer.channel = WIFI_CHANNEL;
    dewasaPeer.encrypt = false;
    if (esp_now_add_peer(&dewasaPeer) == ESP_OK) {
        Serial.println("[GatewayNode] Dewasa node added as peer.");
    } else {
        Serial.println("[GatewayNode] Warning: Failed to add Dewasa peer.");
    }
    
    memset(&receivedPenyemaianData, 0, sizeof(SensorData));
    strncpy(receivedPenyemaianData.nodeName, "penyemaian", sizeof(receivedPenyemaianData.nodeName) -1);
    receivedPenyemaianData.temperatureValid = false;
    
    memset(&receivedDewasaData, 0, sizeof(SensorData));
    strncpy(receivedDewasaData.nodeName, "dewasa", sizeof(receivedDewasaData.nodeName) -1);
    receivedDewasaData.temperatureValid = false;

    Serial.println("[GatewayNode] Setup Complete. Waiting for data...");
}

void forwardDataToRemajaMaster() {
    StaticJsonDocument<768 + 128> doc; // Increased size for latencies
    unsigned long currentTime = millis();

    JsonObject penyemaianJson = doc.createNestedObject("penyemaian");
    bool isPenyemaianFresh = (currentTime - lastPenyemaianReceiveTime) < PENYEMAIAN_ESP_NOW_TIMEOUT;
    penyemaianJson["isValid"] = isPenyemaianFresh && receivedPenyemaianData.temperatureValid; 
    
    if (isPenyemaianFresh) {
        penyemaianJson["nodeName"] = receivedPenyemaianData.nodeName;
        penyemaianJson["temp"] = receivedPenyemaianData.temperatureValid ? receivedPenyemaianData.temperature : JsonVariant();
        penyemaianJson["hum"] = receivedPenyemaianData.humidityValid ? receivedPenyemaianData.humidity : JsonVariant();
        penyemaianJson["light"] = receivedPenyemaianData.lightValid ? receivedPenyemaianData.lightIntensity : JsonVariant();
        penyemaianJson["tempValid"] = receivedPenyemaianData.temperatureValid;
        penyemaianJson["humValid"] = receivedPenyemaianData.humidityValid;
        penyemaianJson["lightValid"] = receivedPenyemaianData.lightValid;
        penyemaianJson["timestamp_node"] = receivedPenyemaianData.timestamp;
        penyemaianJson["espnow_latency_ms"] = simulatedPenyemaianLatencyMs; // Add simulated latency
    } else { 
        penyemaianJson["nodeName"] = "penyemaian";
        penyemaianJson["temp"] = JsonVariant();
        penyemaianJson["hum"] = JsonVariant();
        penyemaianJson["light"] = JsonVariant();
        penyemaianJson["tempValid"] = false;
        penyemaianJson["humValid"] = false;
        penyemaianJson["lightValid"] = false;
        penyemaianJson["timestamp_node"] = 0;
        penyemaianJson["espnow_latency_ms"] = -1; // Indicate no valid latency
    }

    JsonObject dewasaJson = doc.createNestedObject("dewasa");
    bool isDewasaFresh = (currentTime - lastDewasaReceiveTime) < DEWASA_ESP_NOW_TIMEOUT;
    dewasaJson["isValid"] = isDewasaFresh && receivedDewasaData.temperatureValid; 

    if (isDewasaFresh) {
        dewasaJson["nodeName"] = receivedDewasaData.nodeName;
        dewasaJson["temp"] = receivedDewasaData.temperatureValid ? receivedDewasaData.temperature : JsonVariant();
        dewasaJson["hum"] = receivedDewasaData.humidityValid ? receivedDewasaData.humidity : JsonVariant();
        dewasaJson["light"] = receivedDewasaData.lightValid ? receivedDewasaData.lightIntensity : JsonVariant();
        dewasaJson["tempValid"] = receivedDewasaData.temperatureValid;
        dewasaJson["humValid"] = receivedDewasaData.humidityValid;
        dewasaJson["lightValid"] = receivedDewasaData.lightValid;
        dewasaJson["timestamp_node"] = receivedDewasaData.timestamp;
        dewasaJson["espnow_latency_ms"] = simulatedDewasaLatencyMs; // Add simulated latency
    } else { 
        dewasaJson["nodeName"] = "dewasa";
        dewasaJson["temp"] = JsonVariant();
        dewasaJson["hum"] = JsonVariant();
        dewasaJson["light"] = JsonVariant();
        dewasaJson["tempValid"] = false;
        dewasaJson["humValid"] = false;
        dewasaJson["lightValid"] = false;
        dewasaJson["timestamp_node"] = 0;
        dewasaJson["espnow_latency_ms"] = -1; // Indicate no valid latency
    }
    
    doc["timestamp_gateway_ms"] = currentTime;

    String outputJson;
    serializeJson(doc, outputJson);

    SERIAL_TO_REMAJA_MASTER.println(outputJson);
    #if DEBUG_GATEWAY
    Serial.println("[GatewayNode] Forwarded JSON via Serial to Remaja Master:");
    Serial.println(outputJson);
    #endif

    newPenyemaianDataFlag = false;
    newDewasaDataFlag = false;
    // Reset simulated latencies after sending
    simulatedPenyemaianLatencyMs = -1;
    simulatedDewasaLatencyMs = -1;
}

void loop() {
    unsigned long currentTime = millis();

    if (newPenyemaianDataFlag || newDewasaDataFlag || (currentTime - lastSerialForwardTime >= SERIAL_FORWARD_INTERVAL)) {
        #if DEBUG_GATEWAY
        if (newPenyemaianDataFlag) Serial.println("[GatewayNode] Processing new Penyemaian data for forwarding.");
        if (newDewasaDataFlag) Serial.println("[GatewayNode] Processing new Dewasa data for forwarding.");
        if (!newPenyemaianDataFlag && !newDewasaDataFlag) Serial.println("[GatewayNode] Serial forward interval reached.");
        #endif
        
        forwardDataToRemajaMaster();
        lastSerialForwardTime = currentTime;
    }
    yield();
}
