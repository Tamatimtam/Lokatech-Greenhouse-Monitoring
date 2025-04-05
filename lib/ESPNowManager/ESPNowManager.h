#ifndef ESPNOW_MANAGER_H
#define ESPNOW_MANAGER_H

#include <Arduino.h>
#include <esp_now.h>
#include <WiFi.h>
#include "../Common/SensorData.h" // Include the common definitions (SensorData and CombinedData)

// Callback type can remain the same if we process internally, or change if needed
// Let's keep it internal for now.
// typedef void (*ESPNowDataCallback)(const CombinedData&); // Example if we wanted to pass CombinedData up

class ESPNowManager {
public:
    ESPNowManager();
    bool begin(const uint8_t* peremajaan_mac); // Need Peremajaan MAC to know who sends CombinedData
    // void registerDataCallback(ESPNowDataCallback callback); // Removing direct callback for now
    bool addPeer(const uint8_t* mac); // Keep for potential direct communication later? Or remove? Let's keep for now.
    // bool sendData(const uint8_t* mac, const SensorData& data); // Master doesn't send SensorData via ESP-NOW in this setup
    static void onDataReceived(const uint8_t* mac, const uint8_t* data, int len);

    // Methods to get processed data
    const SensorData& getPenyemaianData() const;
    const SensorData& getPeremajaanData() const;
    bool isPenyemaianDataValid() const; // Validity now determined by flag in CombinedData + timeout
    bool isPeremajaanDataValid() const; // Validity now determined by timeout of CombinedData reception
    unsigned long getLastPenyemaianUpdateTime() const; // Timestamp from Penyemaian's SensorData
    unsigned long getLastPeremajaanUpdateTime() const; // Timestamp from Peremajaan's SensorData

private:
    // static ESPNowDataCallback _dataCallback; // Removed for now
    // Store the MAC of the node expected to send CombinedData
    static uint8_t _peremajaanNodeMac[6];
    static bool _peremajaanMacSet;

    // Internal storage for the data extracted from CombinedData
    static SensorData _penyemaianData;
    static SensorData _peremajaanData;

    // Timestamps related to the *reception* of data by the master
    static unsigned long _lastCombinedDataReceiveTime; // When did we last get a packet from Peremajaan?
    static bool _lastPenyemaianValidityFlag; // Store the validity flag from the last received CombinedData

    // Timeout for considering the entire Peremajaan node offline (no CombinedData received)
    // Let's use a slightly longer timeout than Peremajaan uses for Penyemaian
    const unsigned long COMBINED_DATA_TIMEOUT = 75000UL; // e.g., 75 seconds
};

#endif // ESPNOW_MANAGER_H
