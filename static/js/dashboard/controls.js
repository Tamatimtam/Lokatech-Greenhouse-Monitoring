// Manages user interactions with control elements (switches)

import { SystemMonitor } from './state.js'; // To check connection status
// Import UI potentially if we need to give feedback, though alerts might suffice for now
// import { UI } from './ui.js'; 

const ControlsManager = {
    // Device cooldown management
    cooldowns: {
        fan: {
            active: false,
            timeout: null,
            durationMs: 3000 // 3 seconds cooldown for fan
        },
        light: {
            active: false,
            timeout: null,
            durationMs: 3000 // 3 seconds cooldown for light
        }
    },
    
    async sendControlCommand(device, state, mode = "manual") {
        console.log(`Sending command: device=${device}, state=${state}, mode=${mode}`);
        // Additional debug logging:
        console.log(`DEBUG: Command data types - device(${typeof device}), state(${typeof state}), mode(${typeof mode})`);
        
        try {
            // Prepare the body with exact values to verify what's being sent
            const body = JSON.stringify({ 
                device, 
                state, 
                mode 
            });
            
            console.log('DEBUG: Raw JSON being sent:', body);
            console.log('DEBUG: Parsed back for verification:', JSON.parse(body));
            
            const response = await fetch('/dashboard/controls/api/set_state', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    // Add CSRF token header if needed by Flask-WTF
                },
                body
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

    activateCooldown(device) {
        // Set cooldown status
        const cooldown = this.cooldowns[device];
        if (!cooldown) return;

        cooldown.active = true;
        
        // Add visual indicator to show cooldown
        const switchEl = document.getElementById(`${device}-switch`);
        if (switchEl) {
            switchEl.classList.add('cooling-down');
            switchEl.disabled = true;
            
            // Create or update cooldown progress bar
            let cooldownProgress = document.getElementById(`${device}-cooldown-progress`);
            if (!cooldownProgress) {
                cooldownProgress = document.createElement('div');
                cooldownProgress.id = `${device}-cooldown-progress`;
                cooldownProgress.className = 'cooldown-progress';
                const controlActionsDiv = switchEl.closest('.control__actions');
                if (controlActionsDiv) {
                    controlActionsDiv.appendChild(cooldownProgress);
                } else {
                    switchEl.parentNode.appendChild(cooldownProgress);
                }
            }
            
            // Reset width and start animation
            cooldownProgress.style.width = '100%';
            
            // Add tooltip to provide user feedback
            const switchContainer = switchEl.closest('.switch-container') || switchEl.parentNode;
            if (switchContainer) {
                switchContainer.classList.add('tooltip');
                let tooltip = switchContainer.querySelector('.tooltip-text');
                if (!tooltip) {
                    tooltip = document.createElement('span');
                    tooltip.className = 'tooltip-text';
                    switchContainer.appendChild(tooltip);
                }
                tooltip.textContent = 'Sedang diproses...';
            }
        }

        // Clear any existing timeout
        if (cooldown.timeout) {
            clearTimeout(cooldown.timeout);
        }
        
        // Set timeout to reset cooldown
        const startTime = Date.now();
        const duration = cooldown.durationMs;
        
        // Create animation for progress bar
        const animateCooldown = () => {
            const elapsedTime = Date.now() - startTime;
            const remainingTime = Math.max(0, duration - elapsedTime);
            const progress = (remainingTime / duration) * 100;
            
            const cooldownProgress = document.getElementById(`${device}-cooldown-progress`);
            if (cooldownProgress) {
                cooldownProgress.style.width = progress + '%';
            }
            
            if (remainingTime > 0) {
                window.requestAnimationFrame(animateCooldown);
            }
        };
        
        window.requestAnimationFrame(animateCooldown);
        
        cooldown.timeout = setTimeout(() => {
            this.clearCooldown(device);
        }, cooldown.durationMs);
    },

    clearCooldown(device) {
        const cooldown = this.cooldowns[device];
        if (!cooldown) return;

        cooldown.active = false;
        
        // Remove visual indicators
        const switchEl = document.getElementById(`${device}-switch`);
        if (switchEl) {
            switchEl.classList.remove('cooling-down');
            switchEl.disabled = false;
            
            // Remove tooltip class and text
            const switchContainer = switchEl.closest('.switch-container') || switchEl.parentNode;
            if (switchContainer) {
                const tooltip = switchContainer.querySelector('.tooltip-text');
                if (tooltip) {
                    tooltip.textContent = '';
                }
            }
        }
        
        // Remove progress bar with a fade-out effect
        const cooldownProgress = document.getElementById(`${device}-cooldown-progress`);
        if (cooldownProgress) {
            cooldownProgress.style.transition = 'opacity 0.3s ease';
            cooldownProgress.style.opacity = '0';
            
            setTimeout(() => {
                if (cooldownProgress.parentNode) {
                    cooldownProgress.parentNode.removeChild(cooldownProgress);
                }
            }, 300);
        }
    },

    isOnCooldown(device) {
        return this.cooldowns[device] && this.cooldowns[device].active;
    },

    initializeListeners() {
        console.log("Initializing control listeners...");
        
        // Use the actual IDs used in the HTML template
        const controlConfigs = [
            { deviceName: 'fan', elementId: 'fan-switch' },
            { deviceName: 'light', elementId: 'light-switch' }
        ];

        controlConfigs.forEach(config => {
            const { deviceName, elementId } = config;
            const switchElement = document.getElementById(elementId);
            
            if (switchElement) {
                // Create mode toggle link
                const toggleContainer = document.createElement('div');
                toggleContainer.className = 'control-mode-toggle';
                toggleContainer.id = `${deviceName}-mode-toggle`;
                toggleContainer.textContent = 'Alihkan ke Mode Auto';
                toggleContainer.dataset.mode = 'manual'; // Start assuming we're in manual mode when user interacts
                toggleContainer.title = 'Klik untuk mengubah mode kontrol';
                
                // Get the parent control div and append button to it properly
                const controlDiv = switchElement.closest('.control');
                if (controlDiv) {
                    // Create a container for switch and mode toggle
                    const controlActionsDiv = document.createElement('div');
                    controlActionsDiv.className = 'control__actions';
                    controlActionsDiv.style.display = 'flex';
                    controlActionsDiv.style.flexDirection = 'column';
                    controlActionsDiv.style.alignItems = 'flex-end';
                    
                    // Create a better container for the switch with tooltip capabilities
                    const switchContainer = document.createElement('div');
                    switchContainer.className = 'switch-container';
                    switchContainer.style.position = 'relative';
                    
                    // Move the switch into this container
                    const switchLabel = switchElement.parentNode;
                    switchContainer.appendChild(switchLabel);
                    
                    // Add the switch container to the actions div
                    controlActionsDiv.appendChild(switchContainer);
                    
                    // Add the toggle to the container
                    controlActionsDiv.appendChild(toggleContainer);
                    
                    // Add the container to the control
                    controlDiv.appendChild(controlActionsDiv);
                } else {
                    // Fallback to previous method if .control not found
                    switchElement.parentNode.appendChild(toggleContainer);
                }
                
                // Add event listener for mode toggle
                toggleContainer.addEventListener('click', async (event) => {
                    if (this.isOnCooldown(deviceName)) {
                        return; // Ignore clicks during cooldown
                    }
                    
                    const currentMode = event.target.dataset.mode;
                    const newMode = currentMode === 'auto' ? 'manual' : 'auto';
                    
                    // Update UI ahead of server response (optimistic)
                    event.target.dataset.mode = newMode;
                    event.target.textContent = newMode === 'auto' 
                        ? 'Alihkan ke Mode Manual' 
                        : 'Alihkan ke Mode Auto';
                        
                    // Update indicator immediately
                    const indicator = document.getElementById(`${deviceName}-mode-indicator`);
                    if (indicator) {
                        indicator.textContent = `(${newMode === 'auto' ? 'Auto' : 'Manual'})`;
                    }
                    
                    // Apply cooldown
                    this.activateCooldown(deviceName);
                    
                    // Send command to server
                    const success = await this.sendControlCommand(
                        deviceName, 
                        switchElement.checked, // Current switch state 
                        newMode
                    );
                    
                    if (success) {
                        // Update our state tracking
                        SystemMonitor.status.actuators[deviceName].mode = newMode;
                    } else {
                        // Revert UI on failure
                        event.target.dataset.mode = currentMode;
                        event.target.textContent = currentMode === 'auto' 
                            ? 'Alihkan ke Mode Manual' 
                            : 'Alihkan ke Mode Auto';
                        
                        if (indicator) {
                            indicator.textContent = `(${currentMode})`;
                        }
                    }
                });

                // Add switch event listener
                switchElement.addEventListener('change', async (event) => {
                    const device = deviceName;
                    const newState = event.target.checked;
                    
                    // Prevent action if not connected
                    if (!SystemMonitor.status.connected) {
                        alert(`Tidak dapat mengontrol ${device} - sistem tidak terhubung`);
                        event.target.checked = !newState; // Revert the visual state
                        return;
                    }
                    
                    // Check for cooldown
                    if (this.isOnCooldown(device)) {
                        event.target.checked = !newState; // Revert the visual state
                        return;
                    }
                    
                    // Apply cooldown immediately
                    this.activateCooldown(device);

                    // Send command with manual mode explicitly set
                    const success = await this.sendControlCommand(device, newState, "manual");

                    if (!success) {
                        // Revert switch state if API call failed
                        event.target.checked = !newState; 
                    } else {
                        // API call succeeded. Update UI elements
                        const indicator = document.getElementById(`${device}-mode-indicator`);
                        if (indicator) {
                            indicator.textContent = '(Manual)';
                        }
                        
                        // Update toggle button
                        const toggle = document.getElementById(`${device}-mode-toggle`);
                        if (toggle) {
                            toggle.dataset.mode = 'manual';
                            toggle.textContent = 'Alihkan ke Mode Auto';
                        }
                        
                        // Update state tracker
                        SystemMonitor.status.actuators[device].mode = 'manual';
                        SystemMonitor.status.actuators[device].state = newState;
                    }
                });
                
                // Initialize toggle text based on current mode
                const currentMode = SystemMonitor.status.actuators[deviceName]?.mode || 'auto';
                const toggle = document.getElementById(`${deviceName}-mode-toggle`);
                if (toggle) {
                    toggle.dataset.mode = currentMode;
                    toggle.textContent = currentMode === 'auto' 
                        ? 'Alihkan ke Mode Manual' 
                        : 'Alihkan ke Mode Auto';
                }
            } else {
                console.warn(`Switch element not found with ID: ${elementId} (for device: ${deviceName})`);
            }
        });
    }
};

// Export the initialize function to be called from main.js
export function initializeControls() {
    ControlsManager.initializeListeners();
}
