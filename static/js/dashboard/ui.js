// Manages all UI updates and interactions for the dashboard

import { SECTIONS, SENSOR_TYPES, ANIMATION_DURATION } from './config.js';
import { SystemMonitor } from './state.js'; // Import state for status summary

export const UI = {
    elements: {}, // Populated in initialize
    animationStates: new Map(), // Store animation state for elements

    initialize() {
        this.elements = {
            connectionStatus: document.getElementById('connection-status'),
            connectionText: document.getElementById('connection-status')?.querySelector('span'),
            connectionIcon: document.getElementById('connection-status')?.querySelector('i'),
            systemError: document.getElementById('system-error'),
            errorMessage: document.getElementById('error-message'),
            statusContainer: document.getElementById('status-container')
        };
        // Note: Control initialization might move to main.js or a dedicated controls module later
        this.initializeControls();
    },

    updateConnectionStatusUI(connected) {
        if (!this.elements.connectionStatus) return;
        this.elements.connectionStatus.className = connected ? 'connection-status online' : 'connection-status offline';
        if (this.elements.connectionIcon) {
            this.elements.connectionIcon.className = connected ? 'fas fa-check-circle' : 'fas fa-circle-exclamation';
        }
        if (this.elements.connectionText) {
            this.elements.connectionText.textContent = connected ? 'Sistem IoT Terhubung' : 'Sistem IoT Tidak terhubung';
        }
    },

    showError(message) {
        if (this.elements.errorMessage) this.elements.errorMessage.textContent = message;
        if (this.elements.systemError) this.elements.systemError.style.display = 'block';
    },

    hideError() {
        if (this.elements.systemError) this.elements.systemError.style.display = 'none';
    },

    // Helper function to animate numeric values
    animateValue(element, targetValue, options = {}) {
        if (!element) return;

        const { duration = ANIMATION_DURATION, format = (val) => val.toLocaleString() } = options;
        const defaultValue = '--';

        // Clear existing animation for this element
        const existingAnimationId = this.animationStates.get(element);
        if (existingAnimationId) {
            cancelAnimationFrame(existingAnimationId);
            this.animationStates.delete(element);
        }

        if (targetValue === null || targetValue === undefined) {
            element.textContent = defaultValue;
            return;
        }

        const startValueText = element.textContent;
        let startValue = parseFloat(startValueText.replace(/,/g, ''));
        if (isNaN(startValue) || startValueText === defaultValue) {
            startValue = 0;
        }

        // If start and target are effectively the same (considering formatting), set text and return
        // Use formatted target for comparison to avoid unnecessary animations if only formatting changes
        const formattedTarget = format(targetValue);
        if (element.textContent === formattedTarget) {
             // console.log(`Skipping animation for ${element.id || element.className}: value ${targetValue} already displayed.`);
             return;
        }
        // Also check if numeric values are extremely close
        if (Math.abs(startValue - targetValue) < 0.01 && startValue !== 0) {
             element.textContent = formattedTarget;
             // console.log(`Skipping animation for ${element.id || element.className}: value ${targetValue} very close to ${startValue}.`);
             return;
        }


        const startTime = performance.now();

        const step = (currentTime) => {
            const elapsedTime = currentTime - startTime;
            const progress = Math.min(1, elapsedTime / duration);
            // Linear interpolation
            const currentValue = startValue + (targetValue - startValue) * progress;

            // Apply formatting during animation - round appropriately based on format function
            // This assumes format function handles rounding (like toFixed or Math.round)
            element.textContent = format(currentValue);

            if (progress < 1) {
                const animationId = requestAnimationFrame(step);
                this.animationStates.set(element, animationId);
            } else {
                // Ensure final value is exact and formatted
                element.textContent = format(targetValue);
                this.animationStates.delete(element);
            }
        };

        const animationId = requestAnimationFrame(step);
        this.animationStates.set(element, animationId);
    },

    resetDisplay() {
        this.updateGauge('temperature-gauge', null, 100, '#ccc');
        this.updateGauge('humidity-gauge', null, 100, '#ccc');
        this.updateGauge('light-gauge', null, 10000, '#ccc');

        SECTIONS.forEach(section => {
            SENSOR_TYPES.forEach(type => {
                this.updateSectionDisplay(section, type, null, 'minus');
            });
        });

        this.updateStatusSummary();
    },

    updateGauge(id, value, max, color) {
        const gaugeElement = document.getElementById(id);
        if (!gaugeElement) return;

        const circle = gaugeElement.querySelector('.svg-circle');
        const valueDisplay = gaugeElement.querySelector('.value');

        const formatOptions = (id === 'light-gauge')
            ? { format: (val) => Math.round(val).toLocaleString() }
            : { format: (val) => val.toFixed(1) };
        this.animateValue(valueDisplay, value, formatOptions);

        if (value !== null && value !== undefined) {
            circle.style.stroke = color;
            const circumference = 2 * Math.PI * 54;
            const clampedValue = Math.max(0, Math.min(value, max));
            const offset = circumference - ((clampedValue / max) * circumference);
            circle.style.strokeDasharray = `${circumference} ${circumference}`;
            circle.style.strokeDashoffset = offset;
        } else {
            circle.style.stroke = '#ccc';
            const circumference = 2 * Math.PI * 54;
            circle.style.strokeDasharray = `${circumference} ${circumference}`;
            circle.style.strokeDashoffset = circumference;
        }
    },

    updateSectionDisplay(section, type, value, trend) {
        const elements = document.querySelectorAll(`[data-section="${section}"][data-type="${type}"]`);
        elements.forEach(el => {
            const valueElement = el.querySelector('.section-value');
            const indicatorElement = el.querySelector('.section-indicator i');

            const formatOptions = (type === 'light')
                ? { format: (val) => Math.round(val).toLocaleString() }
                : { format: (val) => val.toFixed(1) };
            this.animateValue(valueElement, value, formatOptions);

            if (value !== null && value !== undefined && trend) {
                indicatorElement.className = `fas fa-${trend || 'minus'}`;
                el.classList.remove('sensor-error', 'sensor-offline');
            } else {
                indicatorElement.className = 'fas fa-circle-exclamation';
                el.classList.add('sensor-error');
                el.classList.remove('sensor-offline');
            }
        });
    },

    updateStatusSummary() {
        if (!this.elements.statusContainer) return;
        const status = SystemMonitor.status; // Get current status from state module
        let html = '';

        if (!status.connected) {
            html = `<div class="status-item"><i class="fas fa-triangle-exclamation" style="color: #e74c3c"></i><span>Tidak terhubung ke jaringan ESP</span></div>`;
        } else {
            let allOk = true;
            const offlineNodes = [];
            const sensorIssues = [];

            SECTIONS.forEach(section => {
                const nodeStatus = status.nodes[section];
                if (!nodeStatus.online) {
                    offlineNodes.push(this.translateSection(section));
                    allOk = false;
                } else {
                    const failedSensors = SENSOR_TYPES
                        .filter(type => !nodeStatus.sensors[type])
                        .map(type => this.translateSensor(type));

                    if (failedSensors.length > 0) {
                        sensorIssues.push(`Sensor ${failedSensors.join(', ')} di ${this.translateSection(section)} bermasalah`);
                        allOk = false;
                    }
                }
            });

            if (offlineNodes.length > 0) {
                html += `<div class="status-item"><i class="fas fa-circle-exclamation" style="color: #e74c3c"></i><span>Node ${offlineNodes.join(', ')} offline</span></div>`;
            }
            sensorIssues.forEach(issue => {
                html += `<div class="status-item"><i class="fas fa-triangle-exclamation" style="color: #f39c12"></i><span>${issue}</span></div>`;
            });

            if (allOk) {
                html = `<div class="status-item"><i class="fas fa-check-circle" style="color: #27ae60"></i><span>Semua sistem bekerja normal</span></div>`;
            }
        }
        // Only update if content changed to avoid unnecessary redraws
        if (this.elements.statusContainer.innerHTML !== html) {
             this.elements.statusContainer.innerHTML = html;
        }
    },

    translateSection(section) {
        const translations = { penyemaian: 'Penyemaian', peremajaan: 'Peremajaan', dewasa: 'Dewasa' };
        return translations[section] || section;
    },

    translateSensor(sensor) {
        const translations = { temp: 'suhu', humidity: 'kelembapan', light: 'cahaya' };
        return translations[sensor] || sensor;
    },

    // This might move later if controls become more complex
    initializeControls() {
        ['fan-switch', 'lights-switch'].forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.addEventListener('change', function() {
                    // Use SystemMonitor from state module to check connection
                    if (!SystemMonitor.status.connected) {
                        alert(`Tidak dapat mengontrol ${id === 'fan-switch' ? 'kipas' : 'lampu'} - sistem tidak terhubung`);
                        this.checked = !this.checked; // Revert the switch state
                        return;
                    }
                    // TODO: Add actual API call here
                    console.log(`${id === 'fan-switch' ? 'Kipas exhaust' : 'Lampu'} diubah:`, this.checked);
                });
            }
        });
    }
};
