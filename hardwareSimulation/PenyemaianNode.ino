/*
 * PenyemaianNode.ino
 * ESP-NOW node for greenhouse monitoring system (Penyemaian section)
 * 
 * This node:
 * 1. Reads data from attached DHT22 (temperature/humidity) and BH1750 (light) sensors
 * 2. Sends data to the master node (Dewasa) via ESP-NOW
 * 3. Operates in low power mode to conserve battery
 * 
 * Hardware:
 * - ESP32
 * - DHT22 sensor (temperature and humidity)
 * - BH1750 sensor (light intensity)
 */

#include <esp_now.h>
#include <WiFi.h>
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

// Node identification
#define NODE_NAME "penyemaian"

// DHT22 configuration
#define DHTPIN 4         // Pin connected to DHT22
#define DHTTYPE DHT22    // DHT22 sensor type
DHT dht(DHTPIN, DHTTYPE);

// BH1750 configuration
BH1750 lightMeter;

// Master node MAC address (replace with your Master node's actual MAC address)
uint8_t masterMac[] = {0x11, 0x22, 0x33, 0x44, 0x55, 0x66};

// Simulation mode variables
bool tempHumidSimulation = TEMP_HUMID_SIMULATION_MODE;
bool lightSimulation = LIGHT_SIMULATION_MODE;

// Data structure for sending data - must match the receiver structure
typedef struct node_message {
  char node[16]; // Node identifier (e.g., "penyemaian", "peremajaan")
  float temp;
  float humidity;
  float light;
  bool tempSensorOk;
  bool humiditySensorOk;
  bool lightSensorOk;
} node_message;

// Define the message object
node_message sensorData;

// Timing variables
unsigned long lastSensorReadTime = 0;
const unsigned long SENSOR_READ_INTERVAL = 10000; // Read and send data every 10 seconds

// Sensor value storage
float lastTemp = 0;
float lastHumidity = 0;
float lastLight = 0;
bool tempSensorOk = false;
bool humiditySensorOk = false;
bool lightSensorOk = false;

// Battery management (if applicable)
#define BATTERY_PIN 34   // Analog pin for battery level reading
int batteryLevel = 100;  // Battery level percentage

// Callback function when data is sent
void onDataSent(const uint8_t *mac_addr, esp_now_send_status_t status) {
  DEBUG_PRINT("Last Packet Send Status: ");
  if (status == ESP_NOW_SEND_SUCCESS) {
    DEBUG_PRINTLN("Delivery success");
  } else {
    DEBUG_PRINTLN("Delivery fail");
  }
}

// Setup ESP-NOW communication
void setupESPNow() {
  // Set device in STA mode
  WiFi.mode(WIFI_STA);
  
  // Initialize ESP-NOW
  if (esp_now_init() != ESP_OK) {
    DEBUG_PRINTLN("Error initializing ESP-NOW");
    return;
  }
  DEBUG_PRINTLN("ESP-NOW initialized");
  
  // Register the send callback
  esp_now_register_send_cb(onDataSent);
  
  // Register peer (master node)
  esp_now_peer_info_t peerInfo;
  memcpy(peerInfo.peer_addr, masterMac, 6);
  peerInfo.channel = 0;  
  peerInfo.encrypt = false; // Set to true for encryption with a predefined key
  
  // Add peer        
  if (esp_now_add_peer(&peerInfo) != ESP_OK) {
    DEBUG_PRINTLN("Failed to add peer");
    return;
  }
  DEBUG_PRINTLN("Master node added as peer");
}

// Read temperature and humidity from DHT22
void readDHTSensor() {
  DEBUG_PRINTLN("Reading DHT22 sensor...");
  
  if (tempHumidSimulation) {
    // Generate random temperature between 20-35°C
    lastTemp = 20.0 + (random(0, 150) / 10.0);
    // Generate random humidity between 40-90%
    lastHumidity = 40.0 + (random(0, 500) / 10.0);
    
    tempSensorOk = true;
    humiditySensorOk = true;
    
    DEBUG_PRINT("Simulated Temperature: ");
    DEBUG_PRINT(lastTemp);
    DEBUG_PRINTLN("°C");
    DEBUG_PRINT("Simulated Humidity: ");
    DEBUG_PRINT(lastHumidity);
    DEBUG_PRINTLN("%");
    return;
  }
  
  // Read humidity and temperature
  float h = dht.readHumidity();
  float t = dht.readTemperature();
  
  // Check if any reads failed
  if (isnan(h) || isnan(t)) {
    DEBUG_PRINTLN("Failed to read from DHT sensor!");
    tempSensorOk = false;
    humiditySensorOk = false;
  } else {
    lastHumidity = h;
    lastTemp = t;
    tempSensorOk = true;
    humiditySensorOk = true;
    
    DEBUG_PRINT("Temperature: ");
    DEBUG_PRINT(t);
    DEBUG_PRINTLN("°C");
    DEBUG_PRINT("Humidity: ");
    DEBUG_PRINT(h);
    DEBUG_PRINTLN("%");
  }
}

// Read light intensity from BH1750
void readLightSensor() {
  DEBUG_PRINTLN("Reading BH1750 sensor...");
  
  if (lightSimulation) {
    // Generate random light level between 0-100%
    lastLight = random(0, 1000) / 10.0;
    lightSensorOk = true;
    
    DEBUG_PRINT("Simulated Light: ");
    DEBUG_PRINT(lastLight);
    DEBUG_PRINTLN("%");
    return;
  }
  
  if (lightMeter.measurementReady()) {
    float lux = lightMeter.readLightLevel();
    
    if (lux >= 0) {
      // Convert lux to percentage (assuming 1000 lux = 100%)
      lastLight = lux / 10.0;
      if (lastLight > 100) lastLight = 100;
      lightSensorOk = true;
      
      DEBUG_PRINT("Light: ");
      DEBUG_PRINT(lastLight);
      DEBUG_PRINTLN("%");
    } else {
      DEBUG_PRINTLN("Failed to read from BH1750 sensor!");
      lightSensorOk = false;
    }
  } else {
    DEBUG_PRINTLN("BH1750 measurement not ready");
  }
}

// Read battery level (if applicable)
void readBatteryLevel() {
  // Simple battery level reading from analog pin
  // This would need to be calibrated for your specific battery setup
  int rawValue = analogRead(BATTERY_PIN);
  
  // Map the analog reading to battery percentage (adjust these values based on your battery)
  // For example, if your battery provides 3.3V when full and 2.7V when empty
  // and assuming the ADC max reading of 4095 at 3.3V:
  batteryLevel = map(rawValue, 3300, 4095, 0, 100);
  batteryLevel = constrain(batteryLevel, 0, 100);
  
  DEBUG_PRINT("Battery level: ");
  DEBUG_PRINT(batteryLevel);
  DEBUG_PRINTLN("%");
}

// Send sensor data to master node via ESP-NOW
void sendSensorData() {
  // Copy values to the message structure
  strncpy(sensorData.node, NODE_NAME, sizeof(sensorData.node));
  sensorData.temp = lastTemp;
  sensorData.humidity = lastHumidity;
  sensorData.light = lastLight;
  sensorData.tempSensorOk = tempSensorOk;
  sensorData.humiditySensorOk = humiditySensorOk;
  sensorData.lightSensorOk = lightSensorOk;
  
  DEBUG_PRINTLN("Sending sensor data to master node...");
  
  // Send message via ESP-NOW
  esp_err_t result = esp_now_send(masterMac, (uint8_t *) &sensorData, sizeof(sensorData));
  
  if (result == ESP_OK) {
    DEBUG_PRINTLN("Sent successfully");
  } else {
    DEBUG_PRINTLN("Error sending data");
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

void setup() {
  // Initialize serial communication
  Serial.begin(SERIAL_BAUD);
  DEBUG_PRINTLN("\n\n--- Penyemaian Node Starting ---");
  
  // Initialize simulation toggle pin
  if (SIMULATION_TOGGLE_PIN) {
    pinMode(SIMULATION_TOGGLE_PIN, INPUT_PULLUP);
    DEBUG_PRINTLN("Simulation toggle button enabled on pin " + String(SIMULATION_TOGGLE_PIN));
  }
  
  // Initialize LED if available
  if (STATUS_LED_PIN != 0) {
    pinMode(STATUS_LED_PIN, OUTPUT);
    digitalWrite(STATUS_LED_PIN, LOW);
  }
  
  // Initialize I2C
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
  
  // Setup analog pin for battery reading
  pinMode(BATTERY_PIN, INPUT);
  
  // Setup ESP-NOW communication
  setupESPNow();
  
  // Print MAC address
  DEBUG_PRINT("MAC Address: ");
  DEBUG_PRINTLN(WiFi.macAddress());
  
  // Seed random number generator for simulation
  randomSeed(analogRead(0));
  
  // Visual feedback for initialization complete
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

void loop() {
  unsigned long currentMillis = millis();
  
  // Check for simulation mode toggle button press
  checkSimulationToggle();
  
  // Read sensors and send data at regular intervals
  if (currentMillis - lastSensorReadTime >= SENSOR_READ_INTERVAL) {
    lastSensorReadTime = currentMillis;
    
    // Read sensors
    readDHTSensor();
    readLightSensor();
    readBatteryLevel();
    
    // Send the data
    sendSensorData();
  }
  
  // For power saving, you could implement deep sleep here
  // For example:
  // esp_sleep_enable_timer_wakeup(SENSOR_READ_INTERVAL * 1000);
  // esp_deep_sleep_start();
  
  delay(100); // Small delay
}