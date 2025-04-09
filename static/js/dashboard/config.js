// Shared constants for the dashboard modules

export const SECTIONS = ['penyemaian', 'peremajaan', 'dewasa'];
export const SENSOR_TYPES = ['temp', 'humidity', 'light'];
export const ANIMATION_DURATION = 400; // ms for number animations
export const POLLING_INTERVAL = 2000; // ms for fetching data
export const CONNECTION_TIMEOUT_DURATION = 11000; // ms to detect connection loss

// Optimal environmental thresholds based on fuzzy logic definitions
export const THRESHOLDS = {
    temp: { low: 27, high: 29, name: "Suhu" }, // °C - Optimal range from 27-29
    humidity: { low: 75, high: 95, name: "Kelembapan" }, // % - Optimal range with peak at 85, zero at 75 and 95
    light: { dark: 280, name: "Cahaya" } // lux - below 150 is considered dark
};
