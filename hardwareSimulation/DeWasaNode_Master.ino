/*
 * DeWasaNode_Master.ino
 * Master node for greenhouse monitoring system (Dewasa section)
 * 
 * This node:
 * 1. Reads data from attached DHT22 (temperature/humidity) and BH1750 (light) sensors
 * 2. Receives data from other nodes (Penyemaian and Peremajaan) via ESP-NOW
 * 3. Aggregates all data and publishes to MQTT broker
 * 4. Manages connection between ESP-NOW mesh network and MQTT cloud
 * 
 * Hardware:
 * - ESP32
 * - DHT22 sensor (temperature and humidity)
 * - BH1750 sensor (light intensity)
 */

#include <WiFi.h>
#include <esp_now.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <Wire.h>
#include <BH1750.h>

// Debug and logging
#define DEBUG true
#define SERIAL_BAUD 115200
#define DEBUG_PRINT(x) if(DEBUG) Serial.print(x)
#define DEBUG_PRINTLN(x) if(DEBUG) Serial.println(x)

// Simulation mode configuration
#define TEMP_HUMID_SIMULATION_MODE false  // Set to true to simulate DHT22 readings
#define LIGHT_SIMULATION_MODE false       // Set to true to simulate BH1750 readings

// Pin to toggle simulation modes (optional)
#define SIMULATION_TOGGLE_PIN 13  // Use this pin to toggle simulation mode

// ESP32 specific pins
#define STATUS_LED_PIN 2     // Built-in LED on most ESP32 boards or GPIO2
#define ERROR_LED_PIN 15     // Optional external LED for error indication

// DHT22 configuration
#define DHTPIN 4         // Pin connected to DHT22
#define DHTTYPE DHT22    // DHT22 sensor type
DHT dht(DHTPIN, DHTTYPE);

// BH1750 configuration
BH1750 lightMeter;

// WiFi configuration
const char* ssid = "Direktorat Kemendikbud";      // Replace with your WiFi SSID
const char* password = "NadiemGantengSih";  // Replace with your WiFi password

// MQTT configuration
const char* mqtt_server = "broker.emqx.io";
const int mqtt_port = 1883;
const char* mqtt_topic = "lokatech/greenhouse/sensors";

// ESP-NOW node MAC addresses (replace with your actual MAC addresses)
uint8_t penyemaianMac[] = {0x01, 0x02, 0x03, 0x04, 0x05, 0x06};
uint8_t peremajaaanMac[] = {0x11, 0x12, 0x13, 0x14, 0x15, 0x16};

// Connection instances
WiFiClient espClient;
PubSubClient mqttClient(espClient);

// Node status tracking
bool penyemaianOnline = false;
bool peremajaaanOnline = false;
unsigned long lastPenyemaianUpdate = 0;
unsigned long lastPeremajaanUpdate = 0;
const unsigned long NODE_TIMEOUT = 30000; // 30 seconds timeout to consider node offline

// Data structures for holding sensor values
struct SensorData {
  float temp;
  float humidity;
  float light;
  bool tempSensorOk;
  bool humiditySensorOk;
  bool lightSensorOk;
};

// Store latest readings from each node
SensorData dewasaData = {0, 0, 0, false, false, false};
SensorData penyemaianData = {0, 0, 0, false, false, false};
SensorData peremajaaanData = {0, 0, 0, false, false, false};

// Timestamp of last data publication
unsigned long lastPublishTime = 0;
const unsigned long PUBLISH_INTERVAL = 5000; // Publish every 5 seconds

// Timestamp of last sensor reading
unsigned long lastSensorReadTime = 0;
const unsigned long SENSOR_READ_INTERVAL = 2000; // Read sensors every 2 seconds

// Simulation mode variables
bool tempHumidSimulation = TEMP_HUMID_SIMULATION_MODE;
bool lightSimulation = LIGHT_SIMULATION_MODE;

// ESP-NOW data structure - must match the sender structure
typedef struct node_message {
  char node[16]; // Node identifier (e.g., "penyemaian", "peremajaan")
  float temp;
  float humidity;
  float light;
  bool tempSensorOk;
  bool humiditySensorOk;
  bool lightSensorOk;
} node_message;

// Add new constants for MQTT handling
const int MQTT_RETRY_ATTEMPTS = 3;
const unsigned long MQTT_RETRY_DELAY = 1000;  // 1 second between retries
const unsigned long MQTT_RECONNECT_INTERVAL = 5000;  // Try reconnecting every 5 seconds
unsigned long lastMqttReconnectAttempt = 0;

// Setup WiFi connection
void setupWiFi() {
  DEBUG_PRINT("Connecting to WiFi ");
  DEBUG_PRINTLN(ssid);
  
  WiFi.mode(WIFI_AP_STA); // Set ESP32 as both access point and station
  WiFi.begin(ssid, password);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    DEBUG_PRINT(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    DEBUG_PRINTLN("");
    DEBUG_PRINTLN("WiFi connected");
    DEBUG_PRINT("IP address: ");
    DEBUG_PRINTLN(WiFi.localIP());
  } else {
    DEBUG_PRINTLN("");
    DEBUG_PRINTLN("WiFi connection FAILED - continuing with ESP-NOW only");
  }
}

// Setup MQTT connection
void setupMQTT() {
  mqttClient.setServer(mqtt_server, mqtt_port);
  mqttClient.setCallback(mqttCallback);
}

// MQTT callback for incoming messages
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  DEBUG_PRINT("Message arrived on topic: ");
  DEBUG_PRINTLN(topic);
  
  // Here you could handle incoming MQTT messages for control commands
  // For example, if you want to add control for fans or lights
}

// Modify reconnectMQTT() to include retries and better error handling
bool reconnectMQTT() {
    if (!mqttClient.connected()) {
        DEBUG_PRINT("Attempting MQTT connection...");
        
        // Create a random client ID
        String clientId = "ESP32-Dewasa-";
        clientId += String(random(0xffff), HEX);
        
        // Try to connect with retries
        for (int attempt = 0; attempt < MQTT_RETRY_ATTEMPTS; attempt++) {
            if (attempt > 0) {
                DEBUG_PRINT("Retry attempt ");
                DEBUG_PRINTLN(attempt);
                delay(MQTT_RETRY_DELAY);
            }
            
            if (mqttClient.connect(clientId.c_str())) {
                DEBUG_PRINTLN("connected");
                return true;
            } else {
                DEBUG_PRINT("failed, rc=");
                DEBUG_PRINT(mqttClient.state());
                DEBUG_PRINT(" wifi status=");
                DEBUG_PRINTLN(WiFi.status());
            }
        }
        DEBUG_PRINTLN(" giving up until next interval");
        return false;
    }
    return true;
}

// Initialize ESP-NOW
void setupESPNow() {
  // Init ESP-NOW
  if (esp_now_init() != ESP_OK) {
    DEBUG_PRINTLN("Error initializing ESP-NOW");
    return;
  }
  
  // Register callback function for receiving data
  esp_now_register_recv_cb(onDataReceived);
  
  DEBUG_PRINTLN("ESP-NOW initialized successfully");
}

// ESP-NOW data received callback
void onDataReceived(const uint8_t *mac, const uint8_t *data, int len) {
  // Check if the data size matches our structure
  if (len == sizeof(node_message)) {
    node_message* msg = (node_message*)data;
    
    DEBUG_PRINT("Data received from node: ");
    DEBUG_PRINTLN(msg->node);
    
    // Update the appropriate node's data based on node identifier
    if (strcmp(msg->node, "penyemaian") == 0) {
      penyemaianData.temp = msg->temp;
      penyemaianData.humidity = msg->humidity;
      penyemaianData.light = msg->light;
      penyemaianData.tempSensorOk = msg->tempSensorOk;
      penyemaianData.humiditySensorOk = msg->humiditySensorOk;
      penyemaianData.lightSensorOk = msg->lightSensorOk;
      
      penyemaianOnline = true;
      lastPenyemaianUpdate = millis();
      
      DEBUG_PRINTLN("Updated penyemaian node data");
    } 
    else if (strcmp(msg->node, "peremajaan") == 0) {
      peremajaaanData.temp = msg->temp;
      peremajaaanData.humidity = msg->humidity;
      peremajaaanData.light = msg->light;
      peremajaaanData.tempSensorOk = msg->tempSensorOk;
      peremajaaanData.humiditySensorOk = msg->humiditySensorOk;
      peremajaaanData.lightSensorOk = msg->lightSensorOk;
      
      peremajaaanOnline = true;
      lastPeremajaanUpdate = millis();
      
      DEBUG_PRINTLN("Updated peremajaan node data");
    }
  } else {
    DEBUG_PRINTLN("Received data size doesn't match expected structure!");
  }
}

// Read sensors on this node (dewasa)
void readSensors() {
  DEBUG_PRINTLN("Reading dewasa node sensors...");
  
  // Read humidity and temperature
  if (tempHumidSimulation) {
    // Generate random temperature between 20-35°C
    float t = 20.0 + (random(0, 150) / 10.0);
    // Generate random humidity between 40-90%
    float h = 40.0 + (random(0, 500) / 10.0);
    
    dewasaData.humidity = h;
    dewasaData.temp = t;
    dewasaData.tempSensorOk = true;
    dewasaData.humiditySensorOk = true;
    
    DEBUG_PRINT("Simulated Dewasa Temperature: ");
    DEBUG_PRINT(t);
    DEBUG_PRINTLN(" °C");
    DEBUG_PRINT("Simulated Dewasa Humidity: ");
    DEBUG_PRINT(h);
    DEBUG_PRINTLN(" %");
  } else {
    // Read humidity and temperature
    float h = dht.readHumidity();
    float t = dht.readTemperature();
    
    // Check if DHT readings are valid
    if (isnan(h) || isnan(t)) {
      DEBUG_PRINTLN("Failed to read from DHT sensor!");
      dewasaData.tempSensorOk = false;
      dewasaData.humiditySensorOk = false;
    } else {
      dewasaData.humidity = h;
      dewasaData.temp = t;
      dewasaData.tempSensorOk = true;
      dewasaData.humiditySensorOk = true;
      
      DEBUG_PRINT("Dewasa Temperature: ");
      DEBUG_PRINT(t);
      DEBUG_PRINTLN(" °C");
      DEBUG_PRINT("Dewasa Humidity: ");
      DEBUG_PRINT(h);
      DEBUG_PRINTLN(" %");
    }
  }
  
  // Read light intensity
  if (lightSimulation) {
    // Generate random light level between 0-100%
    float lux = random(0, 1000) / 10.0;
    dewasaData.light = lux;
    dewasaData.lightSensorOk = true;
    
    DEBUG_PRINT("Simulated Dewasa Light: ");
    DEBUG_PRINT(dewasaData.light);
    DEBUG_PRINTLN(" %");
  } else {
    if (lightMeter.measurementReady()) {
      float lux = lightMeter.readLightLevel();
      
      if (lux >= 0) {
        dewasaData.light = lux / 10.0; // Convert to percentage (assuming 1000 lux = 100%)
        if (dewasaData.light > 100) dewasaData.light = 100;
        dewasaData.lightSensorOk = true;
        
        DEBUG_PRINT("Dewasa Light: ");
        DEBUG_PRINT(dewasaData.light);
        DEBUG_PRINTLN(" %");
      } else {
        DEBUG_PRINTLN("Failed to read from BH1750 sensor!");
        dewasaData.lightSensorOk = false;
      }
    } else {
      DEBUG_PRINTLN("BH1750 measurement not ready");
    }
  }
}

// Check nodes status - mark as offline if timeout is reached
void checkNodesStatus() {
  unsigned long currentTime = millis();
  
  // Check penyemaian node status
  if (currentTime - lastPenyemaianUpdate > NODE_TIMEOUT) {
    if (penyemaianOnline) {
      DEBUG_PRINTLN("Penyemaian node went offline!");
      penyemaianOnline = false;
    }
  }
  
  // Check peremajaan node status
  if (currentTime - lastPeremajaanUpdate > NODE_TIMEOUT) {
    if (peremajaaanOnline) {
      DEBUG_PRINTLN("Peremajaan node went offline!");
      peremajaaanOnline = false;
    }
  }
}

// Calculate average values from all active nodes
void calculateAverages(JsonObject averages) {
  float tempSum = 0;
  float humiditySum = 0;
  float lightSum = 0;
  int tempCount = 0;
  int humidityCount = 0;
  int lightCount = 0;
  
  // Add dewasa node data if sensors are working
  if (dewasaData.tempSensorOk) {
    tempSum += dewasaData.temp;
    tempCount++;
  }
  if (dewasaData.humiditySensorOk) {
    humiditySum += dewasaData.humidity;
    humidityCount++;
  }
  if (dewasaData.lightSensorOk) {
    lightSum += dewasaData.light;
    lightCount++;
  }
  
  // Add penyemaian node data if online and sensors are working
  if (penyemaianOnline) {
    if (penyemaianData.tempSensorOk) {
      tempSum += penyemaianData.temp;
      tempCount++;
    }
    if (penyemaianData.humiditySensorOk) {
      humiditySum += penyemaianData.humidity;
      humidityCount++;
    }
    if (penyemaianData.lightSensorOk) {
      lightSum += penyemaianData.light;
      lightCount++;
    }
  }
  
  // Add peremajaan node data if online and sensors are working
  if (peremajaaanOnline) {
    if (peremajaaanData.tempSensorOk) {
      tempSum += peremajaaanData.temp;
      tempCount++;
    }
    if (peremajaaanData.humiditySensorOk) {
      humiditySum += peremajaaanData.humidity;
      humidityCount++;
    }
    if (peremajaaanData.lightSensorOk) {
      lightSum += peremajaaanData.light;
      lightCount++;
    }
  }
  
  // Calculate and round averages
  if (tempCount > 0) averages["temp"] = round(tempSum / tempCount * 10) / 10.0;
  if (humidityCount > 0) averages["humidity"] = round(humiditySum / humidityCount * 10) / 10.0;
  if (lightCount > 0) averages["light"] = round(lightSum / lightCount * 10) / 10.0;
}

// Add section data to JSON document
void addSectionData(JsonObject section, const SensorData& data, bool isOnline) {
  if (!isOnline) return;
  
  JsonObject trends = section.createNestedObject("trends");
  
  if (data.tempSensorOk) {
    section["temp"] = data.temp;
    trends["temp"] = "equals"; // In a real implementation, compare with previous readings
  }
  
  if (data.humiditySensorOk) {
    section["humidity"] = data.humidity;
    trends["humidity"] = "equals";
  }
  
  if (data.lightSensorOk) {
    section["light"] = data.light;
    trends["light"] = "equals";
  }
}

// Modify publishData() to handle connection issues better
void publishData() {
    unsigned long currentTime = millis();
    
    // Check WiFi first
    if (WiFi.status() != WL_CONNECTED) {
        DEBUG_PRINTLN("WiFi disconnected. Cannot publish.");
        return;
    }
    
    // Handle MQTT connection with retry timing
    if (!mqttClient.connected()) {
        if (currentTime - lastMqttReconnectAttempt > MQTT_RECONNECT_INTERVAL) {
            lastMqttReconnectAttempt = currentTime;
            if (!reconnectMQTT()) {
                DEBUG_PRINTLN("Failed to connect to MQTT. Skipping publish.");
                return;
            }
        } else {
            return; // Wait for next retry interval
        }
    }
    
    // Create JSON document
    DynamicJsonDocument doc(1024);
    
    // Add timestamp
    doc["timestamp"] = millis();
    
    // Create sections object
    JsonObject sections = doc.createNestedObject("sections");
    
    // Add data for each section
    JsonObject dewasaSection = sections.createNestedObject("dewasa");
    addSectionData(dewasaSection, dewasaData, true); // Master node is always "online"
    
    JsonObject penyemaianSection = sections.createNestedObject("penyemaian");
    addSectionData(penyemaianSection, penyemaianData, penyemaianOnline);
    
    JsonObject peremajaanSection = sections.createNestedObject("peremajaan");
    addSectionData(peremajaanSection, peremajaaanData, peremajaaanOnline);
    
    // Add averages
    JsonObject averages = doc.createNestedObject("averages");
    calculateAverages(averages);
    
    // Serialize JSON to string
    String jsonString;
    serializeJson(doc, jsonString);
    
    // Publish with retry logic
    bool publishSuccess = false;
    for (int attempt = 0; attempt < MQTT_RETRY_ATTEMPTS; attempt++) {
        DEBUG_PRINTLN("Publishing to MQTT:");
        DEBUG_PRINTLN(jsonString);
        
        if (mqttClient.publish(mqtt_topic, jsonString.c_str())) {
            DEBUG_PRINTLN("MQTT publish successful");
            publishSuccess = true;
            break;
        } else {
            DEBUG_PRINT("MQTT publish failed, attempt ");
            DEBUG_PRINTLN(attempt + 1);
            
            if (attempt < MQTT_RETRY_ATTEMPTS - 1) {
                delay(MQTT_RETRY_DELAY);
                if (!mqttClient.connected()) {
                    if (!reconnectMQTT()) break;
                }
            }
        }
    }
    
    if (!publishSuccess) {
        DEBUG_PRINTLN("All MQTT publish attempts failed");
        // Visual feedback for failed publish
        if (ERROR_LED_PIN != 0) {
            digitalWrite(ERROR_LED_PIN, HIGH);
            delay(100);
            digitalWrite(ERROR_LED_PIN, LOW);
        }
    }
}

// Toggle simulation modes
void toggleSimulationModes() {
  DEBUG_PRINTLN("Toggling simulation modes...");
  
  // Toggle temperature/humidity simulation
  tempHumidSimulation = !tempHumidSimulation;
  DEBUG_PRINT("Temperature/Humidity simulation: ");
  DEBUG_PRINTLN(tempHumidSimulation ? "ON" : "OFF");
  
  // Toggle light simulation
  lightSimulation = !lightSimulation;
  DEBUG_PRINT("Light simulation: ");
  DEBUG_PRINTLN(lightSimulation ? "ON" : "OFF");
  
  // Visual feedback using status LED
  if (STATUS_LED_PIN != 0) {
    for (int i = 0; i < 3; i++) {
      digitalWrite(STATUS_LED_PIN, HIGH);
      delay(100);
      digitalWrite(STATUS_LED_PIN, LOW);
      delay(100);
    }
  }
}

// Check for button press to toggle simulation mode
void checkSimulationToggle() {
  if (SIMULATION_TOGGLE_PIN) {
    static bool lastButtonState = HIGH;
    static unsigned long lastDebounceTime = 0;
    const unsigned long debounceDelay = 200;
    
    // Read button state
    bool buttonState = digitalRead(SIMULATION_TOGGLE_PIN);
    
    // Debounce
    if (buttonState != lastButtonState) {
      lastDebounceTime = millis();
    }
    
    if ((millis() - lastDebounceTime) > debounceDelay) {
      // If button was pressed (LOW state)
      if (buttonState == LOW && lastButtonState == HIGH) {
        toggleSimulationModes();
      }
    }
    
    lastButtonState = buttonState;
  }
}

// Update setup() to include MQTT setup improvements
void setup() {
  // Initialize serial communication
  Serial.begin(SERIAL_BAUD);
  DEBUG_PRINTLN("\n\n--- Dewasa Master Node Starting ---");
  
  // Initialize simulation toggle pin
  if (SIMULATION_TOGGLE_PIN) {
    pinMode(SIMULATION_TOGGLE_PIN, INPUT_PULLUP);
    DEBUG_PRINTLN("Simulation toggle button enabled on pin " + String(SIMULATION_TOGGLE_PIN));
  }
  
  // Initialize LEDs if available
  if (STATUS_LED_PIN != 0) {
    pinMode(STATUS_LED_PIN, OUTPUT);
    digitalWrite(STATUS_LED_PIN, LOW);
  }
  
  if (ERROR_LED_PIN != 0) {
    pinMode(ERROR_LED_PIN, OUTPUT);
    digitalWrite(ERROR_LED_PIN, LOW);
  }
  
  // Initialize I2C communication
  Wire.begin();
  
  // Initialize BH1750
  if (!lightSimulation) {
    if (lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE)) {
      DEBUG_PRINTLN("BH1750 sensor initialized");
    } else {
      DEBUG_PRINTLN("Failed to initialize BH1750 sensor!");
      // If hardware initialization fails, switch to simulation mode
      lightSimulation = true;
      DEBUG_PRINTLN("Automatically enabling light simulation mode due to sensor error");
    }
  } else {
    DEBUG_PRINTLN("BH1750 sensor in simulation mode");
  }
  
  // Initialize DHT22
  if (!tempHumidSimulation) {
    dht.begin();
    DEBUG_PRINTLN("DHT22 sensor initialized");
  } else {
    DEBUG_PRINTLN("DHT22 sensor in simulation mode");
  }
  
  // Setup WiFi
  setupWiFi();
  
  // Setup ESP-NOW
  setupESPNow();
  
  // Setup MQTT
  setupMQTT();
  
  // Setup MQTT with larger buffer size and longer timeout
  mqttClient.setBufferSize(1024);  // Increase buffer size for larger messages
  mqttClient.setSocketTimeout(10); // Longer socket timeout
  
  // Seed random number generator for simulation
  randomSeed(analogRead(0));
  
  // Blink status LED to indicate successful initialization
  if (STATUS_LED_PIN != 0) {
    for (int i = 0; i < 3; i++) {
      digitalWrite(STATUS_LED_PIN, HIGH);
      delay(100);
      digitalWrite(STATUS_LED_PIN, LOW);
      delay(100);
    }
  }
  
  DEBUG_PRINTLN("Setup complete. Starting main loop");
}

// Update loop() to handle MQTT state
void loop() {
  unsigned long currentMillis = millis();
  
  // Check for simulation mode toggle button press
  checkSimulationToggle();
  
  // Process MQTT messages
  if (WiFi.status() == WL_CONNECTED) {
    mqttClient.loop();
  }
  
  // Read sensors at regular intervals
  if (currentMillis - lastSensorReadTime >= SENSOR_READ_INTERVAL) {
    lastSensorReadTime = currentMillis;
    readSensors();
  }
  
  // Check node status
  checkNodesStatus();
  
  // Publish data at regular intervals
  if (currentMillis - lastPublishTime >= PUBLISH_INTERVAL) {
    lastPublishTime = currentMillis;
    publishData();
  }
  
  // Reconnect WiFi if disconnected
  if (WiFi.status() != WL_CONNECTED) {
    DEBUG_PRINTLN("WiFi disconnected. Attempting to reconnect...");
    WiFi.begin(ssid, password);
  }
  
  delay(100); // Small delay to prevent CPU hogging
}