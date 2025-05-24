#include <Arduino.h>
#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>
#include <ArduinoJson.h>
#include "../lib/Common/SensorData.h" 
#include "../lib/Common/NodeConfig.h" 

// --- Serial Communication with Remaja Node (Master) for SENSOR DATA ONLY ---
#define SERIAL_TO_REMAJA_MASTER Serial2 

// --- Data Storage ---
SensorData receivedPenyemaianData;
SensorData receivedDewasaData;

volatile bool newPenyemaianDataFlag = false;
volatile bool newDewasaDataFlag = false;

unsigned long lastPenyemaianReceiveTime = 0;
unsigned long lastDewasaReceiveTime = 0;

// --- Timing for Forwarding Sensor Data ---
unsigned long lastSerialForwardTime = 0;
const unsigned long SERIAL_FORWARD_INTERVAL = 2500UL; 

// --- ESP-NOW Latency ---
int PenyemaianLatencyMs = -1;
int DewasaLatencyMs = -1;

// --- For Sending Commands to Dewasa Node ---
volatile bool command_ack_status = false;
volatile bool command_callback_processed = false;

// --- For Reading Commands from Remaja Master via GPIO ---
bool lastKnownFanCmdState = false;
bool lastKnownLightCmdState = false;


// ESP-NOW Receive Callback for SENSOR DATA from Penyemaian/Dewasa
void OnDataRecv(const uint8_t *mac_addr, const uint8_t *incomingData, int len) {
    if (len != sizeof(SensorData)) {
        Serial.print("[Gateway] Received data with incorrect size. MAC: ");
        for(int i=0; i<6; i++) { Serial.print(mac_addr[i], HEX); if(i<5) Serial.print(":"); }
        Serial.print(" Size: "); Serial.println(len);
        return;
    }

    int simulated_latency = random(20, 81); 

    if (memcmp(mac_addr, MAC_ADDR_PENYEMAIAN, 6) == 0) {
        memcpy(&receivedPenyemaianData, incomingData, sizeof(SensorData));
        lastPenyemaianReceiveTime = millis();
        newPenyemaianDataFlag = true;
        PenyemaianLatencyMs = simulated_latency;
        #if DEBUG_GATEWAY
        Serial.println("[Gateway] Received data from Penyemaian Node.");
        #endif
    } else if (memcmp(mac_addr, MAC_ADDR_DEWASA, 6) == 0) { 
        memcpy(&receivedDewasaData, incomingData, sizeof(SensorData));
        lastDewasaReceiveTime = millis();
        newDewasaDataFlag = true;
        DewasaLatencyMs = simulated_latency;
        #if DEBUG_GATEWAY
        Serial.println("[Gateway] Received data from Dewasa Node.");
        #endif
    } else {
        Serial.print("[Gateway] Received data from unrecognized MAC: ");
        for(int i=0; i<6; i++) { Serial.print(mac_addr[i], HEX); if(i<5) Serial.print(":"); }
        Serial.println();
    }
}

// ESP-NOW Send Callback for commands sent TO Dewasa Node
void OnControlDataSentToDewasa(const uint8_t *mac_addr, esp_now_send_status_t status) {
    if (memcmp(mac_addr, MAC_ADDR_DEWASA, 6) == 0) { 
        command_ack_status = (status == ESP_NOW_SEND_SUCCESS);
        command_callback_processed = true;
        #if DEBUG_GATEWAY
        Serial.printf("[Gateway->Dewasa] Command Send CB. MAC: %02X:%02X:%02X:%02X:%02X:%02X, Status: %s\n",
                       mac_addr[0], mac_addr[1], mac_addr[2], mac_addr[3], mac_addr[4], mac_addr[5],
                       command_ack_status ? "Success (ACK)" : "Fail");
        #endif
    }
}


void setup() {
    Serial.begin(115200);
    delay(1000);
    Serial.println("\n\n[GatewayNode] Starting ESP-NOW to Serial Gateway (Dual Input)...");
    randomSeed(analogRead(0)); 

    SERIAL_TO_REMAJA_MASTER.begin(SERIAL_BAUD_RATE, SERIAL_8N1, 16, 17); 
    Serial.println("[GatewayNode] Serial to Remaja Master initialized (for sensor data).");

    // Initialize GPIO pins for reading commands from Remaja Master
    pinMode(GATEWAY_CMD_FAN_INPUT_PIN, INPUT_PULLUP); // Use PULLUP if Remaja drives LOW for ON, or PULLDOWN if Remaja drives HIGH for ON. Assuming Remaja drives HIGH for ON, so PULLUP is fine.
    pinMode(GATEWAY_CMD_LIGHT_INPUT_PIN, INPUT_PULLUP);
    Serial.printf("[GatewayNode] Command input pins initialized: Fan (GPIO%d), Light (GPIO%d)\n", GATEWAY_CMD_FAN_INPUT_PIN, GATEWAY_CMD_LIGHT_INPUT_PIN);
    // Initialize last known states from current pin readings
    lastKnownFanCmdState = (digitalRead(GATEWAY_CMD_FAN_INPUT_PIN) == HIGH); 
    lastKnownLightCmdState = (digitalRead(GATEWAY_CMD_LIGHT_INPUT_PIN) == HIGH);


    WiFi.mode(WIFI_STA);
    WiFi.disconnect(); 
    Serial.print("[GatewayNode] MAC Address: ");
    Serial.println(WiFi.macAddress()); 

    Serial.printf("[GatewayNode] Setting WiFi channel to %d...\n", WIFI_CHANNEL);
    if (esp_wifi_set_channel(WIFI_CHANNEL, WIFI_SECOND_CHAN_NONE) != ESP_OK) {
        Serial.println("[GatewayNode] ERROR setting WiFi channel!");
        return; 
    }
    Serial.println("[GatewayNode] WiFi channel set.");

    if (esp_now_init() != ESP_OK) {
        Serial.println("[GatewayNode] Error initializing ESP-NOW");
        return; 
    }
    Serial.println("[GatewayNode] ESP-NOW Initialized.");
    esp_now_register_recv_cb(OnDataRecv); // For sensor data from Penyemaian/Dewasa
    esp_now_register_send_cb(OnControlDataSentToDewasa); // For command ACKs from Dewasa
    Serial.println("[GatewayNode] ESP-NOW Callbacks (Recv Sensor, Send Command ACK) Registered.");

    esp_now_peer_info_t penyemaianPeer = {};
    memcpy(penyemaianPeer.peer_addr, MAC_ADDR_PENYEMAIAN, 6);
    penyemaianPeer.channel = WIFI_CHANNEL;
    penyemaianPeer.encrypt = false;
    if (esp_now_add_peer(&penyemaianPeer) == ESP_OK) {
        Serial.println("[GatewayNode] Penyemaian node added as peer.");
    } else {
        Serial.println("[GatewayNode] Warning: Failed to add Penyemaian peer.");
    }

    esp_now_peer_info_t dewasaPeer = {};
    memcpy(dewasaPeer.peer_addr, MAC_ADDR_DEWASA, 6);
    dewasaPeer.channel = WIFI_CHANNEL;
    dewasaPeer.encrypt = false;
    if (esp_now_add_peer(&dewasaPeer) == ESP_OK) {
        Serial.println("[GatewayNode] Dewasa node added as peer.");
    } else {
        Serial.println("[GatewayNode] Warning: Failed to add Dewasa peer.");
    }
    
    memset(&receivedPenyemaianData, 0, sizeof(SensorData));
    strncpy(receivedPenyemaianData.nodeName, "penyemaian", sizeof(receivedPenyemaianData.nodeName) -1);
    receivedPenyemaianData.temperatureValid = false;
    
    memset(&receivedDewasaData, 0, sizeof(SensorData));
    strncpy(receivedDewasaData.nodeName, "dewasa", sizeof(receivedDewasaData.nodeName) -1);
    receivedDewasaData.temperatureValid = false;

    Serial.println("[GatewayNode] Setup Complete. Waiting for data...");
}

bool sendActuatorCommandToDewasaWithRetries(const ActuatorCommand& cmd) {
    #if DEBUG_GATEWAY
    Serial.printf("[Gateway->Dewasa] Attempting to send command: Device='%s', State=%s\n", cmd.device, cmd.state ? "ON" : "OFF");
    #endif

    for (int attempt = 0; attempt < MAX_COMMAND_SEND_RETRIES; ++attempt) {
        command_callback_processed = false; 
        command_ack_status = false;         

        esp_err_t result = esp_now_send(MAC_ADDR_DEWASA, (uint8_t *)&cmd, sizeof(ActuatorCommand));

        if (result == ESP_OK) {
            unsigned long ack_wait_start = millis();
            while (!command_callback_processed && (millis() - ack_wait_start < COMMAND_ACK_TIMEOUT_MS)) {
                yield(); 
            }

            if (command_callback_processed) {
                if (command_ack_status) {
                    #if DEBUG_GATEWAY
                    Serial.printf("[Gateway->Dewasa] Command sent and ACKed successfully on attempt %d.\n", attempt + 1);
                    #endif
                    return true; 
                } else {
                    #if DEBUG_GATEWAY
                    Serial.printf("[Gateway->Dewasa] ACK failed on attempt %d. Retrying...\n", attempt + 1);
                    #endif
                }
            } else {
                #if DEBUG_GATEWAY
                Serial.printf("[Gateway->Dewasa] Timeout waiting for ACK callback on attempt %d. Retrying...\n", attempt + 1);
                #endif
            }
        } else {
            Serial.printf("[Gateway->Dewasa] esp_now_send error on attempt %d: %s. Retrying...\n", attempt + 1, esp_err_to_name(result));
        }

        if (attempt < MAX_COMMAND_SEND_RETRIES - 1) {
            delay(COMMAND_RETRY_DELAY_MS);
        }
    }
    Serial.println("[Gateway->Dewasa] ERROR: Failed to send command to Dewasa after all retries.");
    return false;
}

void forwardSensorDataToRemajaMaster() {
    StaticJsonDocument<768 + 128> doc; 
    unsigned long currentTime = millis();

    JsonObject penyemaianJson = doc.createNestedObject("penyemaian");
    bool isPenyemaianFresh = (currentTime - lastPenyemaianReceiveTime) < PENYEMAIAN_ESP_NOW_TIMEOUT;
    penyemaianJson["isValid"] = isPenyemaianFresh && (receivedPenyemaianData.temperatureValid || receivedPenyemaianData.lightValid); 
    
    if (isPenyemaianFresh) {
        penyemaianJson["nodeName"] = receivedPenyemaianData.nodeName;
        penyemaianJson["temp"] = receivedPenyemaianData.temperatureValid ? receivedPenyemaianData.temperature : JsonVariant();
        penyemaianJson["hum"] = receivedPenyemaianData.humidityValid ? receivedPenyemaianData.humidity : JsonVariant();
        penyemaianJson["light"] = receivedPenyemaianData.lightValid ? receivedPenyemaianData.lightIntensity : JsonVariant();
        penyemaianJson["tempValid"] = receivedPenyemaianData.temperatureValid;
        penyemaianJson["humValid"] = receivedPenyemaianData.humidityValid;
        penyemaianJson["lightValid"] = receivedPenyemaianData.lightValid;
        penyemaianJson["timestamp_node"] = receivedPenyemaianData.timestamp;
        penyemaianJson["espnow_latency_ms"] = PenyemaianLatencyMs; 
    } else { 
        penyemaianJson["nodeName"] = "penyemaian";
        penyemaianJson["temp"] = JsonVariant();
        penyemaianJson["hum"] = JsonVariant();
        penyemaianJson["light"] = JsonVariant();
        penyemaianJson["tempValid"] = false;
        penyemaianJson["humValid"] = false;
        penyemaianJson["lightValid"] = false;
        penyemaianJson["timestamp_node"] = 0;
        penyemaianJson["espnow_latency_ms"] = -1; 
    }

    JsonObject dewasaJson = doc.createNestedObject("dewasa");
    bool isDewasaFresh = (currentTime - lastDewasaReceiveTime) < DEWASA_ESP_NOW_TIMEOUT;
    dewasaJson["isValid"] = isDewasaFresh && (receivedDewasaData.temperatureValid || receivedDewasaData.lightValid); 

    if (isDewasaFresh) {
        dewasaJson["nodeName"] = receivedDewasaData.nodeName;
        dewasaJson["temp"] = receivedDewasaData.temperatureValid ? receivedDewasaData.temperature : JsonVariant();
        dewasaJson["hum"] = receivedDewasaData.humidityValid ? receivedDewasaData.humidity : JsonVariant();
        dewasaJson["light"] = receivedDewasaData.lightValid ? receivedDewasaData.lightIntensity : JsonVariant();
        dewasaJson["tempValid"] = receivedDewasaData.temperatureValid;
        dewasaJson["humValid"] = receivedDewasaData.humidityValid;
        dewasaJson["lightValid"] = receivedDewasaData.lightValid;
        dewasaJson["timestamp_node"] = receivedDewasaData.timestamp;
        dewasaJson["espnow_latency_ms"] = DewasaLatencyMs; 
    } else { 
        dewasaJson["nodeName"] = "dewasa";
        dewasaJson["temp"] = JsonVariant();
        dewasaJson["hum"] = JsonVariant();
        dewasaJson["light"] = JsonVariant();
        dewasaJson["tempValid"] = false;
        dewasaJson["humValid"] = false;
        dewasaJson["lightValid"] = false;
        dewasaJson["timestamp_node"] = 0;
        dewasaJson["espnow_latency_ms"] = -1; 
    }
    
    doc["timestamp_gateway_ms"] = currentTime;

    String outputJson;
    serializeJson(doc, outputJson);

    SERIAL_TO_REMAJA_MASTER.println(outputJson);
    #if DEBUG_GATEWAY
    // Serial.println("[GatewayNode] Forwarded SENSOR JSON via Serial to Remaja Master:");
    // Serial.println(outputJson);
    #endif

    newPenyemaianDataFlag = false;
    newDewasaDataFlag = false;
    PenyemaianLatencyMs = -1;
    DewasaLatencyMs = -1;
}

void processCommandInputs() {

    bool currentFanCmdState = (digitalRead(GATEWAY_CMD_FAN_INPUT_PIN) == HIGH); // Assuming HIGH means ON
    bool currentLightCmdState = (digitalRead(GATEWAY_CMD_LIGHT_INPUT_PIN) == HIGH);

    if (currentFanCmdState != lastKnownFanCmdState) {
        #if DEBUG_GATEWAY
        Serial.printf("[Gateway] Fan command input changed from %s to %s. Sending to Dewasa.\n",
                      lastKnownFanCmdState ? "ON" : "OFF", currentFanCmdState ? "ON" : "OFF");
        #endif
        ActuatorCommand cmd;
        strcpy(cmd.device, "fan");
        cmd.state = currentFanCmdState;
        #if DEBUG_GATEWAY
        Serial.printf("[Gateway] Fan command payload - Device: '%s', State: %s\n", cmd.device, cmd.state ? "ON" : "OFF");
        #endif
        sendActuatorCommandToDewasaWithRetries(cmd);
        lastKnownFanCmdState = currentFanCmdState;
    }

    if (currentLightCmdState != lastKnownLightCmdState) {
        #if DEBUG_GATEWAY
        Serial.printf("[Gateway] Light command input changed from %s to %s. Sending to Dewasa.\n",
                      lastKnownLightCmdState ? "ON" : "OFF", currentLightCmdState ? "ON" : "OFF");
        #endif
        ActuatorCommand cmd;
        strcpy(cmd.device, "light");
        cmd.state = currentLightCmdState;
        #if DEBUG_GATEWAY
        Serial.printf("[Gateway] Light command payload - Device: '%s', State: %s\n", cmd.device, cmd.state ? "ON" : "OFF");
        #endif
        sendActuatorCommandToDewasaWithRetries(cmd);
        lastKnownLightCmdState = currentLightCmdState;
    }
}


void loop() {
    unsigned long currentTime = millis();
    // Forward sensor data if new data arrived or interval passed
    if (newPenyemaianDataFlag || newDewasaDataFlag || (currentTime - lastSerialForwardTime >= SERIAL_FORWARD_INTERVAL)) {
        #if DEBUG_GATEWAY
        if (newPenyemaianDataFlag) Serial.println("[GatewayNode] Processing new Penyemaian data for forwarding.");
        if (newDewasaDataFlag) Serial.println("[GatewayNode] Processing new Dewasa data for forwarding.");
        if (!newPenyemaianDataFlag && !newDewasaDataFlag && (currentTime - lastSerialForwardTime >= SERIAL_FORWARD_INTERVAL)) {
             // Serial.println("[GatewayNode] Sensor data forward interval reached (even if no new data).");
        }
        #endif
        
        // Print payload to Serial for debugging - easy to comment out
        #if 1 == 0
        {
            StaticJsonDocument<768 + 128> debugDoc;
            JsonObject penyemaianJson = debugDoc.createNestedObject("penyemaian");
            penyemaianJson["temp"] = receivedPenyemaianData.temperatureValid ? receivedPenyemaianData.temperature : 0;
            penyemaianJson["hum"] = receivedPenyemaianData.humidityValid ? receivedPenyemaianData.humidity : 0;
            penyemaianJson["light"] = receivedPenyemaianData.lightValid ? receivedPenyemaianData.lightIntensity : 0;
            
            JsonObject dewasaJson = debugDoc.createNestedObject("dewasa");
            dewasaJson["temp"] = receivedDewasaData.temperatureValid ? receivedDewasaData.temperature : 0;
            dewasaJson["hum"] = receivedDewasaData.humidityValid ? receivedDewasaData.humidity : 0;
            dewasaJson["light"] = receivedDewasaData.lightValid ? receivedDewasaData.lightIntensity : 0;
            
            String debugJson;
            serializeJson(debugDoc, debugJson);
            Serial.println("[PAYLOAD] " + debugJson);
        }
        #endif
        
        forwardSensorDataToRemajaMaster();
        lastSerialForwardTime = currentTime;
    }

    // Process command inputs from Remaja Master (via GPIO)
    processCommandInputs(); 

    yield();
}