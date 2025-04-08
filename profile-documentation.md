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
- View and update their personal information
- Change their profile picture
- Manage password security
- Control account settings

### Architecture
The system follows a Model-View-Controller (MVC) pattern:
- **Model**: Firebase Authentication (user data)
- **View**: HTML templates with Flask templating engine
- **Controller**: Flask routes and JavaScript event handlers

### Technology Stack
- **Backend**: Python Flask with Firebase Authentication
- **Frontend**: HTML, CSS, JavaScript
- **Data Storage**: Firebase (user profiles) and browser SessionStorage (temporary data)

## Feature Guide

### Profile Information Management

![Profile Information Management Flow](static/images/docs/profile-info-flow.png)

#### How It Works
1. User navigates to the Profile page
2. The system displays current profile information from the session
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

### Profile Picture Management

#### How It Works
1. User clicks "Ubah Foto" in the profile edit modal
2. File browser opens for image selection
3. Selected image is displayed in both the modal preview and main profile
4. Image data is stored in browser SessionStorage for persistence

#### Code Components
- **Frontend Template**: `templates/profile.html` - Profile picture containers
- **JavaScript**: `profile-page.js` - `setupProfilePictureUpload()` function
- **CSS**: `profile-page.css` - Styling for profile images

```javascript
// Handles profile picture uploads with preview functionality
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

#### Technical Details
- Uses the FileReader API to handle image files
- Updates multiple DOM elements to maintain UI consistency
- SessionStorage maintains the image across page refreshes

### Password Management System

#### How It Works
1. User clicks "Ubah Kata Sandi" in the account settings
2. Password change modal opens with three fields:
   - Current password
   - New password (with strength meter)
   - Confirm password
3. Real-time validation provides feedback on password requirements
4. After validation, password update is processed through the following steps:
   - Current password is verified using Firebase Authentication
   - New password is validated against security requirements
   - Password is updated in Firebase if all validations pass
5. User receives confirmation of successful password change or specific error message

#### Password Requirements Validation
The system enforces strong password policies with visual feedback:
- Minimum 8 characters
- At least one uppercase letter
- At least one number
- At least one special character

#### Code Components
- **Backend Route**: `blueprints/profile/routes.py` - `update_password()` function
- **Frontend Template**: `templates/profile.html` - Password modal form
- **JavaScript**: 
  - `setupPasswordValidation()`: Sets up real-time validation
  - `validatePassword()`: Checks password strength
  - `handlePasswordUpdate()`: Processes the password change
- **CSS**: `profile-page.css` - Styling for password strength indicators

```javascript
// Password update handler with server communication
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
    // Handle response and update UI
    // ...existing code...
  })
  .catch(error => {
    // Error handling
    // ...existing code...
  });
}
```

#### Security Considerations
- Current password verification ensures only the authorized user can change the password
- Two-step verification process:
  1. First authenticates with current password using Firebase REST API
  2. Then updates password using Firebase Admin SDK only if authentication succeeds
- Client-side validation is complemented by comprehensive server-side validation
- Password strength requirements are enforced on both client and server
- Visual feedback helps users create strong passwords
- Loading states prevent multiple submission attempts

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
- **POST /profile/password**: Processes password change requests with security validation

#### Authentication Integration
The profile system integrates with Firebase Authentication:
- Uses `@isloggedin` decorator to protect routes
- Updates Firebase user records when profile changes are made
- Implements secure password change process:
  - Verifies current password through Firebase Authentication API
  - Only allows password changes after successful verification
  - Validates password complexity requirements server-side
- Maintains user state in the Flask session

```python
@bp.route("/password", methods=["POST"])
@isloggedin
def update_password():
    """
    Update user password in Firebase
    
    Requires current password verification for security and validates 
    that the new password meets strength requirements
    """
    try:
        data = request.json
        current_password = data.get('currentPassword')
        new_password = data.get('newPassword')
        
        # Validate inputs
        if not current_password or not new_password:
            logger.warning(f"Missing password fields in update attempt: {session['user']['email']}")
            return jsonify({'status': 'error', 'message': 'Semua bidang kata sandi diperlukan'}), 400
        
        # Validate new password requirements
        if not validate_password(new_password):
            logger.warning(f"Weak password attempt: {session['user']['email']}")
            return jsonify({'status': 'error', 'message': 'Kata sandi baru tidak memenuhi persyaratan keamanan'}), 400
        
        # Get user email from session
        email = session['user']['email']
        
        try:
            # Get Firebase user by email
            firebase_user = auth.get_user_by_email(email)
            
            # Verify current password using Firebase REST API
            firebase_api_key = current_app.config.get('FIREBASE_API_KEY')
            if not firebase_api_key:
                logger.error("Firebase API key not configured")
                return jsonify({'status': 'error', 'message': 'Konfigurasi server tidak lengkap'}), 500
            
            # Step 1: Verify current password by attempting to sign in
            verify_url = f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={firebase_api_key}"
            verify_data = {
                "email": email,
                "password": current_password,
                "returnSecureToken": True
            }
            
            verify_response = requests.post(verify_url, json=verify_data)
            
            if not verify_response.ok:
                logger.warning(f"Invalid current password attempt: {email}")
                return jsonify({'status': 'error', 'message': 'Kata sandi saat ini tidak valid'}), 401
            
            # Step 2: Update password using Firebase Admin SDK
            auth.update_user(
                firebase_user.uid,
                password=new_password
            )
            
            logger.info(f"Password updated successfully for user: {email}")
            return jsonify({'status': 'success', 'message': 'Kata sandi berhasil diperbarui'})
            
        except auth.UserNotFoundError:
            logger.error(f"User not found in Firebase: {email}")
            return jsonify({'status': 'error', 'message': 'Pengguna tidak ditemukan'}), 404
        except Exception as e:
            logger.error(f"Firebase password update error: {str(e)}")
            return jsonify({'status': 'error', 'message': f'Gagal memperbarui kata sandi'}), 500
    except Exception as e:
        logger.error(f"Password update failed: {str(e)}")
        return jsonify({'status': 'error', 'message': f'Terjadi kesalahan sistem'}), 500
```

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
The `profile-page.js` file follows a functional organization pattern:
1. Event initialization on DOMContentLoaded
2. Feature-specific handler functions:
   - `handleProfileUpdate()` for profile information
   - `handlePasswordUpdate()` for password changes
3. Validation functions:
   - `isPasswordValid()` for password requirements
   - `validatePassword()` for real-time validation
   - `validatePasswordMatch()` for confirmation matching
4. UI utility functions
5. Modal and component management functions

#### CSS Architecture
The `profile-page.css` file is organized by component:
- Profile display styles
- Modal and form styles
- Password validation visual elements
- Notification styling
- Responsive design adjustments

## User Interface Components

### Profile Page Layout
```
┌─────────────────────────────────────────┐
│ Header: User greeting                   │
├─────────────────────────────────────────┤
│ Profile Info Card                       │
│ ┌─────────────┐                         │
│ │ Profile Pic │ Name                    │
│ │             │ Email                   │
│ └─────────────┘                         │
├─────────────────────────────────────────┤
│ Account Settings                        │
│ • Informasi Profil                      │
│ • Ubah Kata Sandi                       │
│ • Keluar                                │
└─────────────────────────────────────────┘
```

### Modal Components
1. **Profile Edit Modal**
   - Profile picture with upload option
   - Display name input field
   - Read-only email field
   - Role information

2. **Password Change Modal**
   - Current password field
   - New password field with strength meter
   - Confirm password field
   - Password requirements checklist

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
| Profile Display | profile.html (lines 27-37) | `updateProfileDisplay()` | GET /profile/ |
| Profile Editing | profile.html (lines 57-91) | `handleProfileUpdate()` | POST /profile/update |
| Password Management | profile.html (lines 93-140) | `setupPasswordValidation()`, `handlePasswordUpdate()`, `validatePassword()` | POST /profile/password |
| Profile Picture | profile.html (lines 59-70) | `setupProfilePictureUpload()` | N/A (browser storage) |
| Modal System | macros/modal.html | `initModal()`, `closeAllModals()` | N/A (frontend only) |
| Notifications | Generated via JS | `showToast()`, `showValidationError()` | N/A (frontend only) |
