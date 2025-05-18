#include <Arduino.h>
#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>
#include <ArduinoJson.h>
#include "../lib/Common/SensorData.h" 
#include "../lib/Common/NodeConfig.h" 

// --- Serial Communication with Remaja Node (Master) ---
#define SERIAL_TO_REMAJA_MASTER Serial2 

// --- Data Storage ---
SensorData receivedPenyemaianData;
SensorData receivedDewasaData;

volatile bool newPenyemaianDataFlag = false;
volatile bool newDewasaDataFlag = false;

unsigned long lastPenyemaianReceiveTime = 0;
unsigned long lastDewasaReceiveTime = 0;

// --- Timing for Forwarding Data ---
unsigned long lastSerialForwardTime = 0;
const unsigned long SERIAL_FORWARD_INTERVAL = 2500UL; 

// ---  ESP-NOW Latency ---
int PenyemaianLatencyMs = -1;
int DewasaLatencyMs = -1;

// --- For Sending Commands to Dewasa Node ---
volatile bool command_ack_status = false;
volatile bool command_callback_processed = false;

// ESP-NOW Receive Callback
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
        #endif
    } else if (memcmp(mac_addr, MAC_ADDR_DEWASA, 6) == 0) { 
        memcpy(&receivedDewasaData, incomingData, sizeof(SensorData));
        lastDewasaReceiveTime = millis();
        newDewasaDataFlag = true;
        DewasaLatencyMs = simulated_latency;
        #if DEBUG_GATEWAY
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
    Serial.println("[GatewayNode] Serial to Remaja Master initialized.");

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
    esp_now_register_recv_cb(OnDataRecv);
    esp_now_register_send_cb(OnControlDataSentToDewasa); 
    Serial.println("[GatewayNode] ESP-NOW Callbacks (Recv & Send) Registered.");

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

void forwardDataToRemajaMaster() {
    StaticJsonDocument<768 + 128> doc; 
    unsigned long currentTime = millis();

    JsonObject penyemaianJson = doc.createNestedObject("penyemaian");
    bool isPenyemaianFresh = (currentTime - lastPenyemaianReceiveTime) < PENYEMAIAN_ESP_NOW_TIMEOUT;
    penyemaianJson["isValid"] = isPenyemaianFresh && receivedPenyemaianData.temperatureValid; 
    
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
    dewasaJson["isValid"] = isDewasaFresh && receivedDewasaData.temperatureValid; 

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
    // Serial.println("[GatewayNode] Forwarded JSON via Serial to Remaja Master:");
    // Serial.println(outputJson);
    #endif

    newPenyemaianDataFlag = false;
    newDewasaDataFlag = false;
    PenyemaianLatencyMs = -1;
    DewasaLatencyMs = -1;
}

void sendSerialAckToRemaja(uint32_t commandId, bool success, const char* reason = nullptr) {
    StaticJsonDocument<128> ackDoc;
    ackDoc["type"] = "ack";
    ackDoc["id"] = commandId;
    ackDoc["status"] = success ? "ok" : "error";
    if (!success && reason) {
        ackDoc["reason"] = reason;
    }
    String ackJson;
    serializeJson(ackDoc, ackJson);
    SERIAL_TO_REMAJA_MASTER.println(ackJson);
    #if DEBUG_GATEWAY
    Serial.printf("[Gateway->Remaja] Sent Serial ACK/NACK for ID %u: %s\n", commandId, ackJson.c_str());
    #endif
}

void processSerialCommandFromRemajaMaster() {
    if (SERIAL_TO_REMAJA_MASTER.available()) {
        String line = SERIAL_TO_REMAJA_MASTER.readStringUntil('\n');
        line.trim();

        if (line.length() > 0) {
            #if DEBUG_GATEWAY
            Serial.printf("[Gateway] Received Serial from Remaja Master: %s\n", line.c_str());
            #endif

            // Check for and remove "CMD:" prefix
            if (line.startsWith("CMD:")) {
                line = line.substring(4); // Remove "CMD:"
                #if DEBUG_GATEWAY
                Serial.printf("[Gateway] Removed 'CMD:' prefix. Parsing: %s\n", line.c_str());
                #endif
            }

            StaticJsonDocument<192> doc; // Increased size slightly for command ID
            DeserializationError error = deserializeJson(doc, line);

            uint32_t commandId = doc["id"] | 0; // Extract ID, default to 0 if not present

            if (error) {
                Serial.printf("[Gateway] ERROR: Failed to parse command JSON from Remaja Master: %s\n", error.c_str());
                if (commandId != 0) { // Try to send NACK if ID was parsable
                    sendSerialAckToRemaja(commandId, false, "json_parse_error");
                }
                return;
            }

            const char* type = doc["type"];
            if (type && strcmp(type, "control_dewasa") == 0) {
                if (commandId == 0) {
                    Serial.println("[Gateway] ERROR: control_dewasa command missing 'id'. Cannot ACK.");
                    // Optionally send a generic NACK if possible, but without ID it's hard to correlate
                    return;
                }

                ActuatorCommand cmdToSend;
                const char* device = doc["device"];
                if (!device) {
                     Serial.printf("[Gateway] ERROR: control_dewasa command ID %u missing 'device'.\n", commandId);
                     sendSerialAckToRemaja(commandId, false, "missing_device");
                     return;
                }
                strlcpy(cmdToSend.device, device, sizeof(cmdToSend.device));
                
                if (!doc.containsKey("state")) {
                    Serial.printf("[Gateway] ERROR: control_dewasa command ID %u missing 'state'.\n", commandId);
                    sendSerialAckToRemaja(commandId, false, "missing_state");
                    return;
                }
                cmdToSend.state = doc["state"].as<bool>();

                // Send ACK to Remaja Master first
                sendSerialAckToRemaja(commandId, true);

                // Then, attempt to send the command to Dewasa node
                sendActuatorCommandToDewasaWithRetries(cmdToSend);
            } else {
                // Not a control_dewasa command, or type is missing.
                // This could be other types of messages in the future, or an error.
                // For now, we don't ACK non-control_dewasa messages.
                #if DEBUG_GATEWAY
                Serial.printf("[Gateway] Received non-control_dewasa type or unknown type: %s. Ignoring for ACK.\n", type ? type : "NULL");
                #endif
            }
        }
    }
}

void loop() {
    unsigned long currentTime = millis();

    if (newPenyemaianDataFlag || newDewasaDataFlag || (currentTime - lastSerialForwardTime >= SERIAL_FORWARD_INTERVAL)) {
        #if DEBUG_GATEWAY
        if (newPenyemaianDataFlag) Serial.println("[GatewayNode] Processing new Penyemaian data for forwarding.");
        if (newDewasaDataFlag) Serial.println("[GatewayNode] Processing new Dewasa data for forwarding.");
        if (!newPenyemaianDataFlag && !newDewasaDataFlag) Serial.println("[GatewayNode] Serial forward interval reached.");
        #endif
        
        forwardDataToRemajaMaster();
        lastSerialForwardTime = currentTime;
    }

    processSerialCommandFromRemajaMaster(); 

   


    yield();
}
