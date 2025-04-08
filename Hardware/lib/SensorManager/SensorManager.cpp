#include "SensorManager.h"

SensorManager::SensorManager(int dhtPin, bool tempHumidSimulation, bool lightSimulation) 
    : _dht(dhtPin, DHT22), _lightSensor(), _dhtPin(dhtPin), 
      _tempHumidSimulationMode(tempHumidSimulation), _lightSimulationMode(lightSimulation),
      _temperature(0), _humidity(0), _lightIntensity(0),
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
        _temperature = _dht.readTemperature();
        _humidity = _dht.readHumidity();
        
        if (isnan(_temperature) || isnan(_humidity)) {
            Serial.println("[SensorManager] ERROR: Failed to read from DHT sensor!");
        } else {
            _temperatureValid = true;
            _humidityValid = true;
            Serial.println("[SensorManager] Temperature: " + String(_temperature) + "°C");
            Serial.println("[SensorManager] Humidity: " + String(_humidity) + "%");
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
        if (luxReading < 0) {
            Serial.println("[SensorManager] ERROR: Failed to read from BH1750 sensor!");
        } else {
            _lightIntensity = luxReading; // Use raw lux value
            _lightValid = true;
            Serial.println("[SensorManager] Light intensity: " + String(_lightIntensity) + " lux");
        }
    }
    
    // Return true if all sensors have valid readings
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

bool SensorManager::isTemperatureValid() {
    return _temperatureValid;
}

bool SensorManager::isHumidityValid() {
    return _humidityValid;
}

bool SensorManager::isLightValid() {
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