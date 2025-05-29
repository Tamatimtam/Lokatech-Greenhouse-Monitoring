document.addEventListener('DOMContentLoaded', function() {
    const systemLogContent = document.getElementById('tab-system');
    const defaultMaxLogEntries = 500; // Default maximum logs to display
    let systemLogs = [];
    let isLoading = false;
    let autoRefreshIntervalId = null;

    // Initial logs loading
    if (systemLogContent && systemLogContent.classList.contains('active')) {
        loadSystemLogs();
        startAutoRefresh();
    }


    // Listen for tab changes to start/stop auto-refresh
    // This assumes your main logs.js or tab handling script might emit custom events or you can observe class changes.
    // For simplicity, we'll check if the tab is active when it's supposed to load.
    // A more robust solution would involve a shared event bus or callbacks from the tab switching logic.
    const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            if (mutation.attributeName === 'class') {
                const isActive = systemLogContent.classList.contains('active');
                if (isActive && !autoRefreshIntervalId) {
                    loadSystemLogs(); // Load logs if tab becomes active and not already loading
                    startAutoRefresh();
                } else if (!isActive && autoRefreshIntervalId) {
                    stopAutoRefresh();
                }
            }
        });
    });

    if (systemLogContent) {
        observer.observe(systemLogContent, { attributes: true });
    }


    function startAutoRefresh() {
        if (autoRefreshIntervalId) clearInterval(autoRefreshIntervalId); // Clear existing interval
        autoRefreshIntervalId = setInterval(() => {
            // Only refresh if the tab is currently active
            if (systemLogContent && systemLogContent.classList.contains('active')) {
                const filters = getCurrentFilters();
                loadSystemLogs(filters, true); // true for silent refresh
            }
        }, 300000); // Refresh every 5 minutes
    }

    function stopAutoRefresh() {
        if (autoRefreshIntervalId) {
            clearInterval(autoRefreshIntervalId);
            autoRefreshIntervalId = null;
        }
    }

    function getCurrentFilters() {
        const daysFilterEl = document.getElementById('logDaysFilter');
        const typeFilterEl = document.getElementById('logTypeFilter');
        const levelFilterEl = document.getElementById('logLevelFilter');
        const nodeFilterEl = document.getElementById('logNodeFilter');

        return {
            days: daysFilterEl ? parseInt(daysFilterEl.value, 10) : 7,
            type: typeFilterEl ? typeFilterEl.value : null,
            level: levelFilterEl ? levelFilterEl.value : null,
            node: nodeFilterEl ? nodeFilterEl.value : null,
            limit: defaultMaxLogEntries
        };
    }

    function loadSystemLogs(filters = getCurrentFilters(), silentRefresh = false) {
        if (isLoading && !silentRefresh) return; // Prevent multiple simultaneous requests unless silent

        isLoading = true;
        if (systemLogContent && !silentRefresh) {
            // Show loading indicator only for manual loads/refreshes
            const existingLoadingIndicator = systemLogContent.querySelector('.loading-indicator');
            if (!existingLoadingIndicator && !systemLogContent.querySelector('.system-log-controls')) { // Check if controls are not yet rendered
                systemLogContent.innerHTML = `
                    <div class="loading-indicator">
                        <i class="fas fa-spinner fa-spin"></i> Loading system logs...
                    </div>
                `;
            }
        }

        const params = new URLSearchParams({
            days: filters.days || 7,
            limit: filters.limit || defaultMaxLogEntries
        });

        if (filters.type) params.append('type', filters.type);
        if (filters.level) params.append('level', filters.level);
        if (filters.node) params.append('node', filters.node);

        fetch(`/logs/system-logs?${params.toString()}`)
            .then(response => {
                if (!response.ok) {
                    return response.json().then(err => { throw new Error(`Server error: ${err.error || response.statusText}`) });
                }
                return response.json();
            })
            .then(data => {
                systemLogs = data;
                if (!silentRefresh || !document.getElementById('system-log-tbody')) { // Full render if not silent or table not exists
                    displaySystemLogsUI();
                } else { // Just update table body for silent refresh
                    populateTableBody();
                }
                restoreFilterSelections(filters);
            })
            .catch(error => {
                console.error('Error fetching system logs:', error);
                if (systemLogContent && !silentRefresh) {
                    // Preserve export button if it exists by selecting its container
                    const exportBtnContainer = systemLogContent.querySelector('.system-log-export-container');
                    const exportBtnHtmlOnError = exportBtnContainer ? exportBtnContainer.outerHTML : `
                        <div class="system-log-export-container">
                            <button id="exportSystemLogsCsvBtn" class="log-control-btn" title="Export current view of system logs to CSV">
                                <i class="fas fa-file-csv"></i> Export System Logs to CSV
                            </button>
                        </div>`;

                    systemLogContent.innerHTML = `
                        ${exportBtnHtmlOnError}
                        <div class="alert alert-danger">
                            <i class="fas fa-exclamation-circle"></i>
                            Error loading system logs: ${error.message}
                            <button id="retryLogsBtn" class="log-control-btn">
                                <i class="fas fa-redo"></i> Retry
                            </button>
                        </div>
                    `;
                    const retryBtn = document.getElementById('retryLogsBtn');
                    if (retryBtn) {
                        retryBtn.addEventListener('click', () => loadSystemLogs(filters));
                    }
                    // Re-attach event listener for export button if it was re-rendered
                    const newExportBtn = document.getElementById('exportSystemLogsCsvBtn');
                    if (newExportBtn) {
                        newExportBtn.addEventListener('click', handleExportSystemLogs); // Ensure this function exists or is correctly named
                    }
                }
            })
            .finally(() => {
                isLoading = false;
                const refreshBtn = document.getElementById('refreshLogsBtn');
                if (refreshBtn) {
                    refreshBtn.disabled = false;
                    refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh';
                }
            });
    }

    function restoreFilterSelections(filters) {
        if (!filters || Object.keys(filters).length === 0) return;
        
        const daysFilterEl = document.getElementById('logDaysFilter');
        const typeFilterEl = document.getElementById('logTypeFilter');
        const levelFilterEl = document.getElementById('logLevelFilter');
        const nodeFilterEl = document.getElementById('logNodeFilter');
        
        if (daysFilterEl && filters.days) daysFilterEl.value = filters.days;
        if (typeFilterEl && filters.type) typeFilterEl.value = filters.type;
        if (levelFilterEl && filters.level) levelFilterEl.value = filters.level;
        if (nodeFilterEl && filters.node) nodeFilterEl.value = filters.node;
    }

    // Add helper function to translate node names for display
    function translateNodeNameForDisplay(nodeName) {
        if (!nodeName) return '—';
        switch (nodeName.toLowerCase()) {
            case 'remaja':
                return 'Meja Apung';
            case 'penyemaian':
                return 'Peremajaan';
            case 'dewasa':
                return 'Dewasa';
            case 'server':
                return 'Server';
            default:
                return nodeName.charAt(0).toUpperCase() + nodeName.slice(1);
        }
    }

    function displaySystemLogsUI() {
        if (!systemLogContent) {
            console.error('System Log content area (tab-system) not found.');
            return;
        }

        // Preserve or define the export button HTML
        let exportBtnContainer = systemLogContent.querySelector('.system-log-export-container');
        const exportBtnHtml = `
        <div class="system-log-export-container">
            <button id="exportSystemLogsCsvBtn" class="log-control-btn" title="Export current view of system logs to CSV">
                <i class="fas fa-file-csv"></i> Export System Logs to CSV
            </button>
        </div>`;
        
        const finalExportBtnHtml = exportBtnContainer ? exportBtnContainer.outerHTML : exportBtnHtml;

        systemLogContent.innerHTML = `
            ${finalExportBtnHtml} 
            <div class="system-log-controls">
                <button id="refreshLogsBtn" class="log-control-btn">
                    <i class="fas fa-sync-alt"></i> Refresh
                </button>
                <label for="logDaysFilter">Days: </label>
                <input type="number" id="logDaysFilter" value="7" min="1" max="90" class="log-input">
                <label for="logTypeFilter">Type: </label>
                <select id="logTypeFilter" class="log-input">
                    <option value="">All Types</option>
                    <option value="SENSOR_ERROR">Sensor Error</option>
                    <option value="SENSOR_OPERATIONAL">Sensor Operational</option>
                    <option value="CONNECTION_LOST">Connection Lost</option>
                    <option value="CONNECTION_RESTORED">Connection Restored</option>
                    <option value="FAN_ON_AUTO">Fan On (Auto)</option>
                    <option value="FAN_OFF_AUTO">Fan Off (Auto)</option>
                    <option value="LIGHT_ON_AUTO">Light On (Auto)</option>
                    <option value="LIGHT_OFF_AUTO">Light Off (Auto)</option>
                    <option value="NODE_OFFLINE">Node Offline</option>
                    <option value="NODE_ONLINE">Node Online</option>
                    <!-- User-specific log types removed from system logs filter -->
                </select>
                <label for="logLevelFilter">Level: </label>
                <select id="logLevelFilter" class="log-input">
                    <option value="">All Levels</option>
                    <option value="INFO">Info</option>
                    <option value="WARNING">Warning</option>
                    <option value="ERROR">Error</option>
                    <option value="CRITICAL">Critical</option>
                </select>
                <label for="logNodeFilter">Node: </label>
                <select id="logNodeFilter" class="log-input">
                    <option value="">All Nodes</option>
                    <option value="penyemaian">Peremajaan</option>
                    <option value="remaja">Meja Apung</option>
                    <option value="dewasa">Dewasa</option>
                    <option value="server">Server</option>
                    <!-- Add other relevant nodes if any -->
                </select>
                <span id="logCountDisplay" class="log-count"></span>
            </div>
            <div class="system-log-entries-table-container">
                <table class="system-log-table">
                    <thead>
                        <tr>
                            <th>Timestamp (WIB)</th>
                            <th>Level</th>
                            <th>Type</th>
                            <th>Node</th>
                            <th>Source</th>
                            <!-- <th>User</th> Removed User column -->
                            <th>Details</th>
                        </tr>
                    </thead>
                    <tbody id="system-log-tbody">
                        <!-- Rows will be populated here -->
                    </tbody>
                </table>
            </div>
        `;
        
        populateTableBody();
        addEventListenersToControls();
    }

    function populateTableBody() {
        const tbody = document.getElementById('system-log-tbody');
        if (!tbody) return;

        tbody.innerHTML = ''; // Clear existing rows
        if (systemLogs.length === 0) {
            // Adjusted colspan to 6 due to 6 columns total
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No system logs found for the selected criteria.</td></tr>';
        } else {            
            let previousLogTimestampWIB = null;
            let currentTimeGroup = null;
            
            systemLogs.forEach((log, index) => {
                const currentLogTimestampWIB = log.timestamp_wib ? new Date(log.timestamp_wib) : (log.timestamp ? new Date(log.timestamp) : null);
                
                // Check if we need a new time group header
                if (currentLogTimestampWIB) {
                    const logHour = currentLogTimestampWIB.getHours();
                    const logDate = currentLogTimestampWIB.getDate();
                    const logMonth = currentLogTimestampWIB.getMonth();
                    const logYear = currentLogTimestampWIB.getFullYear();
                    const minuteGroup = Math.floor(currentLogTimestampWIB.getMinutes() / 10) * 10; // Round to nearest 10 minutes
                    
                    // Format: "YYYY-MM-DD HH:MM" with the minute rounded to the nearest 10
                    const timeGroupKey = `${logYear}-${logMonth+1}-${logDate} ${logHour}:${minuteGroup.toString().padStart(2, '0')}`;
                    
                    // If this is a new time group, add a header
                    if (currentTimeGroup !== timeGroupKey) {
                        currentTimeGroup = timeGroupKey;
                        
                        // Create time group header
                        const formatter = new Intl.DateTimeFormat('id-ID', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                        });
                        
                        const headerRow = document.createElement('tr');
                        // Adjusted colspan to 6
                        headerRow.innerHTML = `<td colspan="6" class="time-group-header">
                            <i class="fas fa-clock"></i> ${formatter.format(currentLogTimestampWIB)} - ${formatter.format(new Date(currentLogTimestampWIB.getTime() + 10*60000))}
                        </td>`;
                        tbody.appendChild(headerRow);
                    }
                }
                
                // Add the log row (no need for isNewIntervalStart flag anymore)
                tbody.appendChild(createLogRow(log));
                previousLogTimestampWIB = currentLogTimestampWIB;
            });
        }
        updateLogCount();
    }
    
    function updateLogCount() {
        const logCountDisplay = document.getElementById('logCountDisplay');
        if (logCountDisplay) {
            logCountDisplay.textContent = `${systemLogs.length} logs`;
        }
    }

    function addEventListenersToControls() {
        const refreshBtn = document.getElementById('refreshLogsBtn');
        const daysFilterEl = document.getElementById('logDaysFilter');
        const typeFilterEl = document.getElementById('logTypeFilter');
        const levelFilterEl = document.getElementById('logLevelFilter');
        const nodeFilterEl = document.getElementById('logNodeFilter');
        const exportCsvBtn = document.getElementById('exportSystemLogsCsvBtn'); // Ensure this ID is correct

        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                refreshBtn.disabled = true;
                refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refreshing...';
                const filters = getCurrentFilters();
                loadSystemLogs(filters); // applyFilters will call loadSystemLogs
            });
        }

        [daysFilterEl, typeFilterEl, levelFilterEl, nodeFilterEl].forEach(filterEl => {
            if (filterEl) {
                filterEl.addEventListener('change', () => {
                    const filters = getCurrentFilters();
                    loadSystemLogs(filters);
                });
            }
        });

        if (exportCsvBtn) {
            exportCsvBtn.addEventListener('click', handleExportSystemLogs); // Ensure this function exists or is correctly named
        }
    }

    // Helper function for handling CSV export - ensure it's defined
    function handleExportSystemLogs() {
        const filters = getCurrentFilters();
        const params = new URLSearchParams({
            days: filters.days || 7,
            limit: 5000 // Higher limit for export
        });
        if (filters.type) params.append('type', filters.type);
        if (filters.level) params.append('level', filters.level);
        if (filters.node) params.append('node', filters.node);
        
        window.location.href = `/logs/export-system-logs-csv?${params.toString()}`;
    }

    function createLogRow(log) {
        const tr = document.createElement('tr');
        
        const timestampWIB = log.timestamp_wib 
            ? new Date(log.timestamp_wib).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'medium'}) 
            : (log.timestamp ? new Date(log.timestamp).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'medium'}) : 'N/A');

        // Get icon based on log type and sensor type if applicable
        const { icon, iconClass } = getLogTypeIcon(log.type, log.sensor_type, log.level);
        
        // Format details for better display
        const formattedDetails = log.details ? formatDetails(log.details) : '—';
        // Use translated node name for display
        const nodeDisplay = translateNodeNameForDisplay(log.node);

        tr.innerHTML = `
            <td class="log-timestamp">${timestampWIB}</td>
            <td><span class="log-level-cell log-level-${log.level || 'UNKNOWN'}">${log.level || 'UNKNOWN'}</span></td>
            <td>
                <div class="log-type-cell">
                    <span class="log-type-icon ${iconClass}"><i class="${icon}"></i></span>
                    ${formatLogType(log.type)}${log.sensor_type ? ` (${log.sensor_type})` : ''}
                </div>
            </td>
            <td>${nodeDisplay}</td>
            <td>${log.source || 'system'}</td>
            <td class="log-details" title="${log.details || '—'}">${formattedDetails}</td>
        `;
        return tr;
    }

    // Format details to improve readability
    function formatDetails(details) {
        // Escape HTML entities to prevent XSS
        const escapeHtml = (text) => {
            return text
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
        };
        
        // Try to detect if it's JSON and format it nicely
        if (details.trim().startsWith('{') && details.trim().endsWith('}')) {
            try {
                const jsonObj = JSON.parse(details);
                return `<span class="json-formatted">${escapeHtml(JSON.stringify(jsonObj, null, 2))}</span>`;
            } catch (e) {
                // Not valid JSON, continue with normal formatting
            }
        }
        
        // Highlight numbers for better readability
        return escapeHtml(details).replace(/(\d+(\.\d+)?)/g, '<span style="color: var(--primary);">$1</span>');
    }

    function getLogTypeIcon(type, sensorType, level) {
        if (!type) return { icon: 'fas fa-question-circle', iconClass: '' };
        
        // Special handling for sensor errors and operational logs
        if ((type === 'SENSOR_ERROR' || type === 'SENSOR_OPERATIONAL') && sensorType) {
            const sensorIcons = {
                'temp': { icon: 'fas fa-thermometer-half', iconClass: 'sensor-temp' },
                'temperature': { icon: 'fas fa-thermometer-half', iconClass: 'sensor-temp' },
                'humidity': { icon: 'fas fa-tint', iconClass: 'sensor-humidity' },
                'light': { icon: 'fas fa-sun', iconClass: 'sensor-light' },
                'water': { icon: 'fas fa-water', iconClass: 'sensor-water' },
                'soil': { icon: 'fas fa-seedling', iconClass: 'sensor-soil' },
                'ph': { icon: 'fas fa-flask', iconClass: 'sensor-ph' },
                'ec': { icon: 'fas fa-bolt', iconClass: 'sensor-ec' },
                'co2': { icon: 'fas fa-cloud', iconClass: 'sensor-co2' }
                // Add more sensor types as needed
            };
            
            // Check if the sensor type is in our mapping
            for (const [key, value] of Object.entries(sensorIcons)) {
                if (sensorType.toLowerCase().includes(key)) {
                    // Create more explicit state classes for clarity
                    const stateClass = type === 'SENSOR_ERROR' ? 'sensor-error' : 'sensor-operational';
                    return {
                        icon: value.icon,
                        iconClass: `${stateClass} ${value.iconClass}`
                    };
                }
            }
        }
        
        // Fall back to general type mapping if no sensor type match
        const typeMap = {
            'SENSOR_ERROR': { icon: 'fas fa-exclamation-triangle', iconClass: 'sensor-error' },
            'SENSOR_OPERATIONAL': { icon: 'fas fa-check-circle', iconClass: 'sensor-operational' },
            'CONNECTION_LOST': { icon: 'fas fa-plug', iconClass: 'connection-lost' },
            'CONNECTION_RESTORED': { icon: 'fas fa-wifi', iconClass: 'connection-restored' },
            'FAN_ON_AUTO': { icon: 'fas fa-fan', iconClass: 'fan' },
            'FAN_OFF_AUTO': { icon: 'fas fa-fan', iconClass: 'fan' },
            'LIGHT_ON_AUTO': { icon: 'fas fa-lightbulb', iconClass: 'light' },
            'LIGHT_OFF_AUTO': { icon: 'fas fa-lightbulb', iconClass: 'light' },
            'NODE_OFFLINE': { icon: 'fas fa-server', iconClass: `node-offline ${level === 'CRITICAL' ? 'critical-alert-icon' : ''}`.trim() },
            'NODE_ONLINE': { icon: 'fas fa-server', iconClass: 'node-online' },
            // User-specific icons are no longer primary for system logs, but keep for potential direct log_event calls.
            'USER_FAN_ON': { icon: 'fas fa-fan', iconClass: 'user-action fan-on' },
            'USER_FAN_OFF': { icon: 'fas fa-fan', iconClass: 'user-action fan-off' },
            'USER_LIGHT_ON': { icon: 'fas fa-lightbulb', iconClass: 'user-action light-on' },
            'USER_LIGHT_OFF': { icon: 'fas fa-lightbulb', iconClass: 'user-action light-off' },
            'USER_CONTROL_ACTION': { icon: 'fas fa-user-cog', iconClass: 'user-action' }
            // Add more mappings as needed
        };
        
        return typeMap[type] || { icon: 'fas fa-info-circle', iconClass: '' };
    }

    function formatLogType(type) {
        if (!type) return 'UNKNOWN';
        
        // User action types are less relevant here now, but keep formatting for direct log_event calls.
        const userActionTypes = {
            'USER_FAN_ON': 'User Fan On',
            'USER_FAN_OFF': 'User Fan Off',
            'USER_LIGHT_ON': 'User Light On',
            'USER_LIGHT_OFF': 'User Light Off',
            'USER_CONTROL_ACTION': 'User Control Action'
        };
        
        if (userActionTypes[type]) {
            return userActionTypes[type];
        }
        
        // Make log type more readable by replacing underscores with spaces and capitalizing each word
        const formattedType = type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        
        // For on/off states, make them more concise
        if (formattedType.includes('ON AUTO')) {
            return formattedType.replace('ON AUTO', '(ON)');
        } else if (formattedType.includes('OFF AUTO')) {
            return formattedType.replace('OFF AUTO', '(OFF)');
        }
        
        return formattedType;
    }

    // Clean up on page unload (though tab deactivation handles interval now)
    window.addEventListener('beforeunload', function() {
        stopAutoRefresh();
        if (observer) observer.disconnect();
    });
});
