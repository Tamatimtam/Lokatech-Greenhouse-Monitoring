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
  
  // Profile picture preview functionality
  setupProfilePictureUpload();
  
  // Toggle switches (preferences)
  document.getElementById('darkModeSwitch').addEventListener('change', function() {
    console.log('Dark mode toggled:', this.checked);
    // Toggle dark mode classes on body
    if (this.checked) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
  });
  
  document.getElementById('notificationsSwitch').addEventListener('change', function() {
    console.log('Notifications toggled:', this.checked);
    // Store preference in localStorage
    localStorage.setItem('notifications_enabled', this.checked);
  });
});

/**
 * Set up profile picture upload and preview functionality
 */
function setupProfilePictureUpload() {
  const fileInput = document.getElementById('profilePictureInput');
  const previewImage = document.getElementById('profilePicturePreview');
  
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
