document.addEventListener('DOMContentLoaded', function() {
    const userLogContent = document.getElementById('tab-user');
    const logsPerPage = 50; // Display 50 logs per page
    let allUserLogs = []; // Accumulates logs as more are loaded
    let isLoadingUserLogs = false;
    let autoRefreshUserLogsIntervalId = null;
    let lastFetchedLogId = null; // ID of the last log item from the previous fetch
    let currentFilters = {}; // Store current filters to detect changes

    // Initial logs loading if tab is active
    if (userLogContent && userLogContent.classList.contains('active')) {
        currentFilters = getCurrentUserLogFilters();
        loadUserLogs(currentFilters);
        startAutoRefreshUserLogs();
    }

    // Observer for tab activation
    const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            if (mutation.attributeName === 'class') {
                const isActive = userLogContent.classList.contains('active');
                if (isActive && !autoRefreshUserLogsIntervalId) {
                    currentFilters = getCurrentUserLogFilters(); // Get fresh filters on tab activation
                    allUserLogs = []; // Reset logs when tab becomes active after being inactive
                    lastFetchedLogId = null;
                    loadUserLogs(currentFilters);
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
        }, 300000); // Refresh every 5 mins
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
            username: usernameValue ? usernameValue : null,
            limit: logsPerPage // Use logsPerPage for API limit
        };
    }

    function loadUserLogs(filters = getCurrentUserLogFilters(), silentRefresh = false, isLoadMore = false) {
        if (isLoadingUserLogs && !silentRefresh) return;

        isLoadingUserLogs = true;
        
        const refreshBtn = document.getElementById('refreshUserLogsBtn');
        const loadMoreBtn = document.getElementById('loadMoreUserLogsBtn');
        let originalRefreshBtnWidth = '';

        if (refreshBtn && !silentRefresh && !isLoadMore) {
            refreshBtn.disabled = true;
            originalRefreshBtnWidth = refreshBtn.offsetWidth + 'px';
            refreshBtn.style.width = originalRefreshBtnWidth;
            refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refreshing...';
        }
        if (loadMoreBtn && isLoadMore) {
            loadMoreBtn.disabled = true;
            loadMoreBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
        }
        
        if (userLogContent && !silentRefresh && !isLoadMore) {
            const existingLoadingIndicator = userLogContent.querySelector('.loading-indicator');
            if (!existingLoadingIndicator && (!userLogContent.querySelector('.user-log-controls') || userLogContent.innerHTML.includes("under development"))) {
                userLogContent.innerHTML = `<div class="loading-indicator"><i class="fas fa-spinner fa-spin"></i> Loading user logs...</div>`;
            }
        }

        const params = new URLSearchParams({
            days: filters.days || 7,
            limit: logsPerPage // Send logsPerPage as the limit
        });

        if (filters.type) params.append('type', filters.type);
        if (filters.username && filters.username.length > 0) {
            params.append('username', filters.username);
        }
        if (isLoadMore && lastFetchedLogId) {
            params.append('last_doc_id', lastFetchedLogId);
        }

        // If it's not a "load more" action, reset the logs
        if (!isLoadMore) {
            allUserLogs = [];
            lastFetchedLogId = null;
        }

        fetch(`/logs/user-activities?${params.toString()}`)
            .then(response => {
                if (!response.ok) {
                    return response.json().then(err => { throw new Error(`Server error: ${err.error || response.statusText}`) });
                }
                return response.json();
            })
            .then(data => {
                if (!isLoadMore || silentRefresh) { // Full UI render for initial load, filter change, or silent refresh
                    allUserLogs = data.logs || [];
                    if (!document.getElementById('user-log-tbody') || !isLoadMore) { // Avoid full re-render if just appending silently
                         displayUserLogsUI(); // This will call populateUserLogTableBody
                    } else {
                         populateUserLogTableBody(); // Just update table body for silent refresh
                    }
                } else { // Append for "Load More"
                    allUserLogs = allUserLogs.concat(data.logs || []);
                    populateUserLogTableBody(); // Re-populates with allUserLogs
                }
                lastFetchedLogId = data.last_doc_id_returned;
                
                updateLoadMoreButtonVisibility(data.logs ? data.logs.length : 0);
                if (!isLoadMore) { // Only restore filters if it's not a "load more" action
                    restoreUserLogFilterSelections(filters);
                }
            })
            .catch(error => {
                console.error('Error fetching user logs:', error);
                if (userLogContent && !silentRefresh) {
                    const exportBtnContainer = userLogContent.querySelector('.user-log-export-container');
                    const exportBtnHtml = exportBtnContainer ? exportBtnContainer.outerHTML : `<div class="user-log-export-container"><button id="exportUserLogsCsvBtn" class="log-control-btn" title="Export current view of user logs to CSV"><i class="fas fa-file-csv"></i> Export User Logs to CSV</button></div>`;
                    
                    userLogContent.innerHTML = `
                        ${exportBtnHtml}
                        <div class="alert alert-danger">
                            <i class="fas fa-exclamation-circle"></i> Error loading user logs: ${error.message}
                            <button id="retryUserLogsBtn" class="log-control-btn"><i class="fas fa-redo"></i> Retry</button>
                        </div>
                    `;
                    const retryBtn = document.getElementById('retryUserLogsBtn');
                    if (retryBtn) {
                        retryBtn.addEventListener('click', () => loadUserLogs(filters, false, false)); // Retry initial load
                    }
                    const newExportBtn = document.getElementById('exportUserLogsCsvBtn');
                    if (newExportBtn) newExportBtn.addEventListener('click', handleExportUserLogs);
                }
            })
            .finally(() => {
                isLoadingUserLogs = false;
                if (refreshBtn && !isLoadMore) {
                    refreshBtn.disabled = false;
                    refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh';
                    if (originalRefreshBtnWidth) refreshBtn.style.width = ''; 
                }
                if (loadMoreBtn) {
                    loadMoreBtn.disabled = false;
                    loadMoreBtn.innerHTML = 'Load More Logs';
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
        
        let exportBtnContainer = userLogContent.querySelector('.user-log-export-container');
        const exportBtnHtml = `
            <div class="user-log-export-container">
                <button id="exportUserLogsCsvBtn" class="log-control-btn" title="Export current view of user logs to CSV">
                    <i class="fas fa-file-csv"></i> Export User Logs to CSV
                </button>
            </div>`;
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
                        <option value="PASSWORD_RESET_REQUESTED">Password Reset Requested</option>
                        <option value="RATE_LIMIT_EXCEEDED">Rate Limit Exceeded</option>
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
            <div class="user-log-load-more-container">
                <button id="loadMoreUserLogsBtn" class="log-control-btn hidden">Load More Logs</button>
            </div>
        `;
        
        populateUserLogTableBody(); // Populates with current allUserLogs
        addUserLogEventListenersToControls();
    }

    function populateUserLogTableBody() {
        const tbody = document.getElementById('user-log-tbody');
        if (!tbody) return;

        tbody.innerHTML = ''; // Clear existing rows before populating
        if (allUserLogs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No user logs found for the selected criteria.</td></tr>';
        } else {
            allUserLogs.forEach((log, index) => {
                const row = createUserLogRow(log);
                tbody.appendChild(row);
                setTimeout(() => {
                    row.classList.add('visible');
                }, index * 30); // Shorter delay for potentially more items
            });
        }
        updateUserLogCount();
    }

    function updateUserLogCount() {
        const logCountDisplay = document.getElementById('userLogCountDisplay');
        if (logCountDisplay) {
            logCountDisplay.textContent = `${allUserLogs.length} logs shown`;
        }
    }

    function updateLoadMoreButtonVisibility(fetchedCount) {
        const loadMoreBtn = document.getElementById('loadMoreUserLogsBtn');
        if (loadMoreBtn) {
            if (fetchedCount < logsPerPage || !lastFetchedLogId) {
                loadMoreBtn.classList.add('hidden'); // No more logs or error
            } else {
                loadMoreBtn.classList.remove('hidden');
            }
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
        const loadMoreBtn = document.getElementById('loadMoreUserLogsBtn');

        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                currentFilters = getCurrentUserLogFilters();
                loadUserLogs(currentFilters, false, false); // Not loadMore
            });
        }

        let debounceTimer;
        [daysFilterEl, typeFilterEl, usernameFilterEl].forEach(filterEl => {
            if (filterEl) {
                const eventType = filterEl.tagName === 'INPUT' && filterEl.type === 'text' ? 'input' : 'change';
                filterEl.addEventListener(eventType, () => {
                    if (filterEl.id === 'userLogUsernameFilter') {
                        clearTimeout(debounceTimer);
                        debounceTimer = setTimeout(() => {
                            currentFilters = getCurrentUserLogFilters();
                            loadUserLogs(currentFilters, false, false); // Not loadMore
                        }, 500); // Debounce for username input
                    } else {
                        currentFilters = getCurrentUserLogFilters();
                        loadUserLogs(currentFilters, false, false); // Not loadMore
                    }
                });
            }
        });
        
        if (exportCsvBtn) {
            exportCsvBtn.addEventListener('click', handleExportUserLogs);
        }

        if (loadMoreBtn) {
            loadMoreBtn.addEventListener('click', () => {
                // Filters should already be current from last load or change
                loadUserLogs(currentFilters, false, true); // isLoadMore = true
            });
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
            case 'PASSWORD_RESET_REQUESTED': // New case
                if (eventDetails.action) html += `<div class="detail-item"><span class="detail-key">Action:</span> <span class="detail-value">${escapeHtml(eventDetails.action.replace(/_/g, ' '))}</span></div>`;
                if (eventDetails.email_provided) html += `<div class="detail-item"><span class="detail-key">Email Provided:</span> <span class="detail-value">${escapeHtml(eventDetails.email_provided)}</span></div>`;
                break;
            case 'RATE_LIMIT_EXCEEDED': // New case
                if (eventDetails.action) html += `<div class="detail-item"><span class="detail-key">Blocked Action:</span> <span class="detail-value">${escapeHtml(eventDetails.action.replace(/_/g, ' '))}</span></div>`;
                if (eventDetails.limit) html += `<div class="detail-item"><span class="detail-key">Limit:</span> <span class="detail-value">${escapeHtml(eventDetails.limit)}</span></div>`;
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

        // Apply specific classes for CSS targeting column widths
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
