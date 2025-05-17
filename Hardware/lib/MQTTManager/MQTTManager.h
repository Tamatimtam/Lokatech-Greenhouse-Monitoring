#ifndef MQTT_MANAGER_H
#define MQTT_MANAGER_H

#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include "../Common/SensorData.h" // Changed path to Common

// Define callback signature if it's not defined by PubSubClient
#ifndef MQTT_CALLBACK_SIGNATURE
#define MQTT_CALLBACK_SIGNATURE std::function<void(char*, uint8_t*, unsigned int)> callback
#endif

class MQTTManager {
public:
    MQTTManager(const char* ssid, const char* password, const char* mqttServer, 
                int mqttPort, const char* mqttPublishTopic, const char* mqttControlTopic = nullptr,
                const char* mqttUser = nullptr, const char* mqttPassword = nullptr);
    bool begin();
    bool connect();
    bool publish(const String& payload);
    bool isConnected();
    void loop();
    PubSubClient& getClient(); 
    void setCallback(MQTT_CALLBACK_SIGNATURE); 
    
    // Updated declaration to include NTP timestamp and ESP-NOW latencies
    void generateJsonPayload(String& output, 
                          const String& ntpTimestampStr, // NTP timestamp string
                          float remajaTemp, float remajaHumidity, float remajaLight,
                          bool remajaTempValid, bool remajaHumidityValid, bool remajaLightValid,
                          const SensorData& penyemaianData, bool penyemaianOverallValid, int penyemaianEspNowLatencyMs,
                          const SensorData& dewasaData, bool dewasaOverallValid, int dewasaEspNowLatencyMs,
                          bool remajaFanState, const char* remajaFanMode, 
                          bool remajaLightState, const char* remajaLightMode);

private:
    const char* _ssid;
    const char* _password;
    const char* _mqttServer;
    const char* _mqttPublishTopic;
    const char* _mqttControlTopic;
    const char* _mqttUser;         
    const char* _mqttPassword;     
    int _mqttPort;
    WiFiClientSecure _wifiClientSecure;  
    PubSubClient _mqttClient;
    unsigned long _lastReconnectAttempt;
    const unsigned long RECONNECT_INTERVAL = 5000; 
    std::function<void(char*, uint8_t*, unsigned int)> _callback;  
    
    bool connectWiFi();
    // String determineTrend(float current, float previous); // Removed, trends are simplified
};

#endif // MQTT_MANAGER_H
