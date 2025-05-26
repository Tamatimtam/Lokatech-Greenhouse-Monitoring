document.addEventListener('DOMContentLoaded', function() {
    const userLogContent = document.getElementById('tab-user');
    const defaultMaxLogEntries = 100;
    let userLogs = [];
    let isLoadingUserLogs = false;
    let autoRefreshUserLogsIntervalId = null;

    // Initial logs loading if tab is active
    if (userLogContent && userLogContent.classList.contains('active')) {
        loadUserLogs();
        startAutoRefreshUserLogs();
    }

    // Observer for tab activation
    const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            if (mutation.attributeName === 'class') {
                const isActive = userLogContent.classList.contains('active');
                if (isActive && !autoRefreshUserLogsIntervalId) {
                    loadUserLogs();
                    startAutoRefreshUserLogs();
                } else if (!isActive && autoRefreshUserLogsIntervalId) {
                    stopAutoRefreshUserLogs();
                }
            }
        });
    });

    if (userLogContent) {
        observer.observe(userLogContent, { attributes: true });
    }

    function startAutoRefreshUserLogs() {
        if (autoRefreshUserLogsIntervalId) clearInterval(autoRefreshUserLogsIntervalId);
        autoRefreshUserLogsIntervalId = setInterval(() => {
            if (userLogContent && userLogContent.classList.contains('active')) {
                const filters = getCurrentUserLogFilters();
                loadUserLogs(filters, true); // Silent refresh
            }
        }, 30000); // Refresh every 30 seconds
    }

    function stopAutoRefreshUserLogs() {
        if (autoRefreshUserLogsIntervalId) {
            clearInterval(autoRefreshUserLogsIntervalId);
            autoRefreshUserLogsIntervalId = null;
        }
    }

    function getCurrentUserLogFilters() {
        const daysFilterEl = document.getElementById('userLogDaysFilter');
        const typeFilterEl = document.getElementById('userLogActionTypeFilter');
        const usernameFilterEl = document.getElementById('userLogUsernameFilter');

        return {
            days: daysFilterEl ? parseInt(daysFilterEl.value, 10) : 7,
            type: typeFilterEl ? typeFilterEl.value : null,
            username: usernameFilterEl ? usernameFilterEl.value.trim() : null,
            limit: defaultMaxLogEntries
        };
    }

    function loadUserLogs(filters = getCurrentUserLogFilters(), silentRefresh = false) {
        if (isLoadingUserLogs && !silentRefresh) return;

        isLoadingUserLogs = true;
        if (userLogContent && !silentRefresh) {
            const existingLoadingIndicator = userLogContent.querySelector('.loading-indicator');
             // Check if controls are not yet rendered or if it's the initial placeholder
            if (!existingLoadingIndicator && (!userLogContent.querySelector('.user-log-controls') || userLogContent.innerHTML.includes("under development"))) {
                userLogContent.innerHTML = `
                    <div class="loading-indicator">
                        <i class="fas fa-spinner fa-spin"></i> Loading user logs...
                    </div>
                `;
            }
        }

        const params = new URLSearchParams({
            days: filters.days || 7,
            limit: filters.limit || defaultMaxLogEntries
        });

        if (filters.type) params.append('type', filters.type);
        if (filters.username) params.append('username', filters.username);

        fetch(`/logs/user-activities?${params.toString()}`)
            .then(response => {
                if (!response.ok) {
                    return response.json().then(err => { throw new Error(`Server error: ${err.error || response.statusText}`) });
                }
                return response.json();
            })
            .then(data => {
                userLogs = data;
                if (!silentRefresh || !document.getElementById('user-log-tbody')) {
                    displayUserLogsUI();
                } else {
                    populateUserLogTableBody();
                }
                restoreUserLogFilterSelections(filters);
            })
            .catch(error => {
                console.error('Error fetching user logs:', error);
                if (userLogContent && !silentRefresh) {
                    // Preserve export button if it exists
                    const exportBtnContainer = userLogContent.querySelector('div[style*="text-align: right"]');
                    const exportBtnHtml = exportBtnContainer ? exportBtnContainer.innerHTML : `
                        <div style="margin-bottom: var(--spacing-md); text-align: right;">
                            <button id="exportUserLogsCsvBtn" class="log-control-btn" title="Export current view of user logs to CSV">
                                <i class="fas fa-file-csv"></i> Export User Logs to CSV
                            </button>
                        </div>`;
                    
                    userLogContent.innerHTML = `
                        ${exportBtnHtml}
                        <div class="alert alert-danger">
                            <i class="fas fa-exclamation-circle"></i>
                            Error loading user logs: ${error.message}
                            <button id="retryUserLogsBtn" class="log-control-btn">
                                <i class="fas fa-redo"></i> Retry
                            </button>
                        </div>
                    `;
                    const retryBtn = document.getElementById('retryUserLogsBtn');
                    if (retryBtn) {
                        retryBtn.addEventListener('click', () => loadUserLogs(filters));
                    }
                    // Re-attach event listener for export button if it was re-rendered
                    const newExportBtn = document.getElementById('exportUserLogsCsvBtn');
                    if (newExportBtn) {
                        newExportBtn.addEventListener('click', handleExportUserLogs);
                    }
                }
            })
            .finally(() => {
                isLoadingUserLogs = false;
                const refreshBtn = document.getElementById('refreshUserLogsBtn');
                if (refreshBtn) {
                    refreshBtn.disabled = false;
                    refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh';
                }
            });
    }
    
    function restoreUserLogFilterSelections(filters) {
        if (!filters || Object.keys(filters).length === 0) return;
        
        const daysFilterEl = document.getElementById('userLogDaysFilter');
        const typeFilterEl = document.getElementById('userLogActionTypeFilter');
        const usernameFilterEl = document.getElementById('userLogUsernameFilter');
        
        if (daysFilterEl && filters.days) daysFilterEl.value = filters.days;
        if (typeFilterEl && filters.type) typeFilterEl.value = filters.type;
        if (usernameFilterEl && filters.username) usernameFilterEl.value = filters.username;
    }

    function displayUserLogsUI() {
        if (!userLogContent) {
            console.error('User Log content area (tab-user) not found.');
            return;
        }
        
        // Preserve existing export button if it's already there from logs.html
        const exportBtnContainer = userLogContent.querySelector('div[style*="text-align: right"]');
        const exportBtnHtml = exportBtnContainer ? exportBtnContainer.innerHTML : `
            <div style="margin-bottom: var(--spacing-md); text-align: right;">
                <button id="exportUserLogsCsvBtn" class="log-control-btn" title="Export current view of user logs to CSV">
                    <i class="fas fa-file-csv"></i> Export User Logs to CSV
                </button>
            </div>`;

        userLogContent.innerHTML = `
            ${exportBtnHtml}
            <div class="user-log-controls">
                <button id="refreshUserLogsBtn" class="log-control-btn">
                    <i class="fas fa-sync-alt"></i> Refresh
                </button>
                <label for="userLogDaysFilter">Days: </label>
                <input type="number" id="userLogDaysFilter" value="7" min="1" max="90" class="log-input">
                
                <label for="userLogActionTypeFilter">Action Type: </label>
                <select id="userLogActionTypeFilter" class="log-input">
                    <option value="">All Types</option>
                    <option value="DEVICE_CONTROL">Device Control</option>
                    <option value="PROFILE_UPDATE">Profile Update</option>
                    <option value="ACCOUNT_DELETED">Account Deleted</option>
                    <option value="REGISTRATION_SUCCESS">Registration Success</option>
                </select>
                
                <label for="userLogUsernameFilter">Username: </label>
                <input type="text" id="userLogUsernameFilter" placeholder="user@example.com" class="log-input">
                <span id="userLogCountDisplay" class="user-log-count"></span>
            </div>
            <div class="user-log-entries-table-container">
                <table class="user-log-table">
                    <thead>
                        <tr>
                            <th>Timestamp (WIB)</th>
                            <th>Username</th>
                            <th>Action Type</th>
                            <th>IP Address</th>
                            <th>Source</th>
                            <th>Details</th>
                        </tr>
                    </thead>
                    <tbody id="user-log-tbody">
                        <!-- Rows will be populated here -->
                    </tbody>
                </table>
            </div>
        `;
        
        populateUserLogTableBody();
        addUserLogEventListenersToControls();
    }

    function populateUserLogTableBody() {
        const tbody = document.getElementById('user-log-tbody');
        if (!tbody) return;

        tbody.innerHTML = ''; 
        if (userLogs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No user logs found for the selected criteria.</td></tr>';
        } else {
            userLogs.forEach(log => {
                tbody.appendChild(createUserLogRow(log));
            });
        }
        updateUserLogCount();
    }

    function updateUserLogCount() {
        const logCountDisplay = document.getElementById('userLogCountDisplay');
        if (logCountDisplay) {
            logCountDisplay.textContent = `${userLogs.length} logs`;
        }
    }
    
    function handleExportUserLogs() {
        const filters = getCurrentUserLogFilters();
        const params = new URLSearchParams({
            days: filters.days || 7,
            limit: 5000 // Higher limit for export
        });
        if (filters.type) params.append('type', filters.type);
        if (filters.username) params.append('username', filters.username);
        
        window.location.href = `/logs/export-user-activities-csv?${params.toString()}`;
    }

    function addUserLogEventListenersToControls() {
        const refreshBtn = document.getElementById('refreshUserLogsBtn');
        const daysFilterEl = document.getElementById('userLogDaysFilter');
        const typeFilterEl = document.getElementById('userLogActionTypeFilter');
        const usernameFilterEl = document.getElementById('userLogUsernameFilter');
        const exportCsvBtn = document.getElementById('exportUserLogsCsvBtn'); // Get the potentially re-rendered button

        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                refreshBtn.disabled = true;
                refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refreshing...';
                const filters = getCurrentUserLogFilters();
                loadUserLogs(filters);
            });
        }

        [daysFilterEl, typeFilterEl, usernameFilterEl].forEach(filterEl => {
            if (filterEl) {
                const eventType = filterEl.tagName === 'INPUT' && filterEl.type === 'text' ? 'input' : 'change';
                filterEl.addEventListener(eventType, () => {
                    // Debounce for username input
                    if (filterEl.id === 'userLogUsernameFilter') {
                        if (this.usernameTimeout) clearTimeout(this.usernameTimeout);
                        this.usernameTimeout = setTimeout(() => {
                            const filters = getCurrentUserLogFilters();
                            loadUserLogs(filters);
                        }, 500); // 500ms debounce
                    } else {
                        const filters = getCurrentUserLogFilters();
                        loadUserLogs(filters);
                    }
                });
            }
        });
        
        if (exportCsvBtn) {
            exportCsvBtn.addEventListener('click', handleExportUserLogs);
        }
    }

    function createUserLogRow(log) {
        const tr = document.createElement('tr');
        
        const timestampWIB = log.timestamp_wib 
            ? new Date(log.timestamp_wib).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'medium'}) 
            : (log.timestamp ? new Date(log.timestamp).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'medium'}) : 'N/A');

        const formattedActionType = log.action_type ? log.action_type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'N/A';
        
        let detailsContent = '—';
        if (log.event_details) {
            try {
                // Escape HTML in details to prevent XSS
                const escapeHtml = (text) => {
                    if (typeof text !== 'string') text = String(text);
                    return text
                        .replace(/&/g, "&amp;")
                        .replace(/</g, "&lt;")
                        .replace(/>/g, "&gt;")
                        .replace(/"/g, "&quot;")
                        .replace(/'/g, "&#039;");
                };
                const prettyDetails = JSON.stringify(log.event_details, (key, value) => {
                    // Ensure all string values within event_details are escaped
                    if (typeof value === 'string') {
                        return escapeHtml(value);
                    }
                    return value;
                }, 2);
                detailsContent = `<pre>${prettyDetails}</pre>`;
            } catch (e) {
                detailsContent = `<pre>${escapeHtml(String(log.event_details))}</pre>`;
            }
        }

        tr.innerHTML = `
            <td class="log-timestamp">${timestampWIB}</td>
            <td class="log-username">${log.username || 'N/A'}</td>
            <td class="log-action-type">${formattedActionType}</td>
            <td class="log-ip-address">${log.ip_address || 'N/A'}</td>
            <td class="log-source">${log.source || 'N/A'}</td>
            <td class="log-details-cell">${detailsContent}</td>
        `;
        return tr;
    }

    // Clean up on page unload
    window.addEventListener('beforeunload', function() {
        stopAutoRefreshUserLogs();
        if (observer) observer.disconnect();
    });
});
