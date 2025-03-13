/**
 * Profile page specific functionality
 * This file handles all interactions specific to the profile page
 * including preferences, modal interactions, and profile data management
 */

document.addEventListener('DOMContentLoaded', function() {
  // Initialize the profile modal with enhanced functionality
  const profileModalControl = initModal('profileModal', 'openProfileModal', function(modal, closeModal) {
    // Get values from form
    const displayName = document.getElementById('displayName').value;
    
    // Simple validation
    if (!displayName.trim()) {
      alert('Please enter a valid display name');
      return;
    }
    
    console.log('Saving profile with name:', displayName);
    
    // Update the profile display in the UI without refreshing
    updateProfileDisplay(displayName);
    
    // Close modal after successful update
    closeModal();
    
    // Show a success message
    showToast('Profile updated successfully!');
  });
  
  // Initialize the password change modal
  const passwordModalControl = initModal('passwordModal', 'openPasswordModal', function(modal, closeModal) {
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    
    // Validate inputs
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
    
    // In a real app, we would send this to the server
    console.log('Password change requested');
    
    // Close the modal
    closeModal();
    
    // Show a success message
    showToast('Password changed successfully!');
  });
  
  // Set up password visibility toggles
  setupPasswordToggles();
  
  // Set up password validation
  setupPasswordValidation();
  
  // Profile picture preview functionality
  setupProfilePictureUpload();
});

/**
 * Set up profile picture upload and preview functionality
 */
function setupProfilePictureUpload() {
  const fileInput = document.getElementById('profilePictureInput');
  const previewImage = document.getElementById('profilePicturePreview');
  const mainProfileImage = document.getElementById('mainProfileImage');
  
  // Handle file selection
  if (fileInput) {
    fileInput.addEventListener('change', function() {
      const file = this.files[0];
      if (file) {
        const reader = new FileReader();
        
        reader.onload = function(e) {
          // Set the preview image source
          previewImage.src = e.target.result;
          previewImage.style.display = 'block';
          
          // Also update the main profile image
          if (mainProfileImage) {
            mainProfileImage.src = e.target.result;
          }
          
          // Store in session storage for demo purposes
          sessionStorage.setItem('profile_picture', e.target.result);
        };
        
        reader.readAsDataURL(file);
      }
    });
  } else {
    console.error('Profile picture input element not found');
  }
}

/**
 * Update profile display in the UI
 */
function updateProfileDisplay(name) {
  // Update header greeting
  const headerTitle = document.querySelector('.header__content h1');
  if (headerTitle) {
    headerTitle.textContent = `Hello, ${name}!`;
  }
  
  // Update profile card
  const profileName = document.querySelector('.profile__info h2');
  if (profileName) {
    profileName.textContent = name;
  }
  
  // Store in session storage for demo purposes
  sessionStorage.setItem('user_name', name);
}

/**
 * Display a toast notification
 */
function showToast(message) {
  // Create toast element if it doesn't exist
  let toast = document.getElementById('toast-notification');
  
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast-notification';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  
  // Set message and show toast
  toast.textContent = message;
  toast.classList.add('toast--visible');
  
  // Hide after 3 seconds
  setTimeout(() => {
    toast.classList.remove('toast--visible');
  }, 3000);
}

/**
 * Set up password visibility toggle buttons
 */
function setupPasswordToggles() {
  const toggles = document.querySelectorAll('.password-toggle');
  
  toggles.forEach(toggle => {
    toggle.addEventListener('click', function() {
      const input = this.previousElementSibling;
      const icon = this.querySelector('i');
      
      // Toggle password visibility
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

/**
 * Check if a password meets all requirements
 */
function isPasswordValid(password) {
  const minLength = 8;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);
  
  return password.length >= minLength && hasUpperCase && hasNumber && hasSpecial;
}

/**
 * Set up real-time password validation feedback
 */
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
  
  // Check password requirements
  function validatePassword(password) {
    // Check individual requirements
    const lengthCheck = document.getElementById('length-check');
    const uppercaseCheck = document.getElementById('uppercase-check');
    const numberCheck = document.getElementById('number-check');
    const specialCheck = document.getElementById('special-check');
    
    // Update requirement indicators
    updateRequirement(lengthCheck, password.length >= 8);
    updateRequirement(uppercaseCheck, /[A-Z]/.test(password));
    updateRequirement(numberCheck, /[0-9]/.test(password));
    updateRequirement(specialCheck, /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password));
    
    // Calculate strength
    let strength = 0;
    if (password.length >= 8) strength += 25;
    if (/[A-Z]/.test(password)) strength += 25;
    if (/[0-9]/.test(password)) strength += 25;
    if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) strength += 25;
    
    // Update strength meter
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
  
  // Update requirement indicators
  function updateRequirement(element, isValid) {
    if (isValid) {
      element.classList.add('valid');
      element.querySelector('i').className = 'fas fa-check-circle';
    } else {
      element.classList.remove('valid');
      element.querySelector('i').className = 'fas fa-circle';
    }
  }
  
  // Check if passwords match
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
 * Show validation error message
 */
function showValidationError(message) {
  alert(message);
}
