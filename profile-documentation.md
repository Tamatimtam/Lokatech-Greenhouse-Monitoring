# LokaTech Greenhouse Monitoring - Profile System Documentation

## Introduction

The Profile System is a core component of the LokaTech Greenhouse Monitoring application that enables users to manage their account information, customize their experience, and maintain security through password management. This documentation provides a comprehensive overview of the system's architecture, features, and implementation details.

## Table of Contents
1. [System Overview](#system-overview)
2. [Feature Guide](#feature-guide)
3. [Implementation Details](#implementation-details)
4. [User Interface Components](#user-interface-components)
5. [Customization and Extension](#customization-and-extension)
6. [Troubleshooting](#troubleshooting)

## System Overview

### Purpose
The Profile System allows users to:
- View and update their personal information (display name)
- Manage password security
- Control account settings (logout)
- Delete their account permanently

### Architecture
The system follows a Model-View-Controller (MVC) pattern:
- **Model**: Firebase Authentication (user data)
- **View**: HTML templates with Flask templating engine
- **Controller**: Flask routes and JavaScript event handlers

### Technology Stack
- **Backend**: Python Flask with Firebase Authentication
- **Frontend**: 
  - HTML, CSS
  - JavaScript (modular organization with separate files for profile and password functionality)
  - Browser SessionStorage (temporary data for user name)

## Feature Guide

### Profile Information Management

![Profile Information Management Flow](static/images/docs/profile-info-flow.png)

#### How It Works
1. User navigates to the Profile page
2. The system displays current profile information (name, email, default avatar) from the session
3. User can edit their display name by clicking "Informasi Profil"
4. Changes are saved to Firebase and reflected immediately in the UI

#### Code Components
- **Backend Route**: `blueprints/profile/routes.py` - `update_profile()` function
- **Frontend Template**: `templates/profile.html` - Profile card and edit modal
- **JavaScript**: `profile-page.js` - `handleProfileUpdate()` and `updateProfileDisplay()`

```javascript
// Key function in profile-page.js that handles profile updates
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
    // Handle the response
    // ...existing code...
  });
}
```

#### User Experience
- Immediate visual feedback when changes are made
- Error handling with user-friendly messages
- Loading state indication during server communication

### Password Management System

#### How It Works (New Email-Based Flow)
1. User clicks "Ubah Kata Sandi" in the account settings on the profile page.
2. A confirmation modal appears, displaying the user's registered email address (e.g., `{{ user.email }}`) and asking for confirmation to send a password change link.
3. If the user confirms (e.g., clicks "Kirim Email"), the frontend JavaScript directly calls `firebase.auth().sendPasswordResetEmail()` using the authenticated user's email address.
4. Firebase sends an email to the user containing a secure, time-limited link to change their password.
5. The user clicks the link in the email. This typically directs them to a standard Firebase-hosted page (or a custom action handler page if configured in the Firebase project settings) where they can enter and confirm their new password.
6. Firebase handles the validation of the new password on its page according to the project's password policies.
7. Upon successful submission on the Firebase page, the user's password is updated in Firebase Authentication.
8. Back in the application, the user receives a toast notification confirming that the password change email has been sent. They should then check their inbox.

#### Password Requirements Validation
Password strength and requirements are now primarily enforced by Firebase on its password reset/change page. The in-app client-side validation for new password strength and matching during a password change has been removed.

#### Code Components
- **Backend Route**: The `POST /profile/password` endpoint and its associated `validate_password` helper function in `blueprints/profile/routes.py` have been **removed**. The password change initiation and process are now handled by the Firebase client-side SDK and Firebase services.
- **Frontend Template**: `templates/profile.html` - The `passwordModal` has been simplified to a confirmation dialog. Input fields for current/new/confirm password, strength meter, and requirements list have been removed from this modal.
- **JavaScript**: 
  - `profile-page.js`:
    - The `initModal()` call for `passwordModal` now uses `handleRequestPasswordChangeEmail` as its save handler.
    - `handleRequestPasswordChangeEmail()`: This new function retrieves the user's email, calls `firebase.auth().sendPasswordResetEmail(userEmail)`, shows a loading state, displays a toast notification upon success or error, and closes the modal.
  - `profile-password.js`: This file has been **removed** as its functionalities (in-app password validation, old update handler) are no longer needed for the password change feature. The `setupPasswordToggles` function was moved to `profile-page.js` for use by other modals (e.g., Delete Account).
- **CSS**: `profile-page.css` - CSS rules for the removed password strength meter, requirements list, and match indicators have been removed.

```javascript
// Key JavaScript function in profile-page.js for the new password change flow
async function handleRequestPasswordChangeEmail(modal, closeModal) {
  const userEmailElement = document.getElementById('userEmailForPasswordChange');
  // Fallback to emailAddress input if the span isn't found or populated, though the span should be primary.
  const userEmail = userEmailElement ? userEmailElement.textContent : document.getElementById('emailAddress')?.value;

  if (!userEmail) {
    showValidationError('Tidak dapat menemukan alamat email pengguna.');
    return;
  }

  const saveButton = document.getElementById('savepasswordModal'); // ID of the "Kirim Email" button in passwordModal
  const originalText = saveButton.textContent;
  saveButton.textContent = 'Mengirim...';
  saveButton.disabled = true;

  try {
    // Firebase client SDK call to send the password reset email
    await firebase.auth().sendPasswordResetEmail(userEmail);
    showToast(`Email untuk mengubah kata sandi telah dikirim ke ${userEmail}. Silakan periksa kotak masuk Anda.`);
    closeModal(); // Close the confirmation modal
  } catch (error) {
    console.error('Error sending password reset email:', error);
    showValidationError(error.message || 'Gagal mengirim email perubahan kata sandi.');
  } finally {
    saveButton.textContent = originalText;
    saveButton.disabled = false;
  }
}
```

#### Security Considerations
- The security of the password change process now relies on:
    - The user being authenticated within the application to access the profile page and initiate the request.
    - The security of the user's email account (to receive the reset link).
    - Firebase's secure link generation, handling, and its password setting page.
- This flow eliminates the need for the application to handle or verify the user's current password for a password change initiated by an already logged-in user.
- It aligns with standard web practices for password changes and resets.

### Logout

#### How It Works
1. User clicks "Keluar" in the account settings list.
2. A confirmation modal appears asking the user to confirm the logout action.
3. If confirmed, a POST request is sent to the `/auth/logout` endpoint.
4. The backend clears the user's session.
5. The frontend clears any client-side session storage.
6. The user is redirected to the login page (`/`).

#### Code Components
- **Backend Route**: `blueprints/auth/routes.py` - `logout()` function (handles POST)
- **Frontend Template**: `templates/profile.html` - Logout list item (`id="logoutButton"`) and confirmation modal (`id="logoutModal"`)
- **JavaScript**: `profile-page.js` - `initModal()` for logout, `handleLogout()` function
- **CSS**: `profile-page.css` - Styling for logout modal and button (`#savelogoutModal`)

```javascript
// Function to handle logout process after modal confirmation
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
    // Handle error, reset button, show message
    // ...existing code...
  });
}
```

#### Security Considerations
- Uses POST request to prevent CSRF attacks.
- Server-side session clearing is the primary mechanism.
- Client-side storage clearing (`sessionStorage.clear()`) provides an extra layer of cleanup.
- Confirmation modal prevents accidental logout.

### Account Deletion

#### How It Works
1. User clicks "Hapus akun ini" in the account settings
2. Account deletion confirmation modal opens, warning the user about the permanent nature of the action.
3. User must enter their current password into the provided field for verification.
4. User clicks "Hapus Akun Saya".
5. A POST request containing the password is sent to `/profile/delete`.
6. Backend verifies the provided password against the user's actual password using Firebase REST API.
7. If the password is correct, the backend deletes the user account via Firebase Admin SDK and clears the user session.
8. User is redirected to the login page (`/`).

#### Code Components
- **Backend Route**: `blueprints/profile/routes.py` - `delete_account()` function
- **Frontend Template**: `templates/profile.html` - Delete account list item (`id="openDeleteAccountModal"`) and confirmation modal (`id="deleteAccountModal"`)
- **JavaScript**: `profile-page.js` - `initModal()` for delete, `handleDeleteAccount()` function, `deleteAccount()` function (fetch call)
- **CSS**: `profile-page.css` - Styling for delete account list item, modal, and button (`#savedeleteAccountModal`)

```javascript
// Function to handle the delete account process after modal confirmation
function handleDeleteAccount(modal) { 
  const passwordInput = document.getElementById('deleteAccountPassword');
  const confirmButton = document.getElementById('savedeleteAccountModal'); 
  
  // ... validation and loading state ...

  const password = passwordInput.value;
    
  // ... check if password is empty ...
  
  // Send delete request
  deleteAccount(password)
    .then(data => {
      if (data.status === 'success') {
        // Show toast and redirect
        // ...existing code...
      } else {
        // Reset button and show error
        // ...existing code...
      }
    })
    .catch(error => {
      // Reset button and show error
      // ...existing code...
    });
}

// Function making the API call to delete the account
function deleteAccount(password) {
  // ... fetch call to /profile/delete ...
}
```

#### Security Considerations
- **Mandatory Password Verification**: Ensures only the account owner can initiate deletion.
- **Backend Verification**: Password check happens securely on the server using Firebase REST API.
- **Irreversible Action**: Clearly communicated to the user in the modal.
- **Session Clearing**: Immediately logs the user out upon successful deletion.

### Modal System

The application uses a flexible modal system for forms and dialogs.

#### How It Works
1. Modals are initialized with specific handlers for different content
2. Opening a modal activates its content and applies the active class
3. Form interactions within the modal are handled by specific functions
4. Closing can happen via close button, cancel button, save completion, or ESC key

#### Code Components
- **Modal Template**: `templates/macros/modal.html` - Reusable modal structure
- **JavaScript**: `profile-page.js` - `initModal()` and `closeAllModals()`
- **CSS**: `profile-page.css` - Modal styling and animations

```javascript
// Versatile modal initialization with custom handlers
function initModal(modalId, openerId, onSave = null) {
  const modal = document.getElementById(modalId);
  const opener = document.getElementById(openerId);
  const closeBtn = modal?.querySelector('.modal__close');
  const cancelBtn = modal?.querySelector('.modal__cancel');
  const saveBtn = modal?.querySelector('.modal__save');
  
  if (!modal || !opener) {
    console.error(`Modal initialization failed: Elements not found`);
    return null;
  }
  
  function openModal() {
    modal.classList.add('modal--active');
    document.body.style.overflow = 'hidden';
  }
  
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
  // ...existing code...
  
  return { open: openModal, close: closeModal };
}
```

#### UI/UX Details
- Backdrop overlay prevents interaction with the main page
- Animations provide smooth transitions
- Keyboard navigation (ESC to close)
- Mobile-responsive design

### Notification System

The application provides user feedback through a toast notification system.

#### How It Works
1. Actions that require user feedback trigger the notification system
2. Notifications appear at the bottom of the screen
3. Messages automatically disappear after 3 seconds
4. Different message types (success, error) have distinct styling

#### Code Components
- **JavaScript**: `profile-page.js` - `showToast()` and `showValidationError()`
- **CSS**: `profile-page.css` - Toast styling and animations

```javascript
// Toast notification system for user feedback
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

## Implementation Details

### Backend Implementation

#### Profile Blueprint Structure
```
blueprints/
└── profile/
    ├── __init__.py    # Blueprint definition
    └── routes.py      # Route handlers
```

#### Key Routes
- **GET /profile/**: Renders the profile page with user data
- **POST /profile/update**: Handles profile information updates
- **POST /profile/delete**: Processes account deletion requests with password verification

#### Authentication Integration
The profile system integrates with Firebase Authentication:
- Uses `@isloggedin` decorator to protect routes
- Updates Firebase user records when profile changes are made
- Implements secure password change process:
  - Verifies current password through Firebase Authentication API
  - Only allows password changes after successful verification
  - Validates password complexity requirements server-side
- Maintains user state in the Flask session

### Frontend Architecture

#### Template Structure
```
templates/
├── profile.html             # Main profile page
└── macros/
    ├── card.html            # Card component for profile sections
    ├── modal.html           # Modal component for dialogs
    └── navigation.html      # Navigation components
```

#### JavaScript Organization
The frontend JavaScript code is now split into two files for better organization and maintainability:

1. **profile-page.js**: Contains the core profile page functionality
   - Modal initialization and management
   - Profile information update handling
   - UI utility functions and notifications

2. **profile-password.js**: Dedicated file for password-related functionality
   - Password update handling
   - Password validation and strength evaluation
   - Password visibility toggling
   - Password matching validation

This modular approach improves code readability, maintainability, and separation of concerns.

#### Integration Between Files
The password module is exposed through a global object:

```javascript
// In profile-password.js
window.passwordModule = {
  handlePasswordUpdate,
  setupPasswordToggles,
  isPasswordValid,
  setupPasswordValidation
};

// In profile-page.js
document.addEventListener('DOMContentLoaded', function() {
  // ...
  initModal('passwordModal', 'openPasswordModal', window.passwordModule.handlePasswordUpdate);
  window.passwordModule.setupPasswordToggles();
  window.passwordModule.setupPasswordValidation();
  // ...
});
```

#### File Structure
```
static/js/
├── profile-page.js     # Core profile functionality
└── profile-password.js # Password-specific functionality
```

## User Interface Components

### Profile Page Layout
```
┌─────────────────────────────────────────┐
│ Header: User greeting                   │
├─────────────────────────────────────────┤
│ Profile Info Card                       │
│ ┌─────────────┐                         │
│ │ Default Pic │ Name                    │
│ │             │ Email                   │
│ └─────────────┘                         │
├─────────────────────────────────────────┤
│ Account Settings                        │
│ • Informasi Profil                      │
│ • Ubah Kata Sandi                       │
│ • Keluar                                │
│ • Hapus akun ini (red)                  │
└─────────────────────────────────────────┘
```

### Modal Components
1. **Profile Edit Modal**
   - Display name input field
   - Read-only email field
   - Role information

2. **Password Change Modal**
   - Current password field
   - New password field with strength meter
   - Confirm password field
   - Password requirements checklist

3. **Delete Account Modal**
   - Warning message about permanent deletion
   - Password verification field
   - Cancel and confirm buttons
   - Clear visual indicators of the destructive action

## Customization and Extension

### Adding New Profile Fields
To add new profile fields:

1. Update the Firebase user model
2. Add fields to the profile modal in `profile.html`
3. Extend the `handleProfileUpdate()` function to include new fields
4. Update the backend route to handle additional data

### Customizing Password Requirements
To modify password requirements:

1. Update the validation regex in `isPasswordValid()`
2. Modify the requirements list in the password modal
3. Adjust the `validatePassword()` function to reflect new rules

## Troubleshooting

### Common Issues

#### Profile Updates Not Saving
**Possible causes:**
- Firebase connection issues
- Invalid input validation
- Session management problems

**Solutions:**
- Check browser console for errors
- Verify network requests in developer tools
- Ensure Firebase configuration is correct

#### Password Update Failures
**Possible causes:**
- Invalid current password provided
- Firebase API key not properly configured
- Network connectivity issues with Firebase
- Client-side validation passing but server-side validation failing
- Firebase service disruptions

**Solutions:**
- Double-check current password entry
- Verify Firebase configuration in server environment
- Check browser console and server logs for specific errors
- Ensure password meets all requirements consistently
- Try again later if Firebase service might be experiencing issues

#### Password Validation Issues
**Possible causes:**
- JavaScript errors in validation functions
- Conflicting validation rules between client and server
- DOM element ID mismatches
- Browser compatibility issues with regex patterns

**Solutions:**
- Check browser console for JavaScript errors
- Ensure validation logic matches between client and server code
- Verify all DOM element IDs match between HTML and JS
- Test in multiple browsers if issue seems browser-specific

#### Modal Display Problems
**Possible causes:**
- CSS conflicts
- Z-index issues
- JavaScript initialization errors

**Solutions:**
- Inspect element positioning and z-index
- Verify modal initialization in console
- Test modal functionality in isolation

## Conclusion

The Profile System provides a comprehensive user account management solution with secure authentication, intuitive UI, and extensible architecture. By following the documentation above, developers can understand, maintain, and extend the system to meet evolving requirements.

## Appendix

### Complete Feature-Code Map

| Feature | Frontend Files | JavaScript Functions | Backend Routes |
|---------|---------------|---------------------|---------------|
| Profile Display | profile.html (lines 27-37) | `updateProfileDisplay()` in profile-page.js | GET /profile/ |
| Profile Editing | profile.html (lines 57-91) | `handleProfileUpdate()` in profile-page.js | POST /profile/update |
| Password Management | profile.html (lines 93-140) | Functions in profile-password.js:<br>- `setupPasswordValidation()`<br>- `handlePasswordUpdate()`<br>- `validatePassword()`<br>- `isPasswordValid()` | POST /profile/password |
| Logout | profile.html (lines 49-52, 153-159) | `initModal()`, `handleLogout()` in profile-page.js | POST /auth/logout |
| Account Deletion | profile.html (lines 53-56, 135-151) | `initModal()`, `handleDeleteAccount()`, `deleteAccount()` in profile-page.js | POST /profile/delete |
| Modal System | macros/modal.html | `initModal()`, `closeAllModals()` in profile-page.js | N/A (frontend only) |
| Notifications | Generated via JS | `showToast()`, `showValidationError()` in profile-page.js | N/A (frontend only) |
