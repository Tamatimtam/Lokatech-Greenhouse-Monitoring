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

    // Initial data processing removed - data will come via WebSocket
    // const initialData = window.initialSensorData;
    // if (initialData) { ... }

    // Modify initial state display
    UI.showError("Menyambungkan ke server..."); // Show connecting message initially

    // --- WebSocket Connection and Event Handling ---
    console.log("Attempting to connect WebSocket...");
    const socket = io(); // Connect to the server hosting the page

    socket.on('connect', () => {
        console.log('WebSocket Connected! SID:', socket.id);
        SystemMonitor.updateConnectionStatus(true); // Update state/UI
        // Optional: Request initial data if needed, though relying on first 'sensor_update' is simpler
        // socket.emit('request_initial_data'); // If you implement this on backend
        UI.hideError(); // Hide any initial error messages
    });

    socket.on('disconnect', (reason) => {
        console.log('WebSocket Disconnected:', reason);
        SystemMonitor.updateConnectionStatus(false); // Update state/UI
        UI.showError("Koneksi ke server terputus. Mencoba menyambung ulang..."); // Show specific error
        // UI.resetDisplay(); // Optionally reset UI on disconnect
    });

    socket.on('connect_error', (error) => {
        console.error('WebSocket Connection Error:', error);
        SystemMonitor.updateConnectionStatus(false);
        UI.showError("Gagal terhubung ke server WebSocket.");
    });

    // Listen for sensor data updates from the server
    socket.on('sensor_update', (data) => {
        DataManager.log('Received sensor_update via WebSocket:', data);
        // Use the existing DataManager function to process and update UI
        DataManager.updateDashboard(data);
        // Update connection status on successful data receipt
        SystemMonitor.updateConnectionStatus(true);
    });

    // Polling interval removed
    // setInterval(async () => { ... }, POLLING_INTERVAL);

    console.log("Dashboard initialization complete, WebSocket connection initiated.");
});
