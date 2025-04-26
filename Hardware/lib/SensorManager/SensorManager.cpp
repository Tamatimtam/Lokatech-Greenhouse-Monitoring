#include "SensorManager.h"

SensorManager::SensorManager(int dhtPin, bool tempHumidSimulation, bool lightSimulation) 
    : _dht(dhtPin, DHT22), _lightSensor(), _dhtPin(dhtPin), 
      _tempHumidSimulationMode(tempHumidSimulation), _lightSimulationMode(lightSimulation),
      _temperature(NAN), _humidity(NAN), _lightIntensity(NAN),
      _temperatureValid(false), _humidityValid(false), _lightValid(false) {
}

void SensorManager::begin() {
    // Initialize DHT sensor
    _dht.begin();
    Serial.println("[SensorManager] DHT22 sensor initialized");
    
    // Initialize BH1750 light sensor
    Wire.begin();
    if (_lightSensor.begin(BH1750::CONTINUOUS_HIGH_RES_MODE)) {
        Serial.println("[SensorManager] BH1750 sensor initialized");
    } else {
        Serial.println("[SensorManager] ERROR: Failed to initialize BH1750 sensor!");
    }
    
    // Log simulation mode status
    if (_tempHumidSimulationMode) {
        Serial.println("[SensorManager] Temperature & humidity simulation mode ENABLED");
    }
    
    if (_lightSimulationMode) {
        Serial.println("[SensorManager] Light intensity simulation mode ENABLED");
    }

    // Initialize random seed for simulation
    if (_tempHumidSimulationMode || _lightSimulationMode) {
        randomSeed(analogRead(0));
    }
}

bool SensorManager::readSensors() {
    _temperatureValid = false;
    _humidityValid = false;
    _lightValid = false;

    // Read temperature and humidity from DHT22 or simulate
    if (_tempHumidSimulationMode) {
        _temperature = getRandomTemperature();
        _humidity = getRandomHumidity();
        _temperatureValid = true;
        _humidityValid = true;
        Serial.println("[SensorManager] Simulated temperature: " + String(_temperature) + "°C");
        Serial.println("[SensorManager] Simulated humidity: " + String(_humidity) + "%");
    } else {
        // Read into temporary variables first
        float temp_reading = _dht.readTemperature();
        float hum_reading = _dht.readHumidity();

        // Check if both readings are valid (not NaN AND not exactly 0.0)
        // A reading of exactly 0.0 for both temp and humidity is highly unlikely in a real scenario
        // and often indicates a sensor communication failure with some libraries.
        bool temp_is_plausible = !isnan(temp_reading) && temp_reading != 0.0f;
        bool hum_is_plausible = !isnan(hum_reading) && hum_reading != 0.0f;

        if (temp_is_plausible && hum_is_plausible) {
            // Both readings seem valid, update member variables and flags
            _temperature = temp_reading;
            _humidity = hum_reading;
            _temperatureValid = true; // Set flag to true
            _humidityValid = true;    // Set flag to true
            Serial.println("[SensorManager] Temperature: " + String(_temperature) + "°C");
            Serial.println("[SensorManager] Humidity: " + String(_humidity) + "%");
        } else {
            // One or both readings failed (NaN or 0.0). Do not update member variables.
            // Flags _temperatureValid and _humidityValid remain false (as set at the start).
            Serial.print("[SensorManager] ERROR: Failed to read plausible data from DHT sensor!");
            Serial.print(" Temp Raw: "); Serial.print(temp_reading);
            Serial.print(", Hum Raw: "); Serial.println(hum_reading);
            // Keep _temperature and _humidity as their previous values (or NAN if first read)
        }
    }

    // Read light intensity from BH1750 or simulate
    if (_lightSimulationMode) {
        _lightIntensity = getRandomLightIntensity();
        _lightValid = true;
        Serial.println("[SensorManager] Simulated light intensity: " + String(_lightIntensity) + " lux");
    } else {
        // Read lux directly from sensor
        float luxReading = _lightSensor.readLightLevel();

        // BH1750 library usually returns < 0 on error. A reading of 0.0 lux is possible (total darkness).
        if (luxReading < 0) {
            // Reading failed. Do not update member variable.
            // Flag _lightValid remains false (as set at the start).
            Serial.println("[SensorManager] ERROR: Failed to read from BH1750 sensor! Code: " + String(luxReading));

            // --- Attempt to re-initialize the sensor ---
            Serial.println("[SensorManager] Attempting to re-initialize BH1750...");
            // Ensure Wire is begun (might be redundant but safe)
            // Wire.begin(); // Usually called once in setup, might not be needed here unless I2C bus crashed hard.
            if (_lightSensor.begin(BH1750::CONTINUOUS_HIGH_RES_MODE)) {
                 Serial.println("[SensorManager] BH1750 re-initialized successfully.");
            } else {
                 Serial.println("[SensorManager] ERROR: Failed to re-initialize BH1750!");
                 // Consider if further action is needed, e.g., resetting I2C bus completely.
            }
            // --- End re-initialization attempt ---

            // Keep _lightIntensity as its previous value (or NAN if first read)
            // _lightValid remains false for this cycle.

        } else {
            // Reading successful (including 0.0), update member variable and flag.
            _lightIntensity = luxReading; // Use raw lux value
            _lightValid = true; // Set flag to true
            Serial.println("[SensorManager] Light intensity: " + String(_lightIntensity) + " lux");
        }
    }

    // Return true if all sensors have valid readings (as per original logic)
    // Note: This return value might not be as critical if individual validity flags are checked downstream.
    return _temperatureValid && _humidityValid && _lightValid;
}

float SensorManager::getTemperature() {
    return _temperature;
}

float SensorManager::getHumidity() {
    return _humidity;
}

float SensorManager::getLightIntensity() {
    return _lightIntensity;
}

bool SensorManager::isTemperatureValid() { // Changed return type to match declaration if needed
    return _temperatureValid;
}

bool SensorManager::isHumidityValid() { // Changed return type to match declaration if needed
    return _humidityValid;
}

bool SensorManager::isLightValid() { // Changed return type to match declaration if needed
    return _lightValid;
}

float SensorManager::getRandomTemperature() {
    // Generate random temperature between 20-35°C
    return 20.0 + (random(1500) / 100.0);
}

float SensorManager::getRandomHumidity() {
    // Generate random humidity between 40-90%
    return 40.0 + (random(5000) / 100.0);
}

float SensorManager::getRandomLightIntensity() {
    // Generate random light intensity between 0-10000 lux
    // Indoor light is typically 50-500 lux, outdoor shade is ~10000 lux, direct sunlight is ~100000 lux
    return random(10000);
}