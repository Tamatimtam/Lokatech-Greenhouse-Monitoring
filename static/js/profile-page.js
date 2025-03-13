/**
 * Profile page functionality
 * Combines modal functionality and profile-specific features
 */

// Mock user data for demonstration
const mockUsers = [
  { id: 1, username: 'john_doe', email: 'john@example.com' },
  { id: 2, username: 'jane_smith', email: 'jane@example.com' },
  { id: 3, username: 'bob_johnson', email: 'bob@example.com' },
  { id: 4, username: 'alice_green', email: 'alice@example.com' }
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
  
  // Initialize user management modal
  const userManagementModalControl = initModal('userManagementModal', 'openUserManagementModal');
  
  // Set up other functionality
  setupPasswordToggles();
  setupPasswordValidation();
  setupProfilePictureUpload();
  setupUserManagement();
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

// ... User management functionality ...
function setupUserManagement() {
  populateUserTable();
  
  const addUserBtn = document.getElementById('addUserBtn');
  if (addUserBtn) {
    addUserBtn.addEventListener('click', addNewUser);
  }
}

function populateUserTable() {
  const tableBody = document.getElementById('userTableBody');
  if (!tableBody) return;
  
  tableBody.innerHTML = '';
  
  mockUsers.forEach(user => {
    const row = document.createElement('tr');
    row.dataset.userId = user.id;
    
    row.innerHTML = `
      <td>${user.username}</td>
      <td>${user.email}</td>
      <td>
        <button class="delete-user-btn" data-user-id="${user.id}" title="Delete User">
          <i class="fas fa-trash-alt"></i>
        </button>
      </td>
    `;
    
    tableBody.appendChild(row);
  });
  
  document.querySelectorAll('.delete-user-btn').forEach(button => {
    button.addEventListener('click', function() {
      const userId = this.getAttribute('data-user-id');
      deleteUser(userId);
    });
  });
}

function addNewUser() {
  const usernameInput = document.getElementById('newUsername');
  const emailInput = document.getElementById('newUserEmail');
  const passwordInput = document.getElementById('newUserPassword');
  
  if (!usernameInput.value || !emailInput.value || !passwordInput.value) {
    showValidationError('All fields are required');
    return;
  }
  
  if (!validateEmail(emailInput.value)) {
    showValidationError('Please enter a valid email address');
    return;
  }
  
  const newUser = {
    id: mockUsers.length + 1,
    username: usernameInput.value,
    email: emailInput.value
  };
  
  mockUsers.push(newUser);
  populateUserTable();
  showToast('User added successfully!');
  
  usernameInput.value = '';
  emailInput.value = '';
  passwordInput.value = '';
}

function deleteUser(userId) {
  if (!confirm('Are you sure you want to delete this user?')) {
    return;
  }
  
  const index = mockUsers.findIndex(user => user.id == userId);
  
  if (index !== -1) {
    mockUsers.splice(index, 1);
    populateUserTable();
    showToast('User deleted successfully!');
  }
}

function validateEmail(email) {
  const re = /\S+@\S+\.\S+/;
  return re.test(email);
}
