# LokaTech Greenhouse Monitoring - Profile System Documentation

## Table of Contents
1. [Quick Reference Guide](#quick-reference-guide)
2. [File Location Map](#file-location-map)
3. [HTML Structure & Components](#html-structure--components)
4. [JavaScript Functionality](#javascript-functionality)
5. [CSS Styling Guide](#css-styling-guide)
6. [Backend Integration](#backend-integration)
7. [Flow Diagrams](#flow-diagrams)

## Quick Reference Guide

| Feature | Primary File | Key Functions | Related Files |
|---------|-------------|---------------|--------------|
| Profile Page Rendering | `blueprints/profile/routes.py` | `profile()` | `templates/profile.html` |
| Modal System | `static/js/profile-page.js` | `initModal()`, `closeAllModals()` | `templates/macros/modal.html` |
| Profile Updates | `static/js/profile-page.js` | `handleProfileUpdate()`, `updateProfileDisplay()` | `templates/profile.html` |
| Password Management | `static/js/profile-page.js` | `handlePasswordUpdate()`, `setupPasswordValidation()` | `templates/profile.html` |
| Profile Picture Upload | `static/js/profile-page.js` | `setupProfilePictureUpload()` | `templates/profile.html` |
| UI Notifications | `static/js/profile-page.js` | `showToast()`, `showValidationError()` | `static/css/profile-page.css` |

## File Location Map

### Backend Files (Python)

1. **Blueprint Definition**
   - **File:** `blueprints/profile/__init__.py`
   - **Purpose:** Creates the profile blueprint with URL prefix '/profile'
   - **Key Components:**
     ```python
     bp = Blueprint('profile', __name__, url_prefix='/profile')
     ```

2. **Route Handler**
   - **File:** `blueprints/profile/routes.py`
   - **Purpose:** Defines profile page route and handles authentication
   - **Key Components:**
     ```python
     @bp.route("/")
     @isloggedin
     def profile():
         return render_template("profile.html", user=session['user'])
     ```

### Frontend Files

1. **Main Template**
   - **File:** `templates/profile.html`
   - **Purpose:** Defines structure and components of the profile page
   - **Key Sections:**
     - Header (lines 18-25)
     - Profile info card (lines 27-37)
     - Account settings (lines 40-55)
     - Profile edit modal (lines 57-91)
     - Password change modal (lines 93-140)

2. **JavaScript**
   - **File:** `static/js/profile-page.js`
   - **Purpose:** Handles all interactive functionality
   - **Key Sections:**
     - Initialization (lines 5-18)
     - Profile update handling (lines 23-40)
     - Password update handling (lines 43-70)
     - Modal management (lines 73-140)
     - Profile picture functions (lines 143-180)
     - UI utilities (lines 183-222)
     - Password validation (lines 225-364)

3. **CSS Styling**
   - **File:** `static/css/profile-page.css`
   - **Purpose:** Profile-specific styles
   - **Key Sections:**
     - Profile component styles (lines 4-90)
     - Profile edit modal styles (lines 93-126)
     - Password form styles (lines 129-177)
     - Strength meter styles (lines 180-221)
     - Password requirements styles (lines 224-268)
     - Toast notification styles (lines 271-290)
     - Responsive adjustments (lines 293-312)

## HTML Structure & Components

### Profile Page Base (`templates/profile.html`)

The profile page is built as a Flask template that extends `base.html` and imports several macros for components.

**Import Section (Lines 1-8):**
```html
{% extends "base.html" %}
{% import "macros/gauges.html" as gauges %}
{% import "macros/card.html" as card %}
{% import "macros/controls.html" as controls %}
{% import "macros/status.html" as status %}
{% import "macros/navigation.html" as navigation %}
{% import "macros/modal.html" as modal %}
```

**Header Component (Lines 18-25):**
- Displays welcome message with user name
- Shows application logo
- Located at the top of the page

**Profile Information Card (Lines 27-37):**
- Uses the `card.card` macro from `templates/macros/card.html`
- Displays user's profile image (`id="mainProfileImage"`)
- Shows user's name and email
- CSS styles in `profile-page.css` (lines 7-37)

**Account Settings List (Lines 40-55):**
- Interactive list with three options:
  1. "Informasi Profil" (triggers profile modal)
  2. "Ubah Kata Sandi" (triggers password modal)
  3. "Keluar" (logout link)
- CSS styles in `profile-page.css` (lines 39-70)

### Modal Components

**Profile Edit Modal (Lines 57-91):**
- Uses `modal.modal` macro from `templates/macros/modal.html`
- ID: `profileModal`
- Opener: `openProfileModal`
- Contains:
  - Profile picture upload section (lines 59-70)
  - Display name field (lines 72-75)
  - Email field (disabled) (lines 77-81)
  - Role field (disabled) (lines 83-86)
- CSS styles in `profile-page.css` (lines 93-126)

**Password Change Modal (Lines 93-140):**
- ID: `passwordModal`
- Opener: `openPasswordModal`
- Contains:
  - Current password field (lines 96-103)
  - New password field with strength meter (lines 105-119)
  - Confirm password field (lines 121-129)
  - Password requirements list (lines 131-138)
- CSS styles in `profile-page.css` (lines 129-268)

## JavaScript Functionality

### Main Script (`static/js/profile-page.js`)

**Initialization (Lines 5-18):**
```javascript
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
```
- Runs when the DOM is loaded
- Initializes modals, password validation, and profile picture upload

### Profile Update Functions

**Profile Update Handler (Lines 23-40):**
```javascript
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
```
- Activated when saving the profile modal
- Validates and updates display name

**Profile Display Update (Lines 179-190):**
```javascript
function updateProfileDisplay(name) {
  const headerTitle = document.querySelector('.header__content h1');
  const profileName = document.querySelector('.profile__info h2');
  
  if (headerTitle) headerTitle.textContent = `Halo, ${name}!`;
  if (profileName) profileName.textContent = name;
  
  sessionStorage.setItem('user_name', name);
}
```
- Updates all name occurrences in the UI
- Stores name in sessionStorage for persistence

### Modal Management

**Modal Initialization (Lines 73-140):**
```javascript
function initModal(modalId, openerId, onSave = null) {
  const modal = document.getElementById(modalId);
  const opener = document.getElementById(openerId);
  
  if (!modal || !opener) {
    console.error(`Modal initialization failed: Elements not found`);
    return null;
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
    
    // Clear form fields if needed
    const formInputs = modal.querySelectorAll('input:not([disabled])');
    formInputs.forEach(input => {
      if (input.type === 'file') return; // Don't clear file inputs
      input.value = '';
    });
  }
  
  // Event listeners for open/close/save
  opener.addEventListener('click', openModal);
  
  // Additional event handlers for close button, cancel, save, etc.
  // ...
  
  return { open: openModal, close: closeModal };
}
```
- Creates and manages modals
- Sets up event listeners for opening/closing
- Handles save button interactions

**Modal Closing Function (Lines 143-149):**
```javascript
function closeAllModals() {
  document.querySelectorAll('.modal--active').forEach(activeModal => {
    activeModal.classList.remove('modal--active');
  });
  document.body.style.overflow = '';
}
```
- Closes all active modals
- Used by the Escape key handler

### Password Management

**Password Update Handler (Lines 43-70):**
```javascript
function handlePasswordUpdate(modal, closeModal) {
  const currentPassword = document.getElementById('currentPassword').value;
  const newPassword = document.getElementById('newPassword').value;
  const confirmPassword = document.getElementById('confirmPassword').value;
  
  // Validation logic
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
```
- Handles password update form submission
- Validates current, new, and confirm password fields

**Password Validation Setup (Lines 264-364):**
```javascript
function setupPasswordValidation() {
  const newPassword = document.getElementById('newPassword');
  const confirmPassword = document.getElementById('confirmPassword');
  const passwordStrength = document.getElementById('passwordStrength');
  const strengthText = document.getElementById('strengthText');
  const passwordMatch = document.getElementById('passwordMatch');
  
  // Event listeners for password fields
  newPassword.addEventListener('input', function() {
    validatePassword(this.value);
    // Re-check match if confirm has value
    if (confirmPassword.value) {
      validatePasswordMatch(this.value, confirmPassword.value);
    }
  });
  
  confirmPassword.addEventListener('input', function() {
    validatePasswordMatch(newPassword.value, this.value);
  });
  
  // Nested validation functions
  function validatePassword(password) {
    // Check requirements and update UI
  }
  
  function updateRequirement(element, isValid) {
    // Update requirement indicators
  }
  
  function validatePasswordMatch(password, confirmPassword) {
    // Check password match and update UI
  }
}
```
- Sets up real-time password validation
- Updates UI indicators for requirements and strength

**Password Visibility Toggles (Lines 227-246):**
```javascript
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
```
- Toggles password visibility for all password fields
- Changes eye icon based on current state

**Password Validation Check (Lines 248-262):**
```javascript
function isPasswordValid(password) {
  const minLength = 8;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);
  
  return password.length >= minLength && hasUpperCase && hasNumber && hasSpecial;
}
```
- Checks if a password meets all requirements
- Used by the password update handler

### Profile Picture Management

**Profile Picture Upload (Lines 152-177):**
```javascript
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
```
- Handles profile picture file selection
- Updates both the preview and main profile images
- Stores image data in sessionStorage

### UI Utilities

**Toast Notification (Lines 193-215):**
```javascript
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
```
- Creates or reuses a toast element
- Shows message for 3 seconds
- CSS styles in `profile-page.css` (lines 271-290)

**Validation Error (Lines 217-224):**
```javascript
function showValidationError(message) {
  alert(message);
  // Could be improved with a more user-friendly error display
}
```
- Shows validation errors using alert (basic implementation)

## CSS Styling Guide

### Profile Page Styles (`static/css/profile-page.css`)

**Profile Component Styles (Lines 4-90):**
- `.profile__image`: Profile picture styling (lines 7-14)
- `.profile__header`: Profile header layout (lines 16-20)
- `.profile__info`: Text information styling (lines 22-31)
- `.profile__list`: Settings list styling (lines 39-70)

**Profile Edit Modal Styles (Lines 93-126):**
- `.profile-edit__picture`: Profile picture container (lines 93-101)
- `.profile-edit__preview`: Image preview styling (lines 103-110)
- `.profile-edit__actions`: Button container (lines 112-115)
- `.profile-edit__upload-btn`: Upload button styling (lines 117-126)

**Password Form Styles (Lines 129-177):**
- `.password-edit`: Password form container (lines 129-132)
- `.password-input-container`: Input with toggle button (lines 134-138)
- `.password-toggle`: Visibility toggle button (lines 148-158)

**Strength Meter Styles (Lines 180-221):**
- `.strength-meter`: Progress bar container (lines 180-185)
- `.strength-meter__bar`: Progress indicator (lines 187-192)
- Color variations for different strength levels (lines 194-204)
- `.strength-text`: Description text (lines 206-209)
- Password match indicators (lines 211-221)

**Password Requirements Styles (Lines 224-268):**
- `.password-requirements`: Container styling (lines 224-229)
- `.requirements-list`: List styling (lines 235-238)
- List item and icon styles (lines 240-256)
- Valid requirement styles (lines 258-268)

**Toast Notification Styles (Lines 271-290):**
- `.toast`: Basic styling (lines 271-284)
- `.toast--visible`: Visible state styling (lines 286-288)

**Responsive Adjustments (Lines 293-312):**
- Tablet and mobile adaptations
- Changes layout for smaller screens

## Backend Integration

### Blueprint Setup (`blueprints/profile/__init__.py`)

```python
from flask import Blueprint

bp = Blueprint('profile', __name__, url_prefix='/profile')

from . import routes
```
- Creates a Blueprint named 'profile'
- Sets URL prefix to '/profile'
- Imports routes from the routes module

### Route Handler (`blueprints/profile/routes.py`)

```python
from flask import render_template, session
from . import bp
from ..auth.utils import isloggedin
import logging

logger = logging.getLogger(__name__)

@bp.route("/")
@isloggedin
def profile():
    logger.debug(f"Serving profile page for user: {session['user']['email']}")
    return render_template("profile.html", user=session['user'])
```
- Defines the main profile route '/'
- Protects it with `@isloggedin` decorator from auth blueprint
- Renders profile.html template with user data from session

### Authentication Integration

The profile system relies on the auth blueprint for:
- User authentication (`@isloggedin` decorator)
- Session management (user data in session)
- Logout route ('/logout')

## Flow Diagrams

### Profile Page Interaction Flow

```
┌─────────────────┐     ┌────────────────┐     ┌─────────────────────┐
│ User navigates  │     │ Flask route    │     │ Template renders    │
│ to /profile/    │────►│ checks login   │────►│ with session data   │
└─────────────────┘     │ with @isloggedin│     └─────────────────────┘
                       └────────────────┘               │
                                                       │
                                                       ▼
┌─────────────────┐     ┌────────────────┐     ┌─────────────────────┐
│ User interacts  │     │ JavaScript     │     │ DOM updates with    │
│ with page       │────►│ handles events │────►│ new data            │
└─────────────────┘     └────────────────┘     └─────────────────────┘
        │                                                │
        │                                                │
        ▼                                                ▼
┌─────────────────┐                            ┌─────────────────────┐
│ Data stored in  │                            │ Toast notification  │
│ sessionStorage  │                            │ confirms changes    │
└─────────────────┘                            └─────────────────────┘
```

### Modal Interaction Flow

```
┌─────────────────┐     ┌────────────────┐     ┌─────────────────────┐
│ User clicks on  │     │ initModal()    │     │ Modal opens with    │
│ opener element  │────►│ handles click  │────►│ modal--active class │
└─────────────────┘     └────────────────┘     └─────────────────────┘
                                                        │
                                                        │
                                                        ▼
┌─────────────────┐     ┌────────────────┐     ┌─────────────────────┐
│ User enters     │     │ Validation     │     │ Visual feedback     │
│ form data       │────►│ functions run  │────►│ on requirements     │
└─────────────────┘     └────────────────┘     └─────────────────────┘
        │                                                │
        │                                                │
        ▼                                                ▼
┌─────────────────┐     ┌────────────────┐     ┌─────────────────────┐
│ User clicks     │     │ handleProfile  │     │ updateProfileDisplay│
│ Save button     │────►│ Update() runs  │────►│ updates UI elements │
└─────────────────┘     └────────────────┘     └─────────────────────┘
                                │
                                │
                                ▼
                      ┌─────────────────────┐
                      │ showToast() displays│
                      │ success message     │
                      └─────────────────────┘
```

### Password Validation Flow

```
┌─────────────────┐     ┌────────────────────┐     ┌─────────────────────┐
│ User types in   │     │ validatePassword() │     │ updateRequirement() │
│ password field  │────►│ checks criteria    │────►│ updates indicators  │
└─────────────────┘     └────────────────────┘     └─────────────────────┘
        │                                                    │
        │                                                    │
        ▼                                                    ▼
┌─────────────────┐     ┌────────────────────┐     ┌─────────────────────┐
│ Strength meter  │     │ User types in      │     │ validatePassword    │
│ updates         │     │ confirm field      │────►│ Match() compares    │
└─────────────────┘     └────────────────────┘     └─────────────────────┘
                                                            │
                                                            │
                                                            ▼
                                                  ┌─────────────────────┐
                                                  │ Password match text │
                                                  │ updates             │
                                                  └─────────────────────┘
```

## Common Tasks Quick Guide

### How to Change Profile Information

1. **User Interaction**:
   - User clicks "Informasi Profil" list item (`id="openProfileModal"` in `profile.html`)
   - Modal appears with current profile data
   - User updates display name and/or uploads new picture
   - User clicks "Save" button

2. **Code Execution Path**:
   - Click handled by event listener set in `initModal()` (`profile-page.js`)
   - Save button triggers `handleProfileUpdate()` (`profile-page.js`)
   - Validation occurs and if valid, calls `updateProfileDisplay()` (`profile-page.js`)
   - UI elements are updated and `showToast()` confirms success

### How to Change Password

1. **User Interaction**:
   - User clicks "Ubah Kata Sandi" list item (`id="openPasswordModal"` in `profile.html`)
   - Modal appears with password form
   - User fills current and new password fields
   - Password requirements are checked in real-time
   - User clicks "Save" button

2. **Code Execution Path**:
   - Modal opens via `initModal()` (`profile-page.js`)
   - Real-time validation via `setupPasswordValidation()` (`profile-page.js`)
   - Save button triggers `handlePasswordUpdate()` (`profile-page.js`)
   - Validation occurs with `isPasswordValid()` (`profile-page.js`)
   - If valid, modal closes and `showToast()` confirms success
