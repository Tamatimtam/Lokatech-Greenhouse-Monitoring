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

        const usernameValue = usernameFilterEl ? usernameFilterEl.value.trim() : null;

        return {
            days: daysFilterEl ? parseInt(daysFilterEl.value, 10) : 7,
            type: typeFilterEl ? typeFilterEl.value : null,
            username: usernameValue ? usernameValue : null, // Ensure null if empty string after trim
            limit: defaultMaxLogEntries
        };
    }

    function loadUserLogs(filters = getCurrentUserLogFilters(), silentRefresh = false) {
        if (isLoadingUserLogs && !silentRefresh) return;

        isLoadingUserLogs = true;
        
        const refreshBtn = document.getElementById('refreshUserLogsBtn');
        let originalRefreshBtnWidth = '';
        if (refreshBtn && !silentRefresh) {
            refreshBtn.disabled = true;
            originalRefreshBtnWidth = refreshBtn.offsetWidth + 'px'; // Capture width before changing content
            refreshBtn.style.width = originalRefreshBtnWidth; // Apply fixed width
            refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refreshing...';
        }
        
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
        // Only append username if it's a non-empty string
        if (filters.username && filters.username.length > 0) {
            params.append('username', filters.username);
        }

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
                    // Preserve export button if it exists by selecting its container
                    const exportBtnContainer = userLogContent.querySelector('.user-log-export-container');
                    const exportBtnHtml = exportBtnContainer ? exportBtnContainer.outerHTML : `
                        <div class="user-log-export-container">
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
                    if (originalRefreshBtnWidth) { // Reset width if it was set
                        refreshBtn.style.width = ''; 
                    }
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
        
        // Check if the export button container already exists.
        // This helps preserve it if displayUserLogsUI is called multiple times without a full page reload.
        let exportBtnContainer = userLogContent.querySelector('.user-log-export-container');
        const exportBtnHtml = `
            <div class="user-log-export-container">
                <button id="exportUserLogsCsvBtn" class="log-control-btn" title="Export current view of user logs to CSV">
                    <i class="fas fa-file-csv"></i> Export User Logs to CSV
                </button>
            </div>`;

        // If the container doesn't exist from a previous render (e.g. initial load, or error cleared),
        // we prepare its HTML. Otherwise, we'll keep the existing one.
        const finalExportBtnHtml = exportBtnContainer ? exportBtnContainer.outerHTML : exportBtnHtml;

        userLogContent.innerHTML = `
            ${finalExportBtnHtml}
            <div class="user-log-controls">
                <button id="refreshUserLogsBtn" class="log-control-btn">
                    <i class="fas fa-sync-alt"></i> Refresh
                </button>
                <div>
                    <label for="userLogDaysFilter">Days: </label>
                    <input type="number" id="userLogDaysFilter" value="7" min="1" max="90" class="log-input">
                </div>
                
                <div>
                    <label for="userLogActionTypeFilter">Action Type: </label>
                    <select id="userLogActionTypeFilter" class="log-input">
                        <option value="">All Types</option>
                        <option value="DEVICE_CONTROL">Device Control</option>
                        <option value="PROFILE_UPDATE">Profile Update</option>
                        <option value="ACCOUNT_DELETED">Account Deleted</option>
                        <option value="REGISTRATION_SUCCESS">Registration Success</option>
                    </select>
                </div>
                
                <div>
                    <label for="userLogUsernameFilter">Username: </label>
                    <input type="text" id="userLogUsernameFilter" placeholder="user@example.com" class="log-input">
                </div>
                <span id="userLogCountDisplay" class="user-log-count"></span>
            </div>
            <div class="user-log-entries-table-container">
                <table class="user-log-table">
                    <thead>
                        <tr>
                            <th>Timestamp (WIB)</th>
                            <th>Username</th>
                            <th>Action Type</th>
                            <th>Details</th>
                            <th>IP Address</th>
                            <th>Source</th>
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
            userLogs.forEach((log, index) => { // Added index for staggered animation
                const row = createUserLogRow(log);
                tbody.appendChild(row);
                // Stagger the animation slightly
                setTimeout(() => {
                    row.classList.add('visible');
                }, index * 50); // 50ms delay per row
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
        const exportCsvBtn = document.getElementById('exportUserLogsCsvBtn'); 

        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                // Loading state is handled in loadUserLogs
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

    function escapeHtml(text) {
        if (typeof text !== 'string') text = String(text); // Ensure text is a string
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
    
    function formatEventDetailsForDisplay(actionType, eventDetails) {
        if (!eventDetails || typeof eventDetails !== 'object' || Object.keys(eventDetails).length === 0) {
            return '<span class="no-details">No specific details available.</span>';
        }
    
        let html = '<div class="formatted-details">';
    
        switch (actionType) {
            case 'DEVICE_CONTROL':
                if (eventDetails.action_summary) html += `<div class="detail-item"><span class="detail-key">Summary:</span> <span class="detail-value">${escapeHtml(eventDetails.action_summary)}</span></div>`;
                if (eventDetails.device) html += `<div class="detail-item"><span class="detail-key">Device:</span> <span class="detail-value">${escapeHtml(eventDetails.device)}</span></div>`;
                if (eventDetails.node_affected) html += `<div class="detail-item"><span class="detail-key">Node:</span> <span class="detail-value">${escapeHtml(eventDetails.node_affected)}</span></div>`;
                break;
            case 'PROFILE_UPDATE':
                if (eventDetails.field_updated) html += `<div class="detail-item"><span class="detail-key">Field Updated:</span> <span class="detail-value">${escapeHtml(eventDetails.field_updated)}</span></div>`;
                if (eventDetails.old_value !== undefined) html += `<div class="detail-item"><span class="detail-key">Old Value:</span> <span class="detail-value detail-value-old">${escapeHtml(eventDetails.old_value)}</span></div>`;
                if (eventDetails.new_value !== undefined) html += `<div class="detail-item"><span class="detail-key">New Value:</span> <span class="detail-value detail-value-new">${escapeHtml(eventDetails.new_value)}</span></div>`;
                break;
            case 'ACCOUNT_DELETED':
                if (eventDetails.status) html += `<div class="detail-item"><span class="detail-key">Status:</span> <span class="detail-value ${eventDetails.status === 'success' ? 'detail-status-success' : 'detail-status-failure'}">${escapeHtml(eventDetails.status)}</span></div>`;
                if (eventDetails.reason) html += `<div class="detail-item"><span class="detail-key">Reason:</span> <span class="detail-value">${escapeHtml(eventDetails.reason)}</span></div>`;
                const accountEmail = eventDetails.deleted_account_email || eventDetails.attempted_account_email;
                if (accountEmail) html += `<div class="detail-item"><span class="detail-key">Account:</span> <span class="detail-value">${escapeHtml(accountEmail)}</span></div>`;
                break;
            case 'REGISTRATION_SUCCESS':
                if (eventDetails.registered_email) html += `<div class="detail-item"><span class="detail-key">Registered Email:</span> <span class="detail-value">${escapeHtml(eventDetails.registered_email)}</span></div>`;
                break;
            default:
                // Fallback to pretty-printed JSON for unrecognized action types or complex structures
                try {
                    const escapeHtmlInJson = (obj) => JSON.parse(JSON.stringify(obj, (key, value) => typeof value === 'string' ? escapeHtml(value) : value));
                    const prettyDetails = JSON.stringify(escapeHtmlInJson(eventDetails), null, 2);
                    html += `<pre>${prettyDetails}</pre>`;
                } catch (e) {
                    html += `<pre>${escapeHtml(String(eventDetails))}</pre>`; // Absolute fallback
                }
                break;
        }
        html += '</div>';
        return html;
    }

    function createUserLogRow(log) {
        const tr = document.createElement('tr');
        
        const timestampWIB = log.timestamp_wib 
            ? new Date(log.timestamp_wib).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'medium'}) 
            : (log.timestamp ? new Date(log.timestamp).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'medium'}) : 'N/A');

        const formattedActionType = log.action_type 
            ? log.action_type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) 
            : 'N/A';
        
        const detailsContent = formatEventDetailsForDisplay(log.action_type, log.event_details);

        tr.innerHTML = `
            <td class="log-timestamp">${timestampWIB}</td>
            <td class="log-username">${escapeHtml(log.username || 'N/A')}</td>
            <td class="log-action-type">${escapeHtml(formattedActionType)}</td>
            <td class="log-details-cell">${detailsContent}</td>
            <td class="log-ip-address">${escapeHtml(log.ip_address || 'N/A')}</td>
            <td class="log-source">${escapeHtml(log.source || 'N/A')}</td>
        `;
        
        return tr;
    }

    // Clean up on page unload
    window.addEventListener('beforeunload', function() {
        stopAutoRefreshUserLogs();
        if (observer) observer.disconnect();
    });
});
