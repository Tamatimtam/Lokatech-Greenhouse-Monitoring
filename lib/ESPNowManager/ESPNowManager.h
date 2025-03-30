#ifndef ESPNOW_MANAGER_H
#define ESPNOW_MANAGER_H

#include <Arduino.h>
#include <esp_now.h>
#include <WiFi.h>

// Define the data structure for receiving sensor readings
struct SensorData {
    char nodeName[16]; // Name of the node (penyemaian, peremajaan)
    float temperature;
    float humidity;
    float lightIntensity;
    bool temperatureValid;
    bool humidityValid;
    bool lightValid;
    unsigned long timestamp;
};

typedef void (*ESPNowDataCallback)(const SensorData&);

class ESPNowManager {
public:
    ESPNowManager();
    bool begin();
    void registerDataCallback(ESPNowDataCallback callback);
    bool addPeer(const uint8_t* mac);
    bool sendData(const uint8_t* mac, const SensorData& data);
    static void onDataReceived(const uint8_t* mac, const uint8_t* data, int len);
    const SensorData& getPenyemaianData() const;
    const SensorData& getPeremajaanData() const;
    bool isPenyemaianDataValid() const;
    bool isPeremajaanDataValid() const;
    unsigned long getLastPenyemaianUpdateTime() const;
    unsigned long getLastPeremajaanUpdateTime() const;
    
private:
    static ESPNowDataCallback _dataCallback;
    // Make these static so they can be accessed from the static callback
    static SensorData _penyemaianData;
    static SensorData _peremajaanData;
    static unsigned long _lastPenyemaianUpdate;
    static unsigned long _lastPeremajaanUpdate;
    const unsigned long DATA_TIMEOUT = 60000; // Data considered stale after 60 seconds
};

#endif // ESPNOW_MANAGER_H