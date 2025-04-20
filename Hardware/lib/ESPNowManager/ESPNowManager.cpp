#include "ESPNowManager.h"
#include "../Common/SensorData.h" // Ensure CombinedData is included
#include "../Common/NodeConfig.h" // Include common configuration

// Initialize static members
// ESPNowDataCallback ESPNowManager::_dataCallback = nullptr; // Removed
SensorData ESPNowManager::_penyemaianData;
SensorData ESPNowManager::_peremajaanData;
// unsigned long ESPNowManager::_lastPenyemaianUpdate = 0; // Replaced by _lastCombinedDataReceiveTime and flag
// unsigned long ESPNowManager::_lastPeremajaanUpdate = 0; // Replaced by _lastCombinedDataReceiveTime
unsigned long ESPNowManager::_lastCombinedDataReceiveTime = 0;
bool ESPNowManager::_lastPenyemaianValidityFlag = false;
uint8_t ESPNowManager::_peremajaanNodeMac[6];
bool ESPNowManager::_peremajaanMacSet = false;


ESPNowManager::ESPNowManager() {
    // Initialize data structs with default invalid state
    memset(&_penyemaianData, 0, sizeof(SensorData));
    memset(&_peremajaanData, 0, sizeof(SensorData));
    strncpy(_penyemaianData.nodeName, "penyemaian", sizeof(_penyemaianData.nodeName) - 1);
    _penyemaianData.nodeName[sizeof(_penyemaianData.nodeName) - 1] = '\0';
    strncpy(_peremajaanData.nodeName, "peremajaan", sizeof(_peremajaanData.nodeName) - 1);
     _peremajaanData.nodeName[sizeof(_peremajaanData.nodeName) - 1] = '\0';
    _penyemaianData.temperatureValid = false;
    _penyemaianData.humidityValid = false;
    _penyemaianData.lightValid = false;
    _peremajaanData.temperatureValid = false;
    _peremajaanData.humidityValid = false;
    _peremajaanData.lightValid = false;
}

// Updated begin method
bool ESPNowManager::begin(const uint8_t* peremajaan_mac) {
    if (peremajaan_mac == nullptr) {
        Serial.println("[ESPNowManager] ERROR: Peremajaan MAC address cannot be null.");
        return false;
    }
    memcpy(_peremajaanNodeMac, peremajaan_mac, 6);
    _peremajaanMacSet = true;
    Serial.print("[ESPNowManager] Set expected Peremajaan MAC: ");
    for(int i=0; i<6; i++) { Serial.print(_peremajaanNodeMac[i], HEX); if(i<5) Serial.print(":"); }
    Serial.println();


    // Set device as STA mode (Master connects to WiFi/MQTT)
    // WiFi.mode(WIFI_MODE_STA); // This should be handled by MQTTManager or main sketch

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

// void ESPNowManager::registerDataCallback(ESPNowDataCallback callback) { // Removed
//     _dataCallback = callback;
// }

// Keep addPeer for now, might be useful for direct commands later?
bool ESPNowManager::addPeer(const uint8_t* mac) {
    // Prepare peer info
    esp_now_peer_info_t peerInfo = {};
    memcpy(peerInfo.peer_addr, mac, 6);
    peerInfo.channel = WIFI_CHANNEL;  // Use channel from NodeConfig.h
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

// Master node doesn't send SensorData in this flow
// bool ESPNowManager::sendData(const uint8_t* mac, const SensorData& data) { ... }


// Updated static callback to handle CombinedData
void ESPNowManager::onDataReceived(const uint8_t* mac, const uint8_t* data, int len) {
    Serial.print("[ESPNowManager] Received ");
    Serial.print(len);
    Serial.print(" bytes. Expected: ");
    Serial.println(sizeof(CombinedData));

    // Check if the sender MAC matches the expected Peremajaan MAC
    if (!_peremajaanMacSet || mac == nullptr || memcmp(mac, _peremajaanNodeMac, 6) != 0) {
        Serial.print("[ESPNowManager] WARNING: Received data from unexpected MAC: ");
         if (mac != nullptr) {
            for (int i = 0; i < 6; i++) { Serial.print(mac[i], HEX); if (i < 5) Serial.print(":"); }
         } else {
            Serial.print("NULL");
         }
         Serial.println(". Ignoring.");
        return;
    }

    // Check if data size matches the CombinedData struct
    if (len != sizeof(CombinedData)) {
        Serial.println("[ESPNowManager] ERROR: Received data size doesn't match CombinedData size. Aborting processing.");
        return;
    }

    // Copy the data into a temporary CombinedData struct
    CombinedData receivedCombinedData;
    memcpy(&receivedCombinedData, data, sizeof(CombinedData));

    Serial.println("[ESPNowManager] Successfully received CombinedData from Peremajaan node.");

    // Update the internal static storage
    memcpy(&_peremajaanData, &receivedCombinedData.peremajaanData, sizeof(SensorData));
    memcpy(&_penyemaianData, &receivedCombinedData.penyemaianData, sizeof(SensorData));

    // Update the timestamp and validity flag
    _lastCombinedDataReceiveTime = millis(); // Record when we received the packet
    _lastPenyemaianValidityFlag = receivedCombinedData.isPenyemaianDataValid;

    // Optional: Print unpacked data for debugging
    Serial.println("  Unpacked Peremajaan Temp: " + String(_peremajaanData.temperature) + " (Valid: " + String(_peremajaanData.temperatureValid) + ")");
    Serial.println("  Unpacked Penyemaian Temp: " + String(_penyemaianData.temperature) + " (Valid: " + String(_penyemaianData.temperatureValid) + ")");
    Serial.println("  Penyemaian Validity Flag from Peremajaan: " + String(_lastPenyemaianValidityFlag));
    Serial.println("  Combined Packet Timestamp: " + String(receivedCombinedData.timestamp));

    // Callback logic removed for now, data is accessed via getter methods
    // if (_dataCallback) {
    //     _dataCallback(receivedCombinedData);
    // }
}


// Getters remain the same, returning the internally stored SensorData structs
const SensorData& ESPNowManager::getPenyemaianData() const {
    return _penyemaianData;
}

const SensorData& ESPNowManager::getPeremajaanData() const {
    return _peremajaanData;
}

// Updated validity checks
bool ESPNowManager::isPenyemaianDataValid() const {
    // Penyemaian data is valid if the last combined packet received from Peremajaan
    // is recent AND that packet indicated Penyemaian data was valid at that time.
    bool combinedDataRecent = (millis() - _lastCombinedDataReceiveTime) < COMBINED_DATA_TIMEOUT;
    return combinedDataRecent && _lastPenyemaianValidityFlag;
}

bool ESPNowManager::isPeremajaanDataValid() const {
    // Peremajaan data is considered valid if we have received a combined packet
    // from it recently. The validity flags within _peremajaanData itself
    // reflect the sensor status on the Peremajaan node at the time it sent the data.
    return (millis() - _lastCombinedDataReceiveTime) < COMBINED_DATA_TIMEOUT;
}

// Getters for timestamps now return the timestamps from the SensorData structs
// which originated on the respective nodes (or were set by Peremajaan for its own data)
unsigned long ESPNowManager::getLastPenyemaianUpdateTime() const {
    // Return the timestamp embedded within the stored Penyemaian data
    return _penyemaianData.timestamp;
}

unsigned long ESPNowManager::getLastPeremajaanUpdateTime() const {
     // Return the timestamp embedded within the stored Peremajaan data
    return _peremajaanData.timestamp;
}
