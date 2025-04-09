// Manages user interactions with control elements (switches)

import { SystemMonitor } from './state.js'; // To check connection status
// Import UI potentially if we need to give feedback, though alerts might suffice for now
// import { UI } from './ui.js'; 

const ControlsManager = {
    
    async sendControlCommand(device, state) {
        console.log(`Sending command: device=${device}, state=${state}`);
        try {
            const response = await fetch('/controls/api/set_state', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    // Add CSRF token header if needed by Flask-WTF
                },
                body: JSON.stringify({ device, state })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({})); // Try to parse error, default to empty obj
                console.error(`API Error (${response.status}):`, errorData.message || 'Unknown error');
                alert(`Gagal mengirim perintah untuk ${device}: ${errorData.message || 'Error tidak diketahui'}`);
                return false; // Indicate failure
            }

            const result = await response.json();
            console.log('API Response:', result);
            // Optional: Show success feedback to user?
           // UI.showToast(`Perintah untuk ${device} terkirim.`); 
            return true; // Indicate success

        } catch (error) {
            console.error('Network or fetch error sending control command:', error);
            alert(`Gagal mengirim perintah untuk ${device}. Periksa koneksi jaringan.`);
            return false; // Indicate failure
        }
    },

    initializeListeners() {
        console.log("Initializing control listeners...");
        // Use the actual IDs used in the HTML template
        const controlConfigs = [
            { deviceName: 'fan', elementId: 'fan-switch' },
            { deviceName: 'light', elementId: 'light-switch' } // Changed ID here
        ];

        controlConfigs.forEach(config => {
            const switchElement = document.getElementById(config.elementId);
            if (switchElement) {
                switchElement.addEventListener('change', async (event) => {
                    const device = config.deviceName; // Use deviceName from config
                    const newState = event.target.checked;
                    
                    // Prevent action if not connected
                    if (!SystemMonitor.status.connected) {
                        alert(`Tidak dapat mengontrol ${device} - sistem tidak terhubung`);
                        event.target.checked = !newState; // Revert the visual state
                        return;
                    }

                    // Optimistic UI update (optional, could wait for API success)
                    // UI.updateControlsUI(); // Update UI immediately based on click? Or wait?
                    // Let's wait for API call result before potentially reverting

                    const success = await this.sendControlCommand(device, newState);

                    if (!success) {
                        // Revert switch state if API call failed
                        event.target.checked = !newState; 
                        // Maybe update UI again to be sure?
                        // UI.updateControlsUI(); 
                    } else {
                        // API call succeeded. The hardware state will eventually update via MQTT polling.
                        // We might want to immediately update the UI mode indicator to 'Manual' here
                        // though it will get corrected by the next MQTT update anyway.
                        const indicator = document.getElementById(`${device}-mode-indicator`);
                        if (indicator) {
                            indicator.textContent = '(Manual)'; // Optimistic UI update for mode
                        }
                         SystemMonitor.status.actuators[device].mode = 'manual'; // Optimistic state update
                         SystemMonitor.status.actuators[device].state = newState; // Optimistic state update
                         // UI.updateControlsUI(); // Update UI fully based on optimistic state
                    }
                });
            } else {
                console.warn(`Switch element not found with ID: ${config.elementId} (for device: ${config.deviceName})`);
            }
        });
    }
};

// Export the initialize function to be called from main.js
export function initializeControls() {
    ControlsManager.initializeListeners();
}
