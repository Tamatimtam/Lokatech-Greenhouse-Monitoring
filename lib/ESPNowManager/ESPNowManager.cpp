#include "ESPNowManager.h"

// Initialize static members
ESPNowDataCallback ESPNowManager::_dataCallback = nullptr;
SensorData ESPNowManager::_penyemaianData;
SensorData ESPNowManager::_peremajaanData;
unsigned long ESPNowManager::_lastPenyemaianUpdate = 0;
unsigned long ESPNowManager::_lastPeremajaanUpdate = 0;

ESPNowManager::ESPNowManager() {
    // Initialize data structs
    memset(&_penyemaianData, 0, sizeof(SensorData));
    memset(&_peremajaanData, 0, sizeof(SensorData));
    
    // Set node names
    strncpy(_penyemaianData.nodeName, "penyemaian", sizeof(_penyemaianData.nodeName));
    strncpy(_peremajaanData.nodeName, "peremajaan", sizeof(_peremajaanData.nodeName));
}

bool ESPNowManager::begin() {
    // Set device as both AP and STA to communicate with other ESP-NOW devices
    WiFi.mode(WIFI_MODE_STA);
    
    // Initialize ESP-NOW
    if (esp_now_init() != ESP_OK) {
        Serial.println("[ESPNowManager] ERROR: Failed to initialize ESP-NOW");
        return false;
    }
    
    // Register callback for receiving data
    esp_now_register_recv_cb(onDataReceived);
    
    Serial.println("[ESPNowManager] ESP-NOW initialized successfully");
    Serial.print("[ESPNowManager] MAC Address: ");
    Serial.println(WiFi.macAddress());
    
    return true;
}

void ESPNowManager::registerDataCallback(ESPNowDataCallback callback) {
    _dataCallback = callback;
}

bool ESPNowManager::addPeer(const uint8_t* mac) {
    // Prepare peer info
    esp_now_peer_info_t peerInfo = {};
    memcpy(peerInfo.peer_addr, mac, 6);
    peerInfo.channel = 6;  // Use channel 6 explicitly
    peerInfo.encrypt = false;
    
    // Add peer
    if (esp_now_add_peer(&peerInfo) != ESP_OK) {
        Serial.println("[ESPNowManager] ERROR: Failed to add peer");
        Serial.print("[ESPNowManager] MAC: ");
        for (int i = 0; i < 6; i++) {
            Serial.print(mac[i], HEX);
            if (i < 5) Serial.print(":");
        }
        Serial.println();
        return false;
    }
    
    Serial.print("[ESPNowManager] Peer added successfully. MAC: ");
    for (int i = 0; i < 6; i++) {
        Serial.print(mac[i], HEX);
        if (i < 5) Serial.print(":");
    }
    Serial.println();
    
    return true;
}

bool ESPNowManager::sendData(const uint8_t* mac, const SensorData& data) {
    // Send message via ESP-NOW
    esp_err_t result = esp_now_send(mac, (uint8_t*)&data, sizeof(SensorData));
    
    if (result != ESP_OK) {
        Serial.println("[ESPNowManager] ERROR: Failed to send data via ESP-NOW");
        return false;
    }
    
    Serial.println("[ESPNowManager] Data sent successfully via ESP-NOW");
    return true;
}

void ESPNowManager::onDataReceived(const uint8_t* mac, const uint8_t* data, int len) {
    Serial.print("[ESPNowManager] Received ");
    Serial.print(len);
    Serial.print(" bytes. Expected: ");
    Serial.println(sizeof(SensorData));

    // Print raw data bytes (first few for brevity)
    Serial.print("[ESPNowManager] Raw data (hex): ");
    int bytesToPrint = min(len, 16); // Print up to 16 bytes
    for (int i = 0; i < bytesToPrint; i++) {
        if (data[i] < 0x10) Serial.print("0"); // Pad with zero if needed
        Serial.print(data[i], HEX);
        Serial.print(" ");
    }
    if (len > bytesToPrint) Serial.print("...");
    Serial.println();

    // Check if data size matches our struct
    if (len != sizeof(SensorData)) {
        Serial.println("[ESPNowManager] ERROR: Received data size doesn't match expected size. Aborting processing.");
        return;
    }
    
    // Copy the data
    SensorData receivedData;
    memcpy(&receivedData, data, sizeof(SensorData));
    // receivedData.timestamp = millis(); // Let's keep the original timestamp for now for debugging
    
    // Print the source MAC address with markers
    Serial.print("[ESPNowManager] Start MAC >>> ");
    for (int i = 0; i < 6; i++) {
        Serial.print(mac[i], HEX);
        if (i < 5) Serial.print(":");
    }
    Serial.println(" <<< End MAC");
    
    // Print received data (using the copied struct)
    Serial.print("[ESPNowManager] Node name: ");
    Serial.println(receivedData.nodeName);
    
    if (receivedData.temperatureValid) {
        Serial.print("[ESPNowManager] Temperature: ");
        Serial.println(receivedData.temperature);
    } else {
        Serial.println("[ESPNowManager] Temperature: Invalid");
    }
    
    if (receivedData.humidityValid) {
        Serial.print("[ESPNowManager] Humidity: ");
        Serial.println(receivedData.humidity);
    } else {
        Serial.println("[ESPNowManager] Humidity: Invalid");
    }
    
    if (receivedData.lightValid) {
        Serial.print("[ESPNowManager] Light: ");
        Serial.println(receivedData.lightIntensity);
    } else {
        Serial.println("[ESPNowManager] Light: Invalid");
    }
    
    // If callback is registered, call it
    if (_dataCallback) {
        _dataCallback(receivedData);
    }
    
    // Store the data in the appropriate static variable based on node name
    if (strcmp(receivedData.nodeName, "penyemaian") == 0) {
        memcpy(&_penyemaianData, &receivedData, sizeof(SensorData));
        _lastPenyemaianUpdate = millis();
    } else if (strcmp(receivedData.nodeName, "peremajaan") == 0) {
        memcpy(&_peremajaanData, &receivedData, sizeof(SensorData));
        _lastPeremajaanUpdate = millis();
    }
}

const SensorData& ESPNowManager::getPenyemaianData() const {
    return _penyemaianData;
}

const SensorData& ESPNowManager::getPeremajaanData() const {
    return _peremajaanData;
}

bool ESPNowManager::isPenyemaianDataValid() const {
    // Check if data is fresh (not older than DATA_TIMEOUT)
    return (millis() - _lastPenyemaianUpdate) < DATA_TIMEOUT;
}

bool ESPNowManager::isPeremajaanDataValid() const {
    // Check if data is fresh (not older than DATA_TIMEOUT)
    return (millis() - _lastPeremajaanUpdate) < DATA_TIMEOUT;
}

unsigned long ESPNowManager::getLastPenyemaianUpdateTime() const {
    return _lastPenyemaianUpdate;
}

unsigned long ESPNowManager::getLastPeremajaanUpdateTime() const {
    return _lastPeremajaanUpdate;
}
