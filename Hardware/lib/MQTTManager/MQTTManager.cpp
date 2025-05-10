#include "MQTTManager.h"

MQTTManager::MQTTManager(const char* ssid, const char* password, const char* mqttServer, 
                         int mqttPort, const char* mqttPublishTopic, const char* mqttControlTopic,
                         const char* mqttUser, const char* mqttPassword)
    : _ssid(ssid), _password(password), _mqttServer(mqttServer), 
      _mqttPublishTopic(mqttPublishTopic), _mqttControlTopic(mqttControlTopic), // Store both topics
      _mqttUser(mqttUser), _mqttPassword(mqttPassword), // Store MQTT credentials
      _mqttPort(mqttPort), _mqttClient(_wifiClientSecure),
      _lastReconnectAttempt(0), _callback(nullptr) {
}

bool MQTTManager::begin() {
    // Connect to WiFi
    if (!connectWiFi()) {
        return false;
    }
    
    // Skip SSL certificate validation (less secure, but works for testing)
    _wifiClientSecure.setInsecure();
    
    // Configure MQTT server
    _mqttClient.setServer(_mqttServer, _mqttPort);
    
    // Set larger buffer size for MQTT messages (default is 256 bytes)
    _mqttClient.setBufferSize(1024);
    
    // Initialize reconnect timer
    _lastReconnectAttempt = 0;
    
    // Try to connect to MQTT broker
    return connect();
}

bool MQTTManager::connectWiFi() {
#if DEBUG_MQTT_MANAGER
    Serial.println("[MQTTManager] Connecting to WiFi...");
#endif
    
    // Disconnect from any previous connection
    WiFi.disconnect();
    delay(100);
    
    // Begin connection with SSID and password
    WiFi.begin(_ssid, _password);
    
    // Initiate connection and return immediately
#if DEBUG_MQTT_MANAGER
    Serial.println("[MQTTManager] WiFi connection attempt initiated.");
#endif
    // We don't wait here, the loop() function will check status and retry

    // Return true for now, loop() will handle actual connection status
    return true;
}

bool MQTTManager::connect() {
    if (WiFi.status() != WL_CONNECTED) {
        // #if DEBUG_MQTT_MANAGER // This might be too frequent if WiFi is down
        // Serial.println("[MQTTManager] WiFi not connected, cannot connect to MQTT.");
        // #endif
        return false;
    }

    if (!_mqttClient.connected()) {
#if DEBUG_MQTT_MANAGER
        Serial.println("[MQTTManager] Connecting to MQTT broker...");
        Serial.print("[MQTTManager] Server: "); Serial.print(_mqttServer);
        Serial.print(" Port: "); Serial.println(_mqttPort);
#endif
        
        if (_callback) {
            _mqttClient.setCallback(_callback);
#if DEBUG_MQTT_MANAGER
            Serial.println("[MQTTManager] Callback set");
#endif
        } else {
            // Important warning, always print
            Serial.println("[MQTTManager] WARNING: MQTT callback not set. No messages will be received.");
        }
        
        String clientId = "ESP32Dewasa-";
        clientId += String(WiFi.macAddress());
        clientId += "-";
        clientId += String(millis() % 1000); 
        
#if DEBUG_MQTT_MANAGER
        Serial.print("[MQTTManager] Client ID: "); Serial.println(clientId);
        if (_mqttUser && _mqttPassword) {
            Serial.println("[MQTTManager] Using MQTT authentication");
        } else {
            Serial.println("[MQTTManager] No MQTT credentials provided, connecting without authentication");
        }
#endif
        
        bool connected = false;
        if (_mqttUser && _mqttPassword) {
            connected = _mqttClient.connect(clientId.c_str(), _mqttUser, _mqttPassword);
        } else {
            connected = _mqttClient.connect(clientId.c_str());
        }
        
        if (connected) {
#if DEBUG_MQTT_MANAGER
            Serial.println("[MQTTManager] MQTT connected successfully");
#endif
            bool subscribeSuccess = _mqttClient.subscribe(_mqttControlTopic, 1); 
            if (subscribeSuccess) {
#if DEBUG_MQTT_MANAGER
                 Serial.printf("[MQTTManager] Subscribed to control topic: %s\n", _mqttControlTopic);
#endif
            } else {
                 // Critical error, always print
                 Serial.printf("[MQTTManager] ERROR: Failed to subscribe to control topic %s! PubSubClient state: %d\n", _mqttControlTopic, _mqttClient.state());
            }
            return true;
        } else {
            // Critical error, always print
            int state = _mqttClient.state();
            Serial.print("[MQTTManager] ERROR: MQTT connection failed, rc=");
            Serial.print(state); Serial.print(" (");
            switch(state) {
                case -4: Serial.println("MQTT_CONNECTION_TIMEOUT)"); break;
                case -3: Serial.println("MQTT_CONNECTION_LOST)"); break;
                case -2: Serial.println("MQTT_CONNECT_FAILED)"); break;
                case -1: Serial.println("MQTT_DISCONNECTED)"); break;
                case 1: Serial.println("MQTT_CONNECT_BAD_PROTOCOL)"); break;
                case 2: Serial.println("MQTT_CONNECT_BAD_CLIENT_ID)"); break;
                case 3: Serial.println("MQTT_CONNECT_UNAVAILABLE)"); break;
                case 4: Serial.println("MQTT_CONNECT_BAD_CREDENTIALS)"); break;
                case 5: Serial.println("MQTT_CONNECT_UNAUTHORIZED)"); break;
                default: Serial.println("Unknown error)"); break;
            }
            return false;
        }
    }
    return true; 
}

bool MQTTManager::publish(const String& payload) {
    if (WiFi.status() != WL_CONNECTED) {
        // #if DEBUG_MQTT_MANAGER // Potentially too verbose if WiFi is down
        // Serial.println("[MQTTManager] WiFi not connected, cannot publish MQTT message.");
        // #endif
        return false;
    }

    if (!_mqttClient.connected()) {
#if DEBUG_MQTT_MANAGER
        Serial.println("[MQTTManager] MQTT not connected, attempting to reconnect...");
#endif
        if (!connect()) {
            Serial.println("[MQTTManager] ERROR: Cannot publish. MQTT reconnect failed."); // Critical
            return false;
        }
    }
    
#if DEBUG_MQTT_MANAGER
    Serial.println("[MQTTManager] Publishing data to MQTT:");
    Serial.println(payload);
    Serial.print("[MQTTManager] Topic: "); Serial.println(_mqttPublishTopic);
    Serial.print("[MQTTManager] Payload size: "); Serial.println(payload.length());
#endif
    
    bool result = _mqttClient.publish(_mqttPublishTopic, payload.c_str(), false); 
    
#if DEBUG_MQTT_MANAGER
    if (result) {
        Serial.println("[MQTTManager] MQTT publish successful");
    } else {
        Serial.println("[MQTTManager] ERROR: MQTT publish failed"); // Also an error, but keep under debug for now
        Serial.print("[MQTTManager] MQTT state: "); Serial.println(_mqttClient.state());
    }
#endif
    return result;
}

bool MQTTManager::isConnected() {
    return _mqttClient.connected();
}

// Implementation for the new getter method
PubSubClient& MQTTManager::getClient() {
    return _mqttClient;
}

// Implementation for the new setCallback method
void MQTTManager::setCallback(MQTT_CALLBACK_SIGNATURE) {
    _callback = callback;
    // Note: The callback is actually set on the PubSubClient instance
    // within the connect() method after a successful connection.
}


void MQTTManager::loop() {
    if (WiFi.status() == WL_CONNECTED && _mqttClient.connected()) {
        _mqttClient.loop();
    }
    
    if (WiFi.status() != WL_CONNECTED) {
        unsigned long now = millis();
        if (now - _lastReconnectAttempt > RECONNECT_INTERVAL) { 
            _lastReconnectAttempt = now; 
#if DEBUG_MQTT_MANAGER
            Serial.println("[MQTTManager] WiFi disconnected. Attempting reconnection...");
#endif
            connectWiFi(); 
        }
    } else {
        if (!_mqttClient.connected()) {
             unsigned long now = millis();
             if (now - _lastReconnectAttempt > RECONNECT_INTERVAL) {
                 _lastReconnectAttempt = now; 
#if DEBUG_MQTT_MANAGER
                 Serial.println("[MQTTManager] MQTT disconnected. Attempting reconnection...");
#endif
                 if (connect()) {
#if DEBUG_MQTT_MANAGER
                     Serial.println("[MQTTManager] MQTT reconnection successful");
#endif
                 } else {
#if DEBUG_MQTT_MANAGER
                     Serial.println("[MQTTManager] MQTT reconnection failed");
#endif
                 }
             }
        }
    }
}

String MQTTManager::determineTrend(float current, float previous) {
    // Determine trend based on current and previous values
    // This is a placeholder - you might want to implement more sophisticated trend detection
    const float THRESHOLD = 0.5; // Threshold for considering a value changed
    
    if (abs(current - previous) < THRESHOLD) {
        return "equals";
    } else if (current > previous) {
        return "up";
    } else {
        return "down";
    }
}

void MQTTManager::generateJsonPayload(String& output, float dewasaTemp, float dewasaHumidity, float dewasaLight,
                                   bool dewasaTempValid, bool dewasaHumidityValid, bool dewasaLightValid,
                                   const SensorData& penyemaianData, bool penyemaianValid,
                                   const SensorData& peremajaanData, bool peremajaanValid,
                                   // Add parameters for actuator state and mode
                                   bool fanState, const char* fanMode, 
                                   bool lightState, const char* lightMode) {
    StaticJsonDocument<1024> doc; // Increased size slightly just in case, adjust if needed
    
    // Add timestamp (seconds since epoch)
    doc["timestamp"] = millis() / 1000;
    
    // Prepare sections object
    JsonObject sections = doc.createNestedObject("sections");
    
    // Add Dewasa (Master) section
    JsonObject dewasa = sections.createNestedObject("dewasa");
    if (dewasaTempValid) {
        dewasa["temp"] = dewasaTemp;
    } else {
        dewasa["temp"] = nullptr;
    }

    if (dewasaHumidityValid) {
        dewasa["humidity"] = dewasaHumidity;
    } else {
        dewasa["humidity"] = nullptr;
    }

    if (dewasaLightValid) {
        // Use raw lux values for light without converting to percentage
        dewasa["light"] = dewasaLight;
    } else {
        dewasa["light"] = nullptr;
    }
    
    // Add trends (using placeholder values since we don't have previous values here)
    JsonObject dewasaTrends = dewasa.createNestedObject("trends");
    dewasaTrends["temp"] = "equals";
    dewasaTrends["humidity"] = "equals";
    dewasaTrends["light"] = "equals";
    
    // Add Penyemaian section if data is valid
    if (penyemaianValid) {
        JsonObject penyemaian = sections.createNestedObject("penyemaian");
        if (penyemaianData.temperatureValid) {
            penyemaian["temp"] = penyemaianData.temperature;
        } else {
            penyemaian["temp"] = nullptr;
        }

        if (penyemaianData.humidityValid) {
            penyemaian["humidity"] = penyemaianData.humidity;
        } else {
            penyemaian["humidity"] = nullptr;
        }

        if (penyemaianData.lightValid) {
            // Use raw lux values for light
            penyemaian["light"] = penyemaianData.lightIntensity;
        } else {
            penyemaian["light"] = nullptr;
        }
        
        // Add trends (placeholder values)
        JsonObject penyemaianTrends = penyemaian.createNestedObject("trends");
        penyemaianTrends["temp"] = "equals";
        penyemaianTrends["humidity"] = "equals";
        penyemaianTrends["light"] = "equals";
    }
    
    // Add Peremajaan section if data is valid
    if (peremajaanValid) {
        JsonObject peremajaan = sections.createNestedObject("peremajaan");
        if (peremajaanData.temperatureValid) {
            peremajaan["temp"] = peremajaanData.temperature;
        } else {
            peremajaan["temp"] = nullptr;
        }

        if (peremajaanData.humidityValid) {
            peremajaan["humidity"] = peremajaanData.humidity;
        } else {
            peremajaan["humidity"] = nullptr;
        }

        if (peremajaanData.lightValid) {
            // Use raw lux values for light
            peremajaan["light"] = peremajaanData.lightIntensity;
        } else {
            peremajaan["light"] = nullptr;
        }
        
        // Add trends (placeholder values)
        JsonObject peremajaanTrends = peremajaan.createNestedObject("trends");
        peremajaanTrends["temp"] = "equals";
        peremajaanTrends["humidity"] = "equals";
        peremajaanTrends["light"] = "equals";
    }
    
    // Calculate averages from valid data
    JsonObject averages = doc.createNestedObject("averages");
    
    // Temperature average
    float tempSum = 0;
    int tempCount = 0;
    
    if (dewasaTempValid) {
        tempSum += dewasaTemp;
        tempCount++;
    }
    
    if (penyemaianValid && penyemaianData.temperatureValid) {
        tempSum += penyemaianData.temperature;
        tempCount++;
    }
    
    if (peremajaanValid && peremajaanData.temperatureValid) {
        tempSum += peremajaanData.temperature;
        tempCount++;
    }
    
    if (tempCount > 0) {
        averages["temp"] = tempSum / tempCount;
    } else {
        averages["temp"] = nullptr;
    }

    // Humidity average
    float humiditySum = 0;
    int humidityCount = 0;
    
    if (dewasaHumidityValid) {
        humiditySum += dewasaHumidity;
        humidityCount++;
    }
    
    if (penyemaianValid && penyemaianData.humidityValid) {
        humiditySum += penyemaianData.humidity;
        humidityCount++;
    }
    
    if (peremajaanValid && peremajaanData.humidityValid) {
        humiditySum += peremajaanData.humidity;
        humidityCount++;
    }
    
    if (humidityCount > 0) {
        averages["humidity"] = humiditySum / humidityCount;
    } else {
        averages["humidity"] = nullptr;
    }

    // Light average
    float lightSum = 0;
    int lightCount = 0;
    
    if (dewasaLightValid) {
        lightSum += dewasaLight;
        lightCount++;
    }
    
    if (penyemaianValid && penyemaianData.lightValid) {
        lightSum += penyemaianData.lightIntensity;
        lightCount++;
    }
    
    if (peremajaanValid && peremajaanData.lightValid) {
        lightSum += peremajaanData.lightIntensity;
        lightCount++;
    }
    
    if (lightCount > 0) {
        averages["light"] = lightSum / lightCount;
    } else {
        averages["light"] = nullptr;
    }

    // Add actuator states and modes
    JsonObject actuators = doc.createNestedObject("actuators");
    JsonObject fan = actuators.createNestedObject("fan");
    fan["state"] = fanState;
    fan["mode"] = fanMode; // Expecting "auto" or "manual"
    JsonObject light = actuators.createNestedObject("light");
    light["state"] = lightState;
    light["mode"] = lightMode; // Expecting "auto" or "manual"
    
    // Convert JSON document to string
    serializeJson(doc, output);
}
