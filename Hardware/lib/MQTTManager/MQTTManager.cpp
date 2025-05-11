#include "MQTTManager.h"

MQTTManager::MQTTManager(const char* ssid, const char* password, const char* mqttServer, 
                         int mqttPort, const char* mqttPublishTopic, const char* mqttControlTopic,
                         const char* mqttUser, const char* mqttPassword)
    : _ssid(ssid), _password(password), _mqttServer(mqttServer), 
      _mqttPublishTopic(mqttPublishTopic), _mqttControlTopic(mqttControlTopic), 
      _mqttUser(mqttUser), _mqttPassword(mqttPassword), 
      _mqttPort(mqttPort), _mqttClient(_wifiClientSecure),
      _lastReconnectAttempt(0), _callback(nullptr) {
}

bool MQTTManager::begin() {
    if (!connectWiFi()) {
        return false;
    }
    _wifiClientSecure.setInsecure(); // For HiveMQ Cloud, typically no specific root CA needed for ESP32
    _mqttClient.setServer(_mqttServer, _mqttPort);
    _mqttClient.setBufferSize(1024); // Increased buffer for larger JSON
    _lastReconnectAttempt = 0;
    return connect();
}

bool MQTTManager::connectWiFi() {
    #if DEBUG_MQTT_MANAGER
    Serial.println("[MQTTManager] Connecting to WiFi...");
    #endif
    WiFi.disconnect(); // Ensure clean state
    delay(100);
    WiFi.begin(_ssid, _password);
    // Don't wait here, loop() will handle connection status
    return true;
}

bool MQTTManager::connect() {
    if (WiFi.status() != WL_CONNECTED) {
        return false;
    }

    if (!_mqttClient.connected()) {
        #if DEBUG_MQTT_MANAGER
        Serial.println("[MQTTManager] Attempting MQTT connection...");
        #endif
        
        if (_callback) {
            _mqttClient.setCallback(_callback);
        } else {
            Serial.println("[MQTTManager] WARNING: MQTT callback not set.");
        }
        
        String clientId = "ESP32RemajaMaster-"; // Updated Client ID
        clientId += String(WiFi.macAddress());
        clientId.replace(":", ""); // Remove colons from MAC for client ID
        clientId += "-";
        clientId += String(millis() % 1000); 
        
        #if DEBUG_MQTT_MANAGER
        Serial.print("[MQTTManager] Client ID: "); Serial.println(clientId);
        #endif
        
        bool connectedStatus = false;
        if (_mqttUser && strlen(_mqttUser) > 0) {
            #if DEBUG_MQTT_MANAGER
            Serial.println("[MQTTManager] Connecting with MQTT username/password.");
            #endif
            connectedStatus = _mqttClient.connect(clientId.c_str(), _mqttUser, _mqttPassword);
        } else {
            #if DEBUG_MQTT_MANAGER
            Serial.println("[MQTTManager] Connecting without MQTT username/password.");
            #endif
            connectedStatus = _mqttClient.connect(clientId.c_str());
        }
        
        if (connectedStatus) {
            #if DEBUG_MQTT_MANAGER
            Serial.println("[MQTTManager] MQTT connected successfully.");
            #endif
            // Subscribe to the control topic
            if (_mqttClient.subscribe(_mqttControlTopic, 1)) { // QoS 1
                #if DEBUG_MQTT_MANAGER
                Serial.printf("[MQTTManager] Subscribed to control topic: %s\n", _mqttControlTopic);
                #endif
            } else {
                Serial.printf("[MQTTManager] ERROR: Failed to subscribe to control topic %s. State: %d\n", _mqttControlTopic, _mqttClient.state());
            }
            return true;
        } else {
            Serial.print("[MQTTManager] ERROR: MQTT connection failed, rc=");
            Serial.print(_mqttClient.state()); Serial.println();
            // Detailed error printing can be added here based on _mqttClient.state()
            return false;
        }
    }
    return true; 
}

bool MQTTManager::publish(const String& payload) {
    if (WiFi.status() != WL_CONNECTED || !_mqttClient.connected()) {
        #if DEBUG_MQTT_MANAGER
        if(WiFi.status() != WL_CONNECTED) Serial.println("[MQTTManager] WiFi not connected, cannot publish.");
        if(!_mqttClient.connected()) Serial.println("[MQTTManager] MQTT not connected, cannot publish.");
        #endif
        // Attempt to reconnect if necessary, or rely on loop() to do it
        // connect(); // Optionally try immediate reconnect
        return false;
    }
    
    #if DEBUG_MQTT_MANAGER
    Serial.println("[MQTTManager] Publishing to MQTT:");
    Serial.println(payload);
    Serial.print("[MQTTManager] Topic: "); Serial.println(_mqttPublishTopic);
    #endif
    
    bool result = _mqttClient.publish(_mqttPublishTopic, payload.c_str(), false); // Retain = false
    
    #if DEBUG_MQTT_MANAGER
    if (!result) {
        Serial.print("[MQTTManager] ERROR: MQTT publish failed. State: "); Serial.println(_mqttClient.state());
    } else {
        Serial.println("[MQTTManager] MQTT publish successful.");
    }
    #endif
    return result;
}

bool MQTTManager::isConnected() {
    return _mqttClient.connected() && (WiFi.status() == WL_CONNECTED);
}

PubSubClient& MQTTManager::getClient() {
    return _mqttClient;
}

void MQTTManager::setCallback(MQTT_CALLBACK_SIGNATURE) {
    _callback = callback;
    if (_mqttClient.connected()) { // If already connected, set it immediately
        _mqttClient.setCallback(_callback);
    }
}

void MQTTManager::loop() {
    if (WiFi.status() != WL_CONNECTED) {
        unsigned long now = millis();
        if (now - _lastReconnectAttempt > RECONNECT_INTERVAL) { 
            _lastReconnectAttempt = now; 
            #if DEBUG_MQTT_MANAGER
            Serial.println("[MQTTManager] WiFi disconnected. Attempting WiFi reconnection...");
            #endif
            connectWiFi(); 
        }
    } else { // WiFi is connected
        if (!_mqttClient.connected()) {
             unsigned long now = millis();
             if (now - _lastReconnectAttempt > RECONNECT_INTERVAL) {
                 _lastReconnectAttempt = now; 
                 #if DEBUG_MQTT_MANAGER
                 Serial.println("[MQTTManager] MQTT disconnected. Attempting MQTT reconnection...");
                 #endif
                 connect(); // Attempt to reconnect MQTT
             }
        } else { // WiFi and MQTT are connected
            _mqttClient.loop(); // Process MQTT messages
        }
    }
}

// Modified generateJsonPayload
void MQTTManager::generateJsonPayload(String& output, 
                                   float remajaTemp, float remajaHumidity, float remajaLight,
                                   bool remajaTempValid, bool remajaHumidityValid, bool remajaLightValid,
                                   const SensorData& penyemaianData, bool penyemaianOverallValid,
                                   const SensorData& dewasaData, bool dewasaOverallValid,
                                   bool remajaFanState, const char* remajaFanMode, 
                                   bool remajaLightState, const char* remajaLightMode) {
    StaticJsonDocument<1024> doc; 
    
    doc["timestamp"] = millis() / 1000; // Or use NTP time if available
    
    JsonObject sections = doc.createNestedObject("sections");
    
    // Remaja (Local) Section
    JsonObject remaja = sections.createNestedObject("remaja");
    remaja["temp"] = remajaTempValid ? remajaTemp : JsonVariant();
    remaja["humidity"] = remajaHumidityValid ? remajaHumidity : JsonVariant();
    remaja["light"] = remajaLightValid ? remajaLight : JsonVariant();
    // Trends for remaja can be calculated if previous values are stored, or set to "equals"
    JsonObject remajaTrends = remaja.createNestedObject("trends");
    remajaTrends["temp"] = "equals"; 
    remajaTrends["humidity"] = "equals";
    remajaTrends["light"] = "equals";
    
    // Penyemaian Section (from Gateway)
    JsonObject penyemaian = sections.createNestedObject("penyemaian");
    if (penyemaianOverallValid) {
        penyemaian["temp"] = penyemaianData.temperatureValid ? penyemaianData.temperature : JsonVariant();
        penyemaian["humidity"] = penyemaianData.humidityValid ? penyemaianData.humidity : JsonVariant();
        penyemaian["light"] = penyemaianData.lightValid ? penyemaianData.lightIntensity : JsonVariant();
    } else {
        penyemaian["temp"] = JsonVariant();
        penyemaian["humidity"] = JsonVariant();
        penyemaian["light"] = JsonVariant();
    }
    JsonObject penyemaianTrends = penyemaian.createNestedObject("trends"); // Placeholder trends
    penyemaianTrends["temp"] = "equals";
    penyemaianTrends["humidity"] = "equals";
    penyemaianTrends["light"] = "equals";

    // Dewasa Section (from Gateway)
    JsonObject dewasa = sections.createNestedObject("dewasa");
    if (dewasaOverallValid) {
        dewasa["temp"] = dewasaData.temperatureValid ? dewasaData.temperature : JsonVariant();
        dewasa["humidity"] = dewasaData.humidityValid ? dewasaData.humidity : JsonVariant();
        dewasa["light"] = dewasaData.lightValid ? dewasaData.lightIntensity : JsonVariant();
    } else {
        dewasa["temp"] = JsonVariant();
        dewasa["humidity"] = JsonVariant();
        dewasa["light"] = JsonVariant();
    }
    JsonObject dewasaTrends = dewasa.createNestedObject("trends"); // Placeholder trends
    dewasaTrends["temp"] = "equals";
    dewasaTrends["humidity"] = "equals";
    dewasaTrends["light"] = "equals";
    
    // Calculate Averages
    JsonObject averages = doc.createNestedObject("averages");
    float tempSum = 0; int tempCount = 0;
    float humiditySum = 0; int humidityCount = 0;
    float lightSum = 0; int lightCount = 0;

    if (remajaTempValid) { tempSum += remajaTemp; tempCount++; }
    if (remajaHumidityValid) { humiditySum += remajaHumidity; humidityCount++; }
    if (remajaLightValid) { lightSum += remajaLight; lightCount++; }

    if (penyemaianOverallValid && penyemaianData.temperatureValid) { tempSum += penyemaianData.temperature; tempCount++; }
    if (penyemaianOverallValid && penyemaianData.humidityValid) { humiditySum += penyemaianData.humidity; humidityCount++; }
    if (penyemaianOverallValid && penyemaianData.lightValid) { lightSum += penyemaianData.lightIntensity; lightCount++; }

    if (dewasaOverallValid && dewasaData.temperatureValid) { tempSum += dewasaData.temperature; tempCount++; }
    if (dewasaOverallValid && dewasaData.humidityValid) { humiditySum += dewasaData.humidity; humidityCount++; }
    if (dewasaOverallValid && dewasaData.lightValid) { lightSum += dewasaData.lightIntensity; lightCount++; }
    
    averages["temp"] = (tempCount > 0) ? round(tempSum / tempCount * 10.0) / 10.0 : JsonVariant();
    averages["humidity"] = (humidityCount > 0) ? round(humiditySum / humidityCount) : JsonVariant();
    averages["light"] = (lightCount > 0) ? round(lightSum / lightCount) : JsonVariant();

    // Actuators (for Remaja node)
    JsonObject actuators = doc.createNestedObject("actuators");
    JsonObject fan = actuators.createNestedObject("fan"); // Assuming fan is for Remaja
    fan["state"] = remajaFanState;
    fan["mode"] = remajaFanMode; 
    JsonObject lightActuator = actuators.createNestedObject("light"); // Assuming light is for Remaja
    lightActuator["state"] = remajaLightState;
    lightActuator["mode"] = remajaLightMode; 
    
    serializeJson(doc, output);
}
