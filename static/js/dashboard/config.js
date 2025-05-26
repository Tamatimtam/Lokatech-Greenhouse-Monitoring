// Shared constants for the dashboard modules

export const SECTIONS = ['penyemaian', 'remaja', 'dewasa']; // These are backend/hardware keys. Display mapping is in ui.js.
export const SENSOR_TYPES = ['temp', 'humidity', 'light'];
export const ANIMATION_DURATION = 400; // ms for number animations
export const POLLING_INTERVAL = 2000; // ms for fetching data (though WebSocket is primary now)
export const CONNECTION_TIMEOUT_DURATION = 8000; // ms to detect connection loss (increased for MQTT)

// Optimal environmental thresholds based on fuzzy logic definitions
export const THRESHOLDS = {
    temp: { low: 9, high: 31, name: "Suhu" }, 
    humidity: { low: 50, high: 85, name: "Kelembapan" }, 
    light: { dark: 150, name: "Cahaya" } 
};
