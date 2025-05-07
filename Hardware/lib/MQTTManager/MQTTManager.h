#ifndef MQTT_MANAGER_H
#define MQTT_MANAGER_H

#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>  // Add secure client
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include "../ESPNowManager/ESPNowManager.h"

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
    PubSubClient& getClient(); // Add getter for the client instance
    void setCallback(MQTT_CALLBACK_SIGNATURE); // Add method to set callback
    // Updated declaration to include actuator state and mode
    void generateJsonPayload(String& output, float dewasaTemp, float dewasaHumidity, float dewasaLight,
                          bool dewasaTempValid, bool dewasaHumidityValid, bool dewasaLightValid,
                          const SensorData& penyemaianData, bool penyemaianValid,
                          const SensorData& peremajaanData, bool peremajaanValid,
                          // Added parameters
                          bool fanState, const char* fanMode, 
                          bool lightState, const char* lightMode);

private:
    const char* _ssid;
    const char* _password;
    const char* _mqttServer;
    const char* _mqttPublishTopic;
    const char* _mqttControlTopic;
    const char* _mqttUser;         // Added for MQTT authentication
    const char* _mqttPassword;     // Added for MQTT authentication
    int _mqttPort;
    WiFiClientSecure _wifiClientSecure;  // Changed to secure client
    PubSubClient _mqttClient;
    unsigned long _lastReconnectAttempt;
    const unsigned long RECONNECT_INTERVAL = 5000; // Reconnect every 5 seconds
    std::function<void(char*, uint8_t*, unsigned int)> _callback;  // Store callback as std::function
    
    bool connectWiFi();
    String determineTrend(float current, float previous);
};

#endif // MQTT_MANAGER_H
