document.addEventListener('DOMContentLoaded', function() {
    const systemLogContent = document.getElementById('tab-system');
    const defaultMaxLogEntries = 100; // Default maximum logs to display
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
        }, 30000); // Refresh every 30 seconds
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
                    systemLogContent.innerHTML = `
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

    function displaySystemLogsUI() {
        if (!systemLogContent) {
            console.error('System Log content area (tab-system) not found.');
            return;
        }

        systemLogContent.innerHTML = `
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
                    <option value="CONNECTION_LOST">Connection Lost</option>
                    <option value="CONNECTION_RESTORED">Connection Restored</option>
                    <option value="FAN_ON_AUTO">Fan On (Auto)</option>
                    <option value="FAN_OFF_AUTO">Fan Off (Auto)</option>
                    <option value="LIGHT_ON_AUTO">Light On (Auto)</option>
                    <option value="LIGHT_OFF_AUTO">Light Off (Auto)</option>
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
                    <option value="penyemaian">Penyemaian</option>
                    <option value="remaja">Remaja</option>
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
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No system logs found for the selected criteria.</td></tr>';
        } else {
            systemLogs.forEach(log => tbody.appendChild(createLogRow(log)));
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
    }

    function createLogRow(log) {
        const tr = document.createElement('tr');

        const timestampWIB = log.timestamp_wib ? new Date(log.timestamp_wib).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'medium'}) : (log.timestamp ? new Date(log.timestamp).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'medium'}) : 'N/A');

        tr.innerHTML = `
            <td>${timestampWIB}</td>
            <td><span class="log-level-cell log-level-${log.level || 'UNKNOWN'}">${log.level || 'UNKNOWN'}</span></td>
            <td>${formatLogType(log.type)}</td>
            <td>${log.node || '—'}</td>
            <td>${log.source || 'system'}</td>
            <td class="log-details">${log.details || '—'}</td>
        `;
        return tr;
    }

    function formatLogType(type) {
        if (!type) return 'UNKNOWN';
        return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()); // Prettify type
    }

    // Clean up on page unload (though tab deactivation handles interval now)
    window.addEventListener('beforeunload', function() {
        stopAutoRefresh();
        if (observer) observer.disconnect();
    });
});
