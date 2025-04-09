// Main entry point for the dashboard functionality

import { POLLING_INTERVAL } from './config.js';
import { UI } from './ui.js';
import { DataManager } from './data.js';
import { SystemMonitor } from './state.js';
import { initializeControls } from './controls.js'; // Import the controls initializer

// --- Main Initialization ---
document.addEventListener('DOMContentLoaded', async function() {
    console.log("Initializing Dashboard (Modular)...");

    // Initialize UI elements and basic state
    UI.initialize();
    initializeControls(); // Initialize control event listeners
    SystemMonitor.updateConnectionStatus(false); // Start as disconnected
    UI.resetDisplay(); // Set initial UI state

    // Check for initial data passed from server (if available)
    // This assumes 'window.initialSensorData' is still set in the HTML template
    const initialData = window.initialSensorData;
    if (initialData) {
        DataManager.log("Processing initial server data:", initialData);
        // Use the main update function which handles state and UI
        DataManager.updateDashboard(initialData);
    } else {
         DataManager.log("No initial server data found.");
         UI.showError("Menunggu data dari sensor..."); // Show initial waiting message
    }

    // Start polling for updates
    setInterval(async () => {
        try {
            // Fetch data using the DataManager
            const data = await DataManager.fetchData();
            // Update the dashboard using the DataManager's orchestrator function
            // This function handles null data internally
            DataManager.updateDashboard(data);
        } catch (error) {
            // Catch unexpected errors within the interval loop itself
            console.error('Error in data update interval:', error);
            // Ensure UI reflects disconnected state on such errors
            SystemMonitor.updateConnectionStatus(false);
            UI.updateStatusSummary();
        }
    }, POLLING_INTERVAL); // Use interval from config

    console.log("Dashboard initialization complete.");
});
