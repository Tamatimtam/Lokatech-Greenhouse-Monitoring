/**
 * Profile page functionality
 * Combines modal functionality and profile-specific features
 */

// Mock log data for demonstration
const mockLogs = [
  { id: 1, timestamp: '2023-11-10 08:23:15', user: 'john_doe', action: 'Logged into system', type: 'login', status: 'success' },
  { id: 2, timestamp: '2023-11-10 09:45:22', user: 'jane_smith', action: 'Updated greenhouse sensor settings', type: 'data', status: 'success' },
  { id: 3, timestamp: '2023-11-10 10:12:05', user: 'system', action: 'Automatic backup completed', type: 'system', status: 'success' },
  { id: 4, timestamp: '2023-11-10 11:30:45', user: 'alice_green', action: 'Added new user: mike_jones', type: 'user', status: 'success' },
  { id: 5, timestamp: '2023-11-10 13:15:33', user: 'bob_johnson', action: 'Modified humidity threshold', type: 'data', status: 'warning' },
  { id: 6, timestamp: '2023-11-10 14:22:18', user: 'john_doe', action: 'Exported monthly report', type: 'data', status: 'success' },
  { id: 7, timestamp: '2023-11-10 15:45:02', user: 'jane_smith', action: 'Changed account password', type: 'user', status: 'success' },
  { id: 8, timestamp: '2023-11-10 16:30:59', user: 'bob_johnson', action: 'Failed login attempt', type: 'login', status: 'error' },
  { id: 9, timestamp: '2023-11-10 17:10:27', user: 'system', action: 'Service restarted', type: 'system', status: 'warning' },
  { id: 10, timestamp: '2023-11-10 18:05:11', user: 'alice_green', action: 'Deleted user: test_user', type: 'user', status: 'success' },
  { id: 11, timestamp: '2023-11-11 09:13:45', user: 'john_doe', action: 'Updated profile information', type: 'user', status: 'success' },
  { id: 12, timestamp: '2023-11-11 10:27:33', user: 'system', action: 'Database maintenance', type: 'system', status: 'success' },
  { id: 13, timestamp: '2023-11-11 11:45:22', user: 'jane_smith', action: 'Configured notification settings', type: 'system', status: 'success' },
  { id: 14, timestamp: '2023-11-11 13:19:05', user: 'bob_johnson', action: 'Logged out of system', type: 'login', status: 'success' },
  { id: 15, timestamp: '2023-11-11 14:32:17', user: 'alice_green', action: 'Calibrated temperature sensor', type: 'data', status: 'warning' }
];

document.addEventListener('DOMContentLoaded', function() {
  // Initialize the profile modal
  const profileModalControl = initModal('profileModal', 'openProfileModal', function(modal, closeModal) {
    const displayName = document.getElementById('displayName').value;
    
    if (!displayName.trim()) {
      showValidationError('Please enter a valid display name');
      return;
    }
    
    updateProfileDisplay(displayName);
    closeModal();
    showToast('Profile updated successfully!');
  });
  
  // Initialize the password change modal
  const passwordModalControl = initModal('passwordModal', 'openPasswordModal', function(modal, closeModal) {
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    
    if (!currentPassword) {
      showValidationError('Current password is required');
      return;
    }
    
    if (!isPasswordValid(newPassword)) {
      showValidationError('Please meet all password requirements');
      return;
    }
    
    if (newPassword !== confirmPassword) {
      showValidationError('Passwords do not match');
      return;
    }
    
    closeModal();
    showToast('Password changed successfully!');
  });
  
  // Initialize log viewer modal
  const logViewerModalControl = initModal('logViewerModal', 'openLogViewerModal');
  
  // Set up other functionality
  setupPasswordToggles();
  setupPasswordValidation();
  setupProfilePictureUpload();
  setupLogViewer();
});

/**
 * Initialize a modal component
 * @param {string} modalId - The ID of the modal element
 * @param {string} openerId - The ID of the element that opens the modal
 * @param {Function} onSave - Optional callback function when save button is clicked
 */
function initModal(modalId, openerId, onSave = null) {
  const modal = document.getElementById(modalId);
  const opener = document.getElementById(openerId);
  const closeBtn = document.getElementById('close' + modalId);
  const cancelBtn = document.getElementById('cancel' + modalId);
  const saveBtn = document.getElementById('save' + modalId);
  
  if (!modal || !opener) {
    console.error(`Modal initialization failed: Elements not found. Modal: ${modalId}, Opener: ${openerId}`);
    return;
  }
  
  // Open modal function
  function openModal() {
    modal.classList.add('modal--active');
    document.body.style.overflow = 'hidden';
  }
  
  // Close modal function
  function closeModal() {
    modal.classList.remove('modal--active');
    document.body.style.overflow = '';
  }
  
  // Event listeners
  opener.addEventListener('click', openModal);
  
  if (closeBtn) {
    closeBtn.addEventListener('click', closeModal);
  }
  
  if (cancelBtn) {
    cancelBtn.addEventListener('click', closeModal);
  }
  
  if (saveBtn) {
    saveBtn.addEventListener('click', function() {
      if (onSave && typeof onSave === 'function') {
        onSave(modal, closeModal);
      } else {
        closeModal();
      }
    });
  }
  
  // Close when clicking outside
  modal.addEventListener('click', function(event) {
    if (event.target === modal) {
      closeModal();
    }
  });
  
  // Return control functions
  return {
    open: openModal,
    close: closeModal
  };
}

// Register global Escape key handler for modals
document.addEventListener('keydown', function(event) {
  if (event.key === 'Escape') {
    document.querySelectorAll('.modal--active').forEach(activeModal => {
      activeModal.classList.remove('modal--active');
      document.body.style.overflow = '';
    });
  }
});

/**
 * Set up profile picture upload and preview functionality
 */
function setupProfilePictureUpload() {
  const fileInput = document.getElementById('profilePictureInput');
  const previewImage = document.getElementById('profilePicturePreview');
  const mainProfileImage = document.getElementById('mainProfileImage');
  
  if (fileInput) {
    fileInput.addEventListener('change', function() {
      const file = this.files[0];
      if (file) {
        const reader = new FileReader();
        
        reader.onload = function(e) {
          previewImage.src = e.target.result;
          
          if (mainProfileImage) {
            mainProfileImage.src = e.target.result;
          }
          
          sessionStorage.setItem('profile_picture', e.target.result);
        };
        
        reader.readAsDataURL(file);
      }
    });
  }
}

/**
 * Update profile display in the UI
 */
function updateProfileDisplay(name) {
  const headerTitle = document.querySelector('.header__content h1');
  if (headerTitle) {
    headerTitle.textContent = `Hello, ${name}!`;
  }
  
  const profileName = document.querySelector('.profile__info h2');
  if (profileName) {
    profileName.textContent = name;
  }
  
  sessionStorage.setItem('user_name', name);
}

/**
 * Display a toast notification
 */
function showToast(message) {
  let toast = document.getElementById('toast-notification');
  
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast-notification';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  
  toast.textContent = message;
  toast.classList.add('toast--visible');
  
  setTimeout(() => {
    toast.classList.remove('toast--visible');
  }, 3000);
}

/**
 * Show validation error message
 */
function showValidationError(message) {
  alert(message);
}

// ... Password functionality ...
function setupPasswordToggles() {
  const toggles = document.querySelectorAll('.password-toggle');
  
  toggles.forEach(toggle => {
    toggle.addEventListener('click', function() {
      const input = this.previousElementSibling;
      const icon = this.querySelector('i');
      
      if (input.type === 'password') {
        input.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
      } else {
        input.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
      }
    });
  });
}

function isPasswordValid(password) {
  const minLength = 8;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);
  
  return password.length >= minLength && hasUpperCase && hasNumber && hasSpecial;
}

function setupPasswordValidation() {
  const newPassword = document.getElementById('newPassword');
  const confirmPassword = document.getElementById('confirmPassword');
  const passwordStrength = document.getElementById('passwordStrength');
  const strengthText = document.getElementById('strengthText');
  const passwordMatch = document.getElementById('passwordMatch');
  
  if (newPassword) {
    newPassword.addEventListener('input', function() {
      validatePassword(this.value);
    });
  }
  
  if (confirmPassword) {
    confirmPassword.addEventListener('input', function() {
      validatePasswordMatch(newPassword.value, this.value);
    });
  }
  
  function validatePassword(password) {
    const lengthCheck = document.getElementById('length-check');
    const uppercaseCheck = document.getElementById('uppercase-check');
    const numberCheck = document.getElementById('number-check');
    const specialCheck = document.getElementById('special-check');
    
    updateRequirement(lengthCheck, password.length >= 8);
    updateRequirement(uppercaseCheck, /[A-Z]/.test(password));
    updateRequirement(numberCheck, /[0-9]/.test(password));
    updateRequirement(specialCheck, /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password));
    
    let strength = 0;
    if (password.length >= 8) strength += 25;
    if (/[A-Z]/.test(password)) strength += 25;
    if (/[0-9]/.test(password)) strength += 25;
    if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) strength += 25;
    
    passwordStrength.style.width = strength + '%';
    passwordStrength.className = 'strength-meter__bar';
    
    if (strength <= 25) {
      passwordStrength.classList.add('weak');
      strengthText.textContent = 'Weak';
    } else if (strength <= 75) {
      passwordStrength.classList.add('medium');
      strengthText.textContent = 'Medium';
    } else {
      passwordStrength.classList.add('strong');
      strengthText.textContent = 'Strong';
    }
  }
  
  function updateRequirement(element, isValid) {
    if (isValid) {
      element.classList.add('valid');
      element.querySelector('i').className = 'fas fa-check-circle';
    } else {
      element.classList.remove('valid');
      element.querySelector('i').className = 'fas fa-circle';
    }
  }
  
  function validatePasswordMatch(password, confirmPassword) {
    if (!confirmPassword) {
      passwordMatch.textContent = '';
      return;
    }
    
    if (password === confirmPassword) {
      passwordMatch.textContent = 'Passwords match';
      passwordMatch.className = 'password-match-valid';
    } else {
      passwordMatch.textContent = 'Passwords do not match';
      passwordMatch.className = 'password-match-invalid';
    }
  }
}

/**
 * Set up log viewer functionality
 */
function setupLogViewer() {
  // Current state for pagination
  const state = {
    currentPage: 1,
    logsPerPage: 10,
    filteredLogs: [...mockLogs],
    searchTerm: '',
    filterType: 'all'
  };
  
  // Initial load of logs
  populateLogTable(state);
  
  // Search functionality
  const searchInput = document.getElementById('logSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', function() {
      state.searchTerm = this.value.toLowerCase();
      state.currentPage = 1;
      filterLogs(state);
      populateLogTable(state);
    });
  }
  
  // Clear search
  const clearSearch = document.getElementById('clearLogSearch');
  if (clearSearch) {
    clearSearch.addEventListener('click', function() {
      searchInput.value = '';
      state.searchTerm = '';
      filterLogs(state);
      populateLogTable(state);
    });
  }
  
  // Type filter
  const typeFilter = document.getElementById('logTypeFilter');
  if (typeFilter) {
    typeFilter.addEventListener('change', function() {
      state.filterType = this.value;
      state.currentPage = 1;
      filterLogs(state);
      populateLogTable(state);
    });
  }
  
  // Pagination buttons
  const prevBtn = document.getElementById('prevLogPage');
  const nextBtn = document.getElementById('nextLogPage');
  
  if (prevBtn) {
    prevBtn.addEventListener('click', function() {
      if (state.currentPage > 1) {
        state.currentPage--;
        populateLogTable(state);
      }
    });
  }
  
  if (nextBtn) {
    nextBtn.addEventListener('click', function() {
      const totalPages = Math.ceil(state.filteredLogs.length / state.logsPerPage);
      if (state.currentPage < totalPages) {
        state.currentPage++;
        populateLogTable(state);
      }
    });
  }
}

/**
 * Filter logs based on search term and filter type
 */
function filterLogs(state) {
  state.filteredLogs = mockLogs.filter(log => {
    // Type filter
    const typeMatch = state.filterType === 'all' || log.type === state.filterType;
    
    // Search filter (check in all fields)
    const searchMatch = state.searchTerm === '' || 
      log.user.toLowerCase().includes(state.searchTerm) || 
      log.action.toLowerCase().includes(state.searchTerm) ||
      log.timestamp.toLowerCase().includes(state.searchTerm);
    
    return typeMatch && searchMatch;
  });
}

/**
 * Populate the log table with filtered data
 */
function populateLogTable(state) {
  const tableBody = document.getElementById('logTableBody');
  if (!tableBody) return;
  
  // Clear the table
  tableBody.innerHTML = '';
  
  // Calculate pagination
  const startIndex = (state.currentPage - 1) * state.logsPerPage;
  const endIndex = startIndex + state.logsPerPage;
  const paginatedLogs = state.filteredLogs.slice(startIndex, endIndex);
  
  // Add each log entry to the table
  paginatedLogs.forEach(log => {
    const row = document.createElement('tr');
    
    // Add status class based on log status
    row.classList.add(`log-status-${log.status}`);
    
    row.innerHTML = `
      <td class="log-timestamp">${log.timestamp}</td>
      <td class="log-user">${log.user}</td>
      <td class="log-action">${log.action}</td>
      <td class="log-status">
        <span class="status-badge status-${log.status}">
          ${log.status.charAt(0).toUpperCase() + log.status.slice(1)}
        </span>
      </td>
    `;
    
    tableBody.appendChild(row);
  });
  
  // Update pagination UI
  updatePagination(state);
}

/**
 * Update pagination buttons and indicator
 */
function updatePagination(state) {
  const prevBtn = document.getElementById('prevLogPage');
  const nextBtn = document.getElementById('nextLogPage');
  const pageIndicator = document.getElementById('logPageIndicator');
  
  const totalPages = Math.ceil(state.filteredLogs.length / state.logsPerPage);
  
  if (prevBtn) {
    prevBtn.disabled = state.currentPage === 1;
  }
  
  if (nextBtn) {
    nextBtn.disabled = state.currentPage === totalPages || totalPages === 0;
  }
  
  if (pageIndicator) {
    pageIndicator.textContent = `Page ${state.currentPage} of ${totalPages || 1}`;
  }
}
