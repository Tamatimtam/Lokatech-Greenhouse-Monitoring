#include <Arduino.h>
#include "HX711.h"

// Define HX711 connections
const int LOADCELL_DOUT_PIN = 16; // Data Out pin
const int LOADCELL_SCK_PIN = 4;  // Clock pin

// Initialize HX711 library
HX711 scale;

// Calibration factor - Calculated from raw reading (~123100) for 132g
// calibration_factor = 123100 / 132.0 = 932.58
// NOTE: If the weight reads negative, try making this factor negative (-932.58)
float calibration_factor = 103.5; // Calculated value

void setup() {
  Serial.begin(115200);
  Serial.println("HX711 Basic Reading Example"); // Reverted message

  scale.begin(LOADCELL_DOUT_PIN, LOADCELL_SCK_PIN);

  Serial.println("Initializing scale...");
  Serial.println("Remove any weight from the scale.");
  delay(2000); // Wait for stabilization

  scale.set_scale(calibration_factor); // UNCOMMENTED - Set the calculated scale
  scale.tare();                      // Reset the scale to 0

  Serial.println("Scale ready. Place weight now."); // Reverted message
}

void loop() {
  if (scale.is_ready()) {
    // long raw_reading = scale.read_average(10); // COMMENTED OUT - No longer needed
    // Serial.print("Raw Reading: ");
    // Serial.println(raw_reading);

    float weight = scale.get_units(5); // UNCOMMENTED - Read average of 5 readings in grams
    Serial.print("Weight: ");
    Serial.print(weight, 2); // Print weight with 2 decimal places
    Serial.println(" g"); // UNCOMMENTED
  } else {
    Serial.println("HX711 not found.");
  }

  delay(500); // Wait half a second before next reading
}
