/**
 * Profile Password Management Functionality
 * Handles password validation, toggling, and update operations
 */

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
  
  // Show loading indicator
  const saveButton = document.getElementById('savepasswordModal');
  const originalText = saveButton.textContent;
  saveButton.textContent = 'Memperbarui...';
  saveButton.disabled = true;
  
  // Send update to server
  fetch('/profile/password', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({ 
      currentPassword: currentPassword,
      newPassword: newPassword
    })
  })
  .then(response => response.json())
  .then(data => {
    // Reset button state
    saveButton.textContent = originalText;
    saveButton.disabled = false;
    
    if (data.status === 'success') {
      // Clear form fields
      document.getElementById('currentPassword').value = '';
      document.getElementById('newPassword').value = '';
      document.getElementById('confirmPassword').value = '';
      
      // Reset password strength UI
      const strengthMeter = document.getElementById('passwordStrength');
      if (strengthMeter) {
        strengthMeter.style.width = '0%';
        strengthMeter.className = 'strength-meter__bar';
      }
      
      // Reset requirement indicators
      document.querySelectorAll('.requirements-list li').forEach(item => {
        item.classList.remove('valid');
        const icon = item.querySelector('i');
        if (icon) icon.className = 'fas fa-circle';
      });
      
      closeModal();
      showToast(data.message);
    } else {
      showValidationError(data.message || 'Gagal memperbarui kata sandi');
    }
  })
  .catch(error => {
    // Reset button state
    saveButton.textContent = originalText;
    saveButton.disabled = false;
    
    console.error('Error updating password:', error);
    showValidationError('Terjadi kesalahan saat memperbarui kata sandi');
  });
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

// Export functions to make them available to profile-page.js
window.passwordModule = {
  handlePasswordUpdate,
  setupPasswordToggles,
  isPasswordValid,
  setupPasswordValidation
};
