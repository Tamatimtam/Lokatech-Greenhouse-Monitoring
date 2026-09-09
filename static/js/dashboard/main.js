// Main entry point for the dashboard functionality

import { POLLING_INTERVAL } from './config.js';
import { UI } from './ui.js';
import { DataManager } from './data.js';
import { SystemMonitor } from './state.js';
import { initializeControls } from './controls.js'; // Import the controls initializer

// Load the controls CSS improvements
const loadControlsStyles = () => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/static/js/dashboard/controls-improvements.css';
    document.head.appendChild(link);
};

// --- Main Initialization ---
document.addEventListener('DOMContentLoaded', async function() {
    console.log("Initializing Dashboard (Modular)...");

    // Load custom CSS improvements
    loadControlsStyles();

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

    // --- 3D Digital Twin Simulation Integration ---
    const canvasContainer = document.getElementById('greenhouse-3d-canvas');
    if (canvasContainer && window.GreenhouseSimEngine && window.Greenhouse3D) {
        console.log("Initializing Embedded 3D Greenhouse Digital Twin...");
        const simEngine = window.SimEngine || new window.GreenhouseSimEngine();
        window.SimEngine = simEngine;
        window.greenhouseSimEngine = simEngine;

        const greenhouse3D = new window.Greenhouse3D('greenhouse-3d-canvas');
        window.greenhouse3D = greenhouse3D;

        // Set initial sun position and actuator states safely
        if (typeof greenhouse3D.setSunPosition === 'function') {
            greenhouse3D.setSunPosition(simEngine.timeOfDay);
        } else if (typeof greenhouse3D.updateCelestial === 'function') {
            greenhouse3D.updateCelestial(simEngine.timeOfDay);
        }
        if (typeof greenhouse3D.updateActuators === 'function') {
            greenhouse3D.updateActuators(simEngine.actuators);
        }

        // Time slider and timelapse controls
        const timeSlider = document.getElementById('sim-time-slider');
        const timeDisplay = document.getElementById('sim-time-display');
        const playBtn = document.getElementById('sim-play-toggle');

        const formatTime = (hours) => {
            const h = Math.floor(hours);
            const m = Math.floor((hours % 1) * 60);
            return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} WIB`;
        };

        if (timeSlider) {
            timeSlider.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                if (timeDisplay) timeDisplay.textContent = formatTime(val);
                simEngine.setTimeOfDay(val);
            });
        }

        if (playBtn) {
            playBtn.addEventListener('click', () => {
                simEngine.togglePlay();
            });
        }

        // Camera focus buttons
        document.querySelectorAll('.sim-cam-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.sim-cam-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const cam = btn.dataset.cam;
                if (typeof greenhouse3D.focusZone === 'function') {
                    greenhouse3D.focusZone(cam);
                }
            });
        });

        // Listen for simulation updates
        simEngine.onUpdate((event, data) => {
            if (event === 'telemetry') {
                if (typeof greenhouse3D.setSunPosition === 'function') {
                    greenhouse3D.setSunPosition(data.timeOfDay);
                } else if (typeof greenhouse3D.updateCelestial === 'function') {
                    greenhouse3D.updateCelestial(data.timeOfDay);
                }
                if (typeof greenhouse3D.updateActuators === 'function') {
                    greenhouse3D.updateActuators(data.actuators);
                }

                if (timeSlider && document.activeElement !== timeSlider) {
                    timeSlider.value = data.timeOfDay;
                }
                if (timeDisplay) {
                    timeDisplay.textContent = formatTime(data.timeOfDay);
                }

                // Update Dashboard gauges & node cards immediately
                DataManager.updateDashboard(data);
                SystemMonitor.updateConnectionStatus(true);
                UI.hideError();
            } else if (event === 'playState') {
                if (playBtn) {
                    playBtn.innerHTML = data.isPlaying 
                        ? '<i class="fas fa-pause"></i> Jeda Timelapse' 
                        : '<i class="fas fa-play"></i> Timelapse 24 Jam';
                    playBtn.classList.toggle('playing', data.isPlaying);
                }
            } else if (event === 'actuatorChange') {
                if (typeof greenhouse3D.handleActuatorToggle === 'function') {
                    greenhouse3D.handleActuatorToggle(data.name, data.active);
                }
            }
        });

        // Immediately populate dashboard with initial simulation telemetry
        const initialPayload = simEngine.getLatestPayload();
        DataManager.updateDashboard(initialPayload);
        SystemMonitor.updateConnectionStatus(true);
        UI.hideError();

        // Trigger initial broadcast to populate all other components
        simEngine.broadcast();
    } else {
        // Fallback for reading simulation data if 3D canvas is not rendered
        const loadSimulatedData = () => {
            try {
                const raw = localStorage.getItem('lokagrow_sim_data');
                if (raw) {
                    const simData = JSON.parse(raw);
                    DataManager.updateDashboard(simData);
                    SystemMonitor.updateConnectionStatus(true);
                    UI.hideError();
                    return true;
                }
            } catch (e) {}
            return false;
        };

        loadSimulatedData();

        window.addEventListener('storage', (e) => {
            if (e.key === 'lokagrow_sim_data') {
                loadSimulatedData();
            }
        });
    }

    console.log("Dashboard initialization complete.");
});
