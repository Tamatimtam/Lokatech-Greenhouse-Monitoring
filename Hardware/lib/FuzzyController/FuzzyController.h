#ifndef FUZZY_CONTROLLER_H
#define FUZZY_CONTROLLER_H

// Forward declaration to avoid including the full eFLL header here
class Fuzzy; 

class FuzzyController {
public:
    FuzzyController();
    ~FuzzyController(); // Destructor to clean up allocated Fuzzy object

    // Initialize the fuzzy logic system (define inputs, outputs, sets, rules)
    void begin();

    // Set the crisp input values
    void setInputs(float avgTemp, float avgHumidity, float avgLight);

    // Run the fuzzy inference process
    void run();

    // Get the crisp output decisions (true = ON, false = OFF)
    bool getFanOutput() const;
    bool getLightOutput() const;

private:
    // Pointer to the main eFLL object
    Fuzzy* _fuzzy; 

    // Internal helper methods to define membership functions, rules etc.
    void defineInputs();
    void defineOutputs();
    void defineRules();

    // Store the last calculated crisp outputs
    float _crispFanOutput;
    float _crispLightOutput;

    // Store last calculated membership degrees for debugging
    float _tempMembership[3]; // Index 0: Cold, 1: Optimal, 2: Hot
    float _humidityMembership[3]; // Index 0: Dry, 1: Optimal, 2: Humid
    float _lightMembership[2]; // Index 0: Dark, 1: Adequate

public: // Add public getters for these degrees
    float getMembershipTempCold() const { return _tempMembership[0]; }
    float getMembershipTempOptimal() const { return _tempMembership[1]; }
    float getMembershipTempHot() const { return _tempMembership[2]; }
    float getMembershipHumidityDry() const { return _humidityMembership[0]; }
    float getMembershipHumidityOptimal() const { return _humidityMembership[1]; }
    float getMembershipHumidityHumid() const { return _humidityMembership[2]; }
    float getMembershipLightDark() const { return _lightMembership[0]; }
    float getMembershipLightAdequate() const { return _lightMembership[1]; }
    float getRawFanOutput() const { return _crispFanOutput; } // Getter for raw output
    float getRawLightOutput() const { return _crispLightOutput; } // Getter for raw output

private:
    // State variable for hysteresis
    mutable bool _isFanOn;
};

#endif // FUZZY_CONTROLLER_H
