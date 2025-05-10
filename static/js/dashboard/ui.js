// Manages all UI updates and interactions for the dashboard

import { SECTIONS, SENSOR_TYPES, ANIMATION_DURATION, THRESHOLDS } from './config.js'; // Import THRESHOLDS
import { SystemMonitor } from './state.js'; // Import state for status summary
import { DataManager } from './data.js'; // Import DataManager to access latest data

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
            statusContainer: document.getElementById('status-container'),
            // Add elements for switches and mode indicators
            fanSwitch: document.getElementById('fan-switch'),
            lightSwitch: document.getElementById('light-switch'),
            fanModeIndicator: document.getElementById('fan-mode-indicator'),
            lightModeIndicator: document.getElementById('light-mode-indicator'),
            // Status summary elements
            statusSummaryLine: document.getElementById('status-summary-line')
        };
        
        // Initialize the mode indicator classes
        this.initializeModeIndicators();
        
        // Initialize status details container with proper styles to prevent flickering on updates
        const detailsContainer = document.getElementById('status-details');
        if (detailsContainer) {
            // Remove any transition-related styles to prevent flickering
            detailsContainer.style.transition = 'none';
        }
        
        // Control initialization is handled in controls.js now
    },

    updateConnectionStatusUI(connected) {
        if (!this.elements.connectionStatus) return;
        this.elements.connectionStatus.className = connected ? 'connection-status online' : 'connection-status offline';
        if (this.elements.connectionIcon) {
            this.elements.connectionIcon.className = connected ? 'fas fa-check-circle' : 'fas fa-circle-exclamation';
        }
        if (this.elements.connectionText) {
            this.elements.connectionText.textContent = connected ? 'Terhubung ke Server' : 'Koneksi Server Terputus';
        }
    },

    showError(message) {
        if (this.elements.errorMessage) this.elements.errorMessage.textContent = message;
        if (this.elements.systemError) this.elements.systemError.style.display = 'block';
    },

    hideError() {
        if (this.elements.systemError) this.elements.systemError.style.display = 'none';
    },
    
    initializeModeIndicators() {
        // Apply appropriate classes to mode indicators based on text content
        ['fanModeIndicator', 'lightModeIndicator'].forEach(indicator => {
            const element = this.elements[indicator];
            if (element) {
                const mode = element.textContent.includes('Auto') ? 'auto' : 'manual';
                element.classList.remove('mode-auto', 'mode-manual');
                element.classList.add(mode === 'auto' ? 'mode-auto' : 'mode-manual');
            }
        });

        // Initialize mode toggle buttons with improved styling
        this.updateModeToggleButtons('fan');
        this.updateModeToggleButtons('light');
    },

    // New helper function to update mode toggle buttons with better styling
    updateModeToggleButtons(type) {
        const modeToggle = document.getElementById(`${type}-mode-toggle`);
        if (!modeToggle) return;

        const mode = SystemMonitor.status.actuators[type]?.mode || 'auto';
        
        // Update data attribute
        modeToggle.dataset.mode = mode;
        
        // Update text content with more concise labels
        modeToggle.textContent = mode === 'auto' ? 'Ke Mode Manual' : 'Ke Mode Auto';
        
        // Apply improved styling
        modeToggle.classList.remove('mode-auto', 'mode-manual');
        modeToggle.classList.add(`mode-${mode}`);
        
        // Ensure proper padding and margins
        modeToggle.style.padding = '6px 12px';
        modeToggle.style.margin = '5px auto';
        modeToggle.style.borderRadius = '4px';
        modeToggle.style.textAlign = 'center';
        
        // Improve visual appearance
        modeToggle.style.fontWeight = '500';
        modeToggle.style.boxShadow = '0 1px 3px rgba(0,0,0,0.12)';
        modeToggle.style.transition = 'all 0.2s ease-in-out';
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

        const formattedTarget = format(targetValue);
        if (element.textContent === formattedTarget) {
             return;
        }
        if (Math.abs(startValue - targetValue) < 0.01 && startValue !== 0) {
             element.textContent = formattedTarget;
             return;
        }

        const startTime = performance.now();

        const step = (currentTime) => {
            const elapsedTime = currentTime - startTime;
            const progress = Math.min(1, elapsedTime / duration);
            const currentValue = startValue + (targetValue - startValue) * progress;
            element.textContent = format(currentValue);

            if (progress < 1) {
                const animationId = requestAnimationFrame(step);
                this.animationStates.set(element, animationId);
            } else {
                element.textContent = format(targetValue); // Ensure final value is exact
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
            : { format: (val) => (val !== null && val !== undefined) ? val.toFixed(1) : '--' }; // Ensure format handles null
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
                : { format: (val) => (val !== null && val !== undefined) ? val.toFixed(1) : '--' };
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

    // --- Completely redesigned updateStatusSummary ---
    updateStatusSummary() {
        const summaryLine = this.elements.statusSummaryLine;
        const detailsContainer = document.getElementById('status-details');
        const fallbackContainer = this.elements.statusContainer;

        if (!summaryLine || !detailsContainer) {
            if (fallbackContainer) {
                console.warn("Using fallback statusContainer. Add status-summary-line and status-details elements to HTML for improved summary.");
                const status = SystemMonitor.status;
                let fallbackHtml = '';
                if (!status.connected) {
                    fallbackHtml = `<div class="status-item"><i class="fas fa-triangle-exclamation"></i><span>Tidak terhubung ke jaringan ESP</span></div>`;
                } else {
                    fallbackHtml = `<div class="status-item"><i class="fas fa-check-circle"></i><span>Terhubung</span></div>`;
                }
                if (fallbackContainer.innerHTML !== fallbackHtml) {
                    fallbackContainer.innerHTML = fallbackHtml;
                }
            } else {
                console.error("Status summary elements not found.");
            }
            return;
        }

        const status = SystemMonitor.status;
        let summaryText = '';
        let summaryIcon = 'fa-check-circle';
        let summaryClass = 'status-success';
        const detailMessages = [];
        let allOkOverall = true;
        
        // Store current details container HTML to check for changes
        const oldDetailsHtml = detailsContainer.innerHTML;

        if (!status.connected) {
            summaryText = 'Tidak terhubung ke jaringan ESP';
            summaryIcon = 'fa-wifi-slash';
            summaryClass = 'status-error';
            allOkOverall = false;
        } else {
            const latestData = DataManager.getLatestData();
            
            // Check if we have any data at all
            if (!latestData || !latestData.sections) {
                summaryText = 'Menunggu data dari sensor';
                summaryIcon = 'fa-spinner fa-spin';
                summaryClass = '';
                allOkOverall = false;
            } else {
                const offlineNodes = SECTIONS.filter(section => !status.nodes[section]?.online);
                if (offlineNodes.length > 0) {
                    detailMessages.push({ 
                        type: 'connection', 
                        text: `Node ${offlineNodes.map(this.translateSection).join(', ')} offline`,
                        icon: 'fa-server'
                    });
                    allOkOverall = false;
                }

                SECTIONS.forEach(section => {
                    const nodeStatus = status.nodes[section];
                    if (nodeStatus?.online) {
                        const sectionValues = latestData.sections[section];
                        const sectionName = this.translateSection(section);

                        if (!sectionValues) {
                            detailMessages.push({ 
                                type: 'connection', 
                                text: `Data untuk ${sectionName} tidak diterima`,
                                icon: 'fa-triangle-exclamation' 
                            });
                            allOkOverall = false;
                            return;
                        }

                        const failedSensors = SENSOR_TYPES.filter(type => !nodeStatus.sensors[type]);
                        if (failedSensors.length > 0) {
                            detailMessages.push({ 
                                type: 'connection', 
                                text: `Sensor ${failedSensors.map(this.translateSensor).join(', ')} di ${sectionName} bermasalah`,
                                icon: 'fa-microchip'
                            });
                            allOkOverall = false;
                        }

                        SENSOR_TYPES.forEach(type => {
                            if (nodeStatus.sensors[type] && sectionValues[type] !== null) {
                                const value = sectionValues[type];
                                const threshold = THRESHOLDS[type];
                                const sensorName = threshold.name;
                                let unit = '';
                                if (type === 'temp') unit = '°C';
                                if (type === 'humidity') unit = '%';
                                if (type === 'light') unit = ' lux';

                                let issueFound = false;
                                let messageText = '';

                                // Format the value to 1 decimal place
                                const formattedValue = type === 'light' ? Math.round(value) : value.toFixed(1);
                                
                                if (type === 'temp' && threshold.low !== undefined && value < threshold.low) {
                                    messageText = `${sensorName} ${sectionName} terlalu dingin (${formattedValue}${unit})`;
                                    detailMessages.push({ 
                                        type: 'temp', 
                                        text: messageText,
                                        icon: 'fa-temperature-low',
                                        value: formattedValue,
                                        unit: unit,
                                        section: sectionName
                                    });
                                    allOkOverall = false;
                                } else if (type === 'temp' && threshold.high !== undefined && value > threshold.high) {
                                    messageText = `${sensorName} ${sectionName} terlalu panas (${formattedValue}${unit})`;
                                    detailMessages.push({ 
                                        type: 'temp', 
                                        text: messageText,
                                        icon: 'fa-temperature-high',
                                        value: formattedValue,
                                        unit: unit,
                                        section: sectionName
                                    });
                                    allOkOverall = false;
                                } else if (type === 'humidity' && threshold.low !== undefined && value < threshold.low) {
                                    messageText = `${sensorName} ${sectionName} terlalu kering (${formattedValue}${unit})`;
                                    detailMessages.push({ 
                                        type: 'humidity', 
                                        text: messageText,
                                        icon: 'fa-droplet-slash',
                                        value: formattedValue,
                                        unit: unit,
                                        section: sectionName
                                    });
                                    allOkOverall = false;
                                } else if (type === 'humidity' && threshold.high !== undefined && value > threshold.high) {
                                    messageText = `${sensorName} ${sectionName} terlalu lembap (${formattedValue}${unit})`;
                                    detailMessages.push({ 
                                        type: 'humidity', 
                                        text: messageText,
                                        icon: 'fa-droplet',
                                        value: formattedValue,
                                        unit: unit,
                                        section: sectionName
                                    });
                                    allOkOverall = false;
                                } else if (type === 'light' && threshold.dark !== undefined && value < threshold.dark) {
                                    messageText = `${sensorName} ${sectionName} terlalu gelap (${formattedValue}${unit})`;
                                    detailMessages.push({ 
                                        type: 'light', 
                                        text: messageText,
                                        icon: 'fa-moon',
                                        value: formattedValue,
                                        unit: unit,
                                        section: sectionName
                                    });
                                    allOkOverall = false;
                                }
                            }
                        });
                    }
                });

                if (allOkOverall) {
                    summaryText = 'Semua kondisi optimal';
                    summaryIcon = 'fa-check-circle';
                    summaryClass = 'status-success';
                    
                    // Add one success message when all is well
                    detailMessages.push({ 
                        type: 'success', 
                        text: 'Semua sensor berfungsi normal',
                        icon: 'fa-check-circle'
                    });
                } else {
                    const hasConnectionErrors = detailMessages.some(msg => msg.type === 'connection');
                    if (hasConnectionErrors) {
                        summaryText = 'Masalah koneksi terdeteksi';
                        summaryIcon = 'fa-triangle-exclamation';
                        summaryClass = 'status-error';
                    } else {
                        summaryText = 'Peringatan kondisi lingkungan';
                        summaryIcon = 'fa-circle-exclamation';
                        summaryClass = '';
                    }
                }
            }
        }

        // Update summary line
        summaryLine.className = `status-item ${summaryClass}`;
        summaryLine.innerHTML = `<i class="fas ${summaryIcon}"></i><span>${summaryText}</span>`;

        // Generate details HTML with specific icons and styles for each issue type
        const detailsHtml = detailMessages.map(msg => {
            let iconClass, statusClass;
            
            switch(msg.type) {
                case 'temp':
                    iconClass = 'icon-temp';
                    statusClass = 'status-temp';
                    break;
                case 'humidity':
                    iconClass = 'icon-humidity';
                    statusClass = 'status-humidity';
                    break;
                case 'light':
                    iconClass = 'icon-light';
                    statusClass = 'status-light';
                    break;
                case 'connection':
                    iconClass = 'icon-connection';
                    statusClass = 'status-connection';
                    break;
                case 'error':
                    iconClass = 'icon-error';
                    statusClass = 'status-error';
                    break;
                case 'success':
                    iconClass = 'icon-success';
                    statusClass = 'status-success';
                    break;
                default:
                    iconClass = 'icon-error';
                    statusClass = '';
            }
            
            // Create HTML for each status item
            return `
                <div class="status-item--detail ${statusClass}" data-id="${msg.type}-${msg.section || ''}">
                    <div class="status-icon ${iconClass}">
                        <i class="fas ${msg.icon}"></i>
                    </div>
                    <span class="status-text">${msg.text}</span>
                </div>
            `;
        }).join('');

        // Only update DOM if the content has changed to prevent flickering
        if (detailsContainer.innerHTML !== detailsHtml) {
            // Use a data attribute to track which elements are already displayed
            const existingElements = {};
            detailsContainer.querySelectorAll('.status-item--detail').forEach(el => {
                const id = el.getAttribute('data-id');
                if (id) existingElements[id] = el;
            });
            
            // Parse the new HTML into a document fragment
            const template = document.createElement('template');
            template.innerHTML = detailsHtml;
            const newElements = template.content;
            
            // Clear container while preserving existing elements that will be reused
            detailsContainer.innerHTML = '';
            
            // Add the new elements, potentially reusing existing ones to prevent flicker
            newElements.querySelectorAll('.status-item--detail').forEach(el => {
                const id = el.getAttribute('data-id');
                detailsContainer.appendChild(el);
            });
        }
    },
    // --- END NEW updateStatusSummary ---

    translateSection(section) {
        const translations = { penyemaian: 'Penyemaian', peremajaan: 'Peremajaan', dewasa: 'Dewasa' };
        return translations[section] || section;
    },

    translateSensor(sensor) {
        const translations = { temp: 'suhu', humidity: 'kelembapan', light: 'cahaya' };
        return translations[sensor] || sensor;
    },

    updateControlsUI() {
        const fanState = SystemMonitor.status.actuators.fan;
        const lightState = SystemMonitor.status.actuators.light;

        if (this.elements.fanSwitch) {
            this.elements.fanSwitch.checked = fanState.state === true;
        }
        if (this.elements.fanModeIndicator) {
            this.elements.fanModeIndicator.textContent = `(${fanState.mode === 'manual' ? 'Manual' : 'Auto'})`;
            this.elements.fanSwitch?.closest('.control')?.classList.toggle('control--manual', fanState.mode === 'manual');
            
            // Update mode toggle using the improved helper function
            this.updateModeToggleButtons('fan');
        }

        if (this.elements.lightSwitch) {
            this.elements.lightSwitch.checked = lightState.state === true;
        }
        if (this.elements.lightModeIndicator) {
            this.elements.lightModeIndicator.textContent = `(${lightState.mode === 'manual' ? 'Manual' : 'Auto'})`;
            this.elements.lightSwitch?.closest('.control')?.classList.toggle('control--manual', lightState.mode === 'manual');
            
            // Update mode toggle using the improved helper function
            this.updateModeToggleButtons('light');
        }
    }
};
