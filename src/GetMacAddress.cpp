#include <Arduino.h>
#include <WiFi.h>

void setup() {
  Serial.begin(115200);
  delay(1000);

  // Initialize WiFi in Station mode to get the MAC address
  WiFi.mode(WIFI_STA);
  
  Serial.println("\n\n===== ESP32 MAC Address Finder =====");
  Serial.print("MAC Address: ");
  Serial.println(WiFi.macAddress());
  Serial.println("===================================");
  Serial.println("Copy this MAC address for your configuration.");
}

void loop() {
  // Nothing to do here
  delay(5000);
  // Print it again periodically just to make sure it's not missed
  Serial.print("MAC Address: ");
  Serial.println(WiFi.macAddress());
}