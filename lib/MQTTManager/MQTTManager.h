#ifndef MQTT_MANAGER_H
#define MQTT_MANAGER_H

#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include "../ESPNowManager/ESPNowManager.h"

class MQTTManager {
public:
    MQTTManager(const char* ssid, const char* password, const char* mqttServer, 
                int mqttPort, const char* mqttTopic);
    bool begin();
    bool connect();
    bool publish(const String& payload);
    bool isConnected();
    void loop();
    void generateJsonPayload(String& output, float dewasaTemp, float dewasaHumidity, float dewasaLight,
                          bool dewasaTempValid, bool dewasaHumidityValid, bool dewasaLightValid,
                          const SensorData& penyemaianData, bool penyemaianValid,
                          const SensorData& peremajaanData, bool peremajaanValid);

private:
    const char* _ssid;
    const char* _password;
    const char* _mqttServer;
    const char* _mqttTopic;
    int _mqttPort;
    WiFiClient _wifiClient;
    PubSubClient _mqttClient;
    unsigned long _lastReconnectAttempt;
    const unsigned long RECONNECT_INTERVAL = 5000; // Reconnect every 5 seconds
    
    bool connectWiFi();
    String determineTrend(float current, float previous);
};

#endif // MQTT_MANAGER_H