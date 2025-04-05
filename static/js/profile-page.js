/**
 * Profile page functionality
 * Combines modal functionality and profile-specific features
 */

document.addEventListener('DOMContentLoaded', function() {
  // Initialize modals with their specific validation logic
  initModal('profileModal', 'openProfileModal', handleProfileUpdate);
  initModal('passwordModal', 'openPasswordModal', handlePasswordUpdate);
  
  // Set up other functionality
  setupPasswordToggles();
  setupPasswordValidation();
  setupProfilePictureUpload();
  
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
  
  updateProfileDisplay(displayName);
  closeModal();
  showToast('Profil berhasil diperbarui!');
}

/**
 * Password update handler
 * @param {HTMLElement} modal - The modal element
 * @param {Function} closeModal - Function to close the modal
 */
function handlePasswordUpdate(modal, closeModal) {
  const currentPassword = document.getElementById('currentPassword').value;
  const newPassword = document.getElementById('newPassword').value;
  const confirmPassword = document.getElementById('confirmPassword').value;
  
  // Validate inputs
  if (!currentPassword) {
    showValidationError('Kata sandi saat ini diperlukan');
    return;
  }
  
  if (!isPasswordValid(newPassword)) {
    showValidationError('Harap penuhi semua persyaratan kata sandi');
    return;
  }
  
  if (newPassword !== confirmPassword) {
    showValidationError('Kata sandi tidak cocok');
    return;
  }
  
  closeModal();
  showToast('Kata sandi berhasil diubah!');
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
  }
  
  // Close modal function
  function closeModal() {
    modal.classList.remove('modal--active');
    document.body.style.overflow = '';
    
    // Clear form fields if needed
    const formInputs = modal.querySelectorAll('input:not([disabled])');
    formInputs.forEach(input => {
      if (input.type === 'file') return; // Don't clear file inputs
      input.value = '';
    });
  }
  
  // Event listeners
  opener.addEventListener('click', openModal);
  
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
  
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
 * Set up profile picture upload and preview functionality
 */
function setupProfilePictureUpload() {
  const fileInput = document.getElementById('profilePictureInput');
  const previewImage = document.getElementById('profilePicturePreview');
  const mainProfileImage = document.getElementById('mainProfileImage');
  
  if (!fileInput) return;
  
  fileInput.addEventListener('change', function() {
    const file = this.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    
    reader.onload = function(e) {
      const imageData = e.target.result;
      
      if (previewImage) previewImage.src = imageData;
      if (mainProfileImage) mainProfileImage.src = imageData;
      
      sessionStorage.setItem('profile_picture', imageData);
    };
    
    reader.readAsDataURL(file);
  });
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
 * Set up password visibility toggles
 */
function setupPasswordToggles() {
  const toggles = document.querySelectorAll('.password-toggle');
  
  toggles.forEach(toggle => {
    toggle.addEventListener('click', function() {
      const input = this.previousElementSibling;
      const icon = this.querySelector('i');
      
      const isPasswordVisible = input.type === 'text';
      
      input.type = isPasswordVisible ? 'password' : 'text';
      icon.className = isPasswordVisible ? 'fas fa-eye' : 'fas fa-eye-slash';
    });
  });
}

/**
 * Check if a password meets security requirements
 * @param {string} password - The password to validate
 * @returns {boolean} - Whether the password is valid
 */
function isPasswordValid(password) {
  const minLength = 8;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);
  
  return password.length >= minLength && hasUpperCase && hasNumber && hasSpecial;
}

/**
 * Set up password validation UI
 */
function setupPasswordValidation() {
  const newPassword = document.getElementById('newPassword');
  const confirmPassword = document.getElementById('confirmPassword');
  const passwordStrength = document.getElementById('passwordStrength');
  const strengthText = document.getElementById('strengthText');
  const passwordMatch = document.getElementById('passwordMatch');
  
  if (!newPassword || !confirmPassword) return;
  
  newPassword.addEventListener('input', function() {
    validatePassword(this.value);
    
    // Re-check match if confirm password has a value
    if (confirmPassword.value) {
      validatePasswordMatch(this.value, confirmPassword.value);
    }
  });
  
  confirmPassword.addEventListener('input', function() {
    validatePasswordMatch(newPassword.value, this.value);
  });
  
  /**
   * Validate password strength and update UI
   * @param {string} password - The password to validate
   */
  function validatePassword(password) {
    const requirements = [
      { id: 'length-check', test: () => password.length >= 8 },
      { id: 'uppercase-check', test: () => /[A-Z]/.test(password) },
      { id: 'number-check', test: () => /[0-9]/.test(password) },
      { id: 'special-check', test: () => /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password) }
    ];
    
    // Update each requirement indicator
    let strength = 0;
    requirements.forEach(req => {
      const isValid = req.test();
      updateRequirement(document.getElementById(req.id), isValid);
      if (isValid) strength += 25;
    });
    
    // Update strength meter
    if (passwordStrength) {
      passwordStrength.style.width = strength + '%';
      passwordStrength.className = 'strength-meter__bar';
      
      if (strength <= 25) {
        passwordStrength.classList.add('weak');
        if (strengthText) strengthText.textContent = 'Lemah';
      } else if (strength <= 75) {
        passwordStrength.classList.add('medium');
        if (strengthText) strengthText.textContent = 'Sedang';
      } else {
        passwordStrength.classList.add('strong');
        if (strengthText) strengthText.textContent = 'Kuat';
      }
    }
  }
  
  /**
   * Update a requirement indicator
   * @param {HTMLElement} element - The requirement element
   * @param {boolean} isValid - Whether the requirement is met
   */
  function updateRequirement(element, isValid) {
    if (!element) return;
    
    if (isValid) {
      element.classList.add('valid');
      const icon = element.querySelector('i');
      if (icon) icon.className = 'fas fa-check-circle';
    } else {
      element.classList.remove('valid');
      const icon = element.querySelector('i');
      if (icon) icon.className = 'fas fa-circle';
    }
  }
  
  /**
   * Validate password match and update UI
   * @param {string} password - The original password
   * @param {string} confirmPassword - The confirmation password
   */
  function validatePasswordMatch(password, confirmPassword) {
    if (!passwordMatch) return;
    
    if (!confirmPassword) {
      passwordMatch.textContent = '';
      return;
    }
    
    const doPasswordsMatch = password === confirmPassword;
    passwordMatch.textContent = doPasswordsMatch ? 'Kata sandi cocok' : 'Kata sandi tidak cocok';
    passwordMatch.className = doPasswordsMatch ? 'password-match-valid' : 'password-match-invalid';
  }
}

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