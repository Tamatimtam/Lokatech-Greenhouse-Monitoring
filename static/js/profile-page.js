/**
 * Profile page functionality
 * Combines modal functionality and profile-specific features
 */

// Moved from profile-password.js
/**
 * Set up password visibility toggles for all relevant password inputs
 */
function setupPasswordToggles() {
  const toggles = document.querySelectorAll('.password-toggle');
  
  toggles.forEach(toggle => {
    // Check if listener already attached to prevent duplicates if this function is called multiple times
    if (toggle.dataset.listenerAttached === 'true') return;

    toggle.addEventListener('click', function() {
      const input = this.previousElementSibling; // Assumes input is direct sibling before button
      const icon = this.querySelector('i');
      
      if (input && input.matches('input[type="password"], input[type="text"]')) {
        const isPasswordVisible = input.type === 'text';
        input.type = isPasswordVisible ? 'password' : 'text';
        if (icon) {
          icon.className = isPasswordVisible ? 'fas fa-eye' : 'fas fa-eye-slash';
        }
      } else {
        console.warn('Password toggle button is not adjacent to a password input field or input field is missing.');
      }
    });
    toggle.dataset.listenerAttached = 'true'; // Mark as listener attached
  });
}


document.addEventListener('DOMContentLoaded', function() {
  // Initialize modals with their specific validation logic
  initModal('profileModal', 'openProfileModal', handleProfileUpdate);
  // Updated handler for passwordModal
  initModal('passwordModal', 'openPasswordModal', handleRequestPasswordChangeEmail); 
  initModal('deleteAccountModal', 'openDeleteAccountModal', handleDeleteAccount); 
  initModal('logoutModal', 'logoutButton', handleLogout);
  
  // Set up other functionality
  setupPasswordToggles(); // Call the moved function
  // Removed: window.passwordModule.setupPasswordValidation();
  
  // Register global Escape key handler for modals
  document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
      closeAllModals();
    }
  });
});

/**
 * Profile update handler
 * @param {HTMLElement} modal - The modal element
 * @param {Function} closeModal - Function to close the modal
 */
function handleProfileUpdate(modal, closeModal) {
  const displayName = document.getElementById('displayName').value;
  
  if (!displayName.trim()) {
    showValidationError('Harap masukkan nama tampilan yang valid');
    return;
  }
  
  // Show loading indicator
  const saveButton = document.getElementById('saveprofileModal');
  const originalText = saveButton.textContent;
  saveButton.textContent = 'Menyimpan...';
  saveButton.disabled = true;
  
  // Send update to server
  fetch('/profile/update', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({ displayName: displayName })
  })
  .then(response => response.json())
  .then(data => {
    // Reset button state
    saveButton.textContent = originalText;
    saveButton.disabled = false;
    
    if (data.status === 'success') {
      updateProfileDisplay(displayName);
      closeModal();
      showToast('Profil berhasil diperbarui!');
    } else {
      showValidationError(data.message || 'Gagal memperbarui profil');
    }
  })
  .catch(error => {
    // Reset button state
    saveButton.textContent = originalText;
    saveButton.disabled = false;
    
    console.error('Error updating profile:', error);
    showValidationError('Terjadi kesalahan saat memperbarui profil');
  });
}

/**
 * New handler for requesting password change email
 * @param {HTMLElement} modal - The modal element
 * @param {Function} closeModal - Function to close the modal
 */
async function handleRequestPasswordChangeEmail(modal, closeModal) {
  const userEmailElement = document.getElementById('userEmailForPasswordChange');
  const userEmail = userEmailElement ? userEmailElement.textContent : document.getElementById('emailAddress')?.value;

  if (!userEmail) {
    showValidationError('Tidak dapat menemukan alamat email pengguna.');
    return;
  }

  const saveButton = document.getElementById('savepasswordModal'); // Assumes this is the ID of the "Kirim Email" button
  const originalText = saveButton.textContent;
  saveButton.textContent = 'Mengirim...';
  saveButton.disabled = true;

  try {
    await firebase.auth().sendPasswordResetEmail(userEmail);
    showToast(`Email untuk mengubah kata sandi telah dikirim ke ${userEmail}. Silakan periksa kotak masuk Anda.`);
    closeModal();
  } catch (error) {
    console.error('Error sending password reset email:', error);
    showValidationError(error.message || 'Gagal mengirim email perubahan kata sandi.');
  } finally {
    saveButton.textContent = originalText;
    saveButton.disabled = false;
  }
}

/**
 * Initialize a modal component
 * @param {string} modalId - The ID of the modal element
 * @param {string} openerId - The ID of the element that opens the modal
 * @param {Function} onSave - Optional callback function when save button is clicked
 * @returns {Object|null} - Modal control functions or null if initialization failed
 */
function initModal(modalId, openerId, onSave = null) {
  const modal = document.getElementById(modalId);
  const opener = document.getElementById(openerId);
  
  if (!modal || !opener) {
    console.error(`Modal initialization failed: Elements not found. Modal: ${modalId}, Opener: ${openerId}`);
    return null;
  }
  
  const closeBtn = document.getElementById('close' + modalId);
  const cancelBtn = document.getElementById('cancel' + modalId);
  const saveBtn = document.getElementById('save' + modalId);
  
  // Open modal function
  function openModal() {
    modal.classList.add('modal--active');
    document.body.style.overflow = 'hidden';
    // If it's the password change modal, update the email display just in case
    if (modalId === 'passwordModal') {
        const userEmailForDisplay = document.getElementById('userEmailForPasswordChange');
        const currentProfileEmail = document.getElementById('emailAddress')?.value;
        if (userEmailForDisplay && currentProfileEmail) {
            userEmailForDisplay.textContent = currentProfileEmail;
        }
    }
  }
  
  // Close modal function - Enhanced for robustness
  function closeModal() {
    try {
      // Hide the modal first
      modal.classList.remove('modal--active');
      document.body.style.overflow = '';

      // Clear form fields safely
      const formInputs = modal.querySelectorAll('input:not([disabled])');
      formInputs.forEach(input => {
        try { // Add inner try-catch for robustness during field clearing
          if (input.type === 'file') return; 

          // Reset password fields specifically (still relevant for deleteAccountModal)
          if (input.type === 'password') {
              input.value = '';
              // Also reset the eye icon if it was toggled
              const toggleContainer = input.closest('.password-input-container');
              if (toggleContainer) {
                  const toggleBtnIcon = toggleContainer.querySelector('.password-toggle i');
                  if (toggleBtnIcon && toggleBtnIcon.classList.contains('fa-eye-slash')) {
                      input.type = 'password'; // Ensure it's password type
                      toggleBtnIcon.className = 'fas fa-eye'; // Reset icon
                  }
              }
          } else if (input.id !== 'displayName' && input.id !== 'emailAddress' && input.id !== 'userRole') {
              // Avoid clearing pre-filled profile info unless it's a password
              // Check if the input is within the current modal before clearing
              if (modal.contains(input)) {
                  input.value = '';
              }
          }
        } catch (clearError) {
          console.error(`Error clearing input field ${input.id}:`, clearError);
        }
      });

      // Removed cleanup for password strength meter, match indicator, and requirements list
      // as they are no longer part of the simplified passwordModal.

    } catch (error) {
      console.error(`Error in closeModal for ${modalId}:`, error);
      // Ensure modal is hidden even if field clearing fails
      modal.classList.remove('modal--active');
      document.body.style.overflow = '';
    }
  }
  
  // Event listeners
  opener.addEventListener('click', openModal);
  
  if (closeBtn) {
      closeBtn.addEventListener('click', closeModal);
  }
  
  // Ensure cancel button listener is correctly attached
  if (cancelBtn) {
    cancelBtn.addEventListener('click', closeModal);
  } else {
    // Add a warning if the cancel button isn't found, helps debugging
    console.warn(`Modal ${modalId}: Cancel button (id: cancel${modalId}) not found.`);
  }
  
  if (saveBtn) {
    saveBtn.addEventListener('click', function() {
      if (onSave && typeof onSave === 'function') {
        onSave(modal, closeModal);
      } else {
        // If there's no specific save action, default to closing the modal
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

/**
 * Close all active modals
 */
function closeAllModals() {
  document.querySelectorAll('.modal--active').forEach(activeModal => {
    activeModal.classList.remove('modal--active');
  });
  document.body.style.overflow = '';
}

/**
 * Update profile display in the UI
 * @param {string} name - The display name to update
 */
function updateProfileDisplay(name) {
  const headerTitle = document.querySelector('.header__content h1');
  const profileName = document.querySelector('.profile__info h2');
  
  if (headerTitle) headerTitle.textContent = `Halo, ${name}!`;
  if (profileName) profileName.textContent = name;
  
  sessionStorage.setItem('user_name', name);
}

/**
 * Display a toast notification
 * @param {string} message - The message to display
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
  
  // Clear any existing timeout to prevent issues
  if (toast.timeoutId) clearTimeout(toast.timeoutId);
  
  toast.timeoutId = setTimeout(() => {
    toast.classList.remove('toast--visible');
  }, 3000);
}

/**
 * Show validation error message
 * @param {string} message - The error message
 */
function showValidationError(message) {
  let errorToast = document.getElementById('error-toast');
  
  if (!errorToast) {
    errorToast = document.createElement('div');
    errorToast.id = 'error-toast';
    errorToast.className = 'toast toast--error';
    document.body.appendChild(errorToast);
  }
  
  errorToast.textContent = message;
  errorToast.classList.add('toast--visible');
  
  if (errorToast.timeoutId) clearTimeout(errorToast.timeoutId);
  
  errorToast.timeoutId = setTimeout(() => {
    errorToast.classList.remove('toast--visible');
  }, 3000);
}

/**
 * Handle delete account process
 * @param {HTMLElement} modal - The modal element
 * // Remove unused closeModal parameter
 */
function handleDeleteAccount(modal) { 
  const passwordInput = document.getElementById('deleteAccountPassword');
  const confirmButton = document.getElementById('savedeleteAccountModal'); // Target the correct button
  
  if (!passwordInput || !confirmButton) {
    console.error('Delete account password input or confirm button not found');
    showValidationError('Terjadi kesalahan internal.');
    return;
  }

  const password = passwordInput.value;
    
  if (!password) {
    // This error message should now only show if the field is truly empty
    showValidationError('Silakan masukkan kata sandi Anda untuk konfirmasi');
    return;
  }
  
  // Show loading state
  const originalText = confirmButton.textContent; // Store original text
  confirmButton.disabled = true;
  confirmButton.textContent = 'Menghapus...';
  
  // Send delete request
  deleteAccount(password)
    .then(data => {
      if (data.status === 'success') {
        // Don't reset button on success, as we are redirecting
        showToast('Akun berhasil dihapus');
        setTimeout(() => {
          window.location.href = '/'; // Redirect to login page
        }, 1500);
      } else {
        // Reset button state only on failure
        confirmButton.disabled = false;
        confirmButton.textContent = originalText; // Restore original text
        
        // Show error
        showValidationError(data.message || 'Gagal menghapus akun');
      }
    })
    .catch(error => {
      // Reset button state on fetch error
      confirmButton.disabled = false;
      confirmButton.textContent = originalText; // Restore original text
      
      console.error('Error deleting account:', error);
      showValidationError('Terjadi kesalahan saat menghapus akun');
    });
}

/**
 * Delete user account with password confirmation
 * @param {string} password - User's password for verification
 * @returns {Promise<Object>} - API response
 */
function deleteAccount(password) {
  return fetch('/profile/delete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({ password: password })
  })
  .then(response => {
    if (!response.ok && response.status !== 401) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    return response.json();
  });
}

/**
 * Handle logout process
 * @param {HTMLElement} modal - The modal element
 * @param {Function} closeModal - Function to close the modal
 */
function handleLogout(modal, closeModal) {
  // Show loading state
  const logoutButton = document.getElementById('savelogoutModal');
  const originalText = logoutButton.textContent;
  logoutButton.textContent = 'Keluar...';
  logoutButton.disabled = true;
  
  // Send logout request as POST for CSRF protection
  fetch('/auth/logout', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    }
  })
  .then(response => {
    // Clear client-side storage
    sessionStorage.clear();
    
    // Redirect to login page
    window.location.href = '/';
  })
  .catch(error => {
    console.error('Logout error:', error);
    
    // Reset button state if there's an error
    logoutButton.textContent = originalText;
    logoutButton.disabled = false;
    
    // Show error message
    showValidationError('Terjadi kesalahan saat keluar. Silakan coba lagi.');
    
    // Fallback to simple redirect if fetch fails
    setTimeout(() => {
      window.location.href = '/auth/logout';
    }, 2000);
  });
}