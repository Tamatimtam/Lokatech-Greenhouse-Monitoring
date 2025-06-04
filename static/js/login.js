// Handle login form submission
// This code runs when someone submits the login form
document.getElementById('loginForm').addEventListener('submit', async function(e) {
    // Prevent the form from refreshing the page
    e.preventDefault();

    // Get what the user typed in the email and password boxes
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    // Get the element where we'll show error messages
    const errorElement = document.getElementById('error-message');
    
    // Show loading state
    const loginButton = document.getElementById('loginButton');
    loginButton.classList.add('loading');
    errorElement.textContent = '';
    errorElement.classList.remove('show');

    try {
        // Try to log in with Firebase using the email and password
        const userCredential = await firebase.auth().signInWithEmailAndPassword(email, password);
        // Get a special security token that proves who you are
        const idToken = await userCredential.user.getIdToken();

        // Send this security token to our server
        const response = await fetch('/auth/login', {  // Updated URL to match blueprint
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ idToken: idToken })  // Properly format the JSON data
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        // Get the server's response and convert it from JSON
        const data = await response.json();
        if (data.status === 'success') {
            // If login worked, go to the dashboard page
            window.location.href = '/dashboard';
        } else {
            // If login failed, show the error message from the server
            errorElement.textContent = data.message || 'Login failed. Please try again.';
            errorElement.classList.add('show');
        }
    } catch (error) {
        // If something goes wrong with Firebase, log the error and show a message
        console.error('Firebase Error:', error);
        errorElement.textContent = error.message || 'Login failed. Please try again.';
        errorElement.classList.add('show');
    } finally {
        // Remove loading state
        loginButton.classList.remove('loading');
    }
});

// Registration Modal Functionality
const registerModal = document.getElementById('registerModal');
const resetPasswordModal = document.getElementById('resetPasswordModal');
const openRegisterModalBtn = document.getElementById('openRegisterModal');
const openResetPasswordBtn = document.getElementById('resetPassword');
const closeModalBtns = document.querySelectorAll('.close-modal, .close-modal-btn');
const submitRegisterBtn = document.getElementById('submitRegister');
const submitResetBtn = document.getElementById('submitReset');
const registerEmailInput = document.getElementById('registerEmail');
const resetEmailInput = document.getElementById('resetEmail');
const registerErrorMessage = document.getElementById('register-error-message');
const resetErrorMessage = document.getElementById('reset-error-message');

// Open Registration Modal
if (openRegisterModalBtn) {
    openRegisterModalBtn.addEventListener('click', function(e) {
        e.preventDefault();
        registerModal.style.display = 'block';
        setTimeout(() => {
            registerModal.classList.add('show');
        }, 10);
        registerEmailInput.focus();
    });
}

// Open Reset Password Modal
if (openResetPasswordBtn) {
    openResetPasswordBtn.addEventListener('click', function(e) {
        e.preventDefault();
        resetPasswordModal.style.display = 'block';
        setTimeout(() => {
            resetPasswordModal.classList.add('show');
        }, 10);
        
        // Pre-fill with login email if available
        const loginEmail = document.getElementById('email').value;
        if (loginEmail) {
            resetEmailInput.value = loginEmail;
        }
        
        resetEmailInput.focus();
    });
}

// Close Modal Function
function closeModal(modal) {
    modal.classList.remove('show');
    setTimeout(() => {
        modal.style.display = 'none';
    }, 300); // Match transition duration
}

// Close All Modals
function closeAllModals() {
    if (registerModal) closeModal(registerModal);
    if (resetPasswordModal) closeModal(resetPasswordModal);
}

// Close Modal with Buttons
closeModalBtns.forEach(btn => {
    btn.addEventListener('click', function() {
        const modal = this.closest('.modal');
        if (modal) {
            closeModal(modal);
        }
    });
});

// Close Modal When Clicking Outside
window.addEventListener('click', function(event) {
    if (event.target.classList.contains('modal')) {
        closeModal(event.target);
    }
});

// Close Modal with Escape Key
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        closeAllModals();
    }
});

// Handle Registration Submit
if (submitRegisterBtn) {
    submitRegisterBtn.addEventListener('click', async function() {
        const email = registerEmailInput.value.trim();
        registerErrorMessage.textContent = ''; // Clear previous messages
        registerErrorMessage.classList.remove('show');
        
        // Basic email validation (client-side)
        if (!email) {
            registerErrorMessage.textContent = 'Silakan masukkan alamat email Anda.';
            registerErrorMessage.classList.add('show');
            return;
        }
        
        // Domain validation for @lokatani.id or @mhsw.pnj.ac.id (client-side)
        const isLokataniDomain = email.endsWith('@lokatani.id');
        const isPnjDomain = email.endsWith('@mhsw.pnj.ac.id');

        if (!isLokataniDomain && !isPnjDomain) {
            registerErrorMessage.textContent = 'Pendaftaran hanya tersedia untuk email dengan domain @lokatani.id atau @mhsw.pnj.ac.id.';
            registerErrorMessage.classList.add('show');
            return;
        }
        
        // If client-side validation passes, proceed with backend registration
        submitRegisterBtn.disabled = true;
        submitRegisterBtn.classList.add('loading');

        try {
            // Step 1: Call backend to create the user account
            const backendResponse = await fetch('/auth/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({ email: email })
            });

            const backendData = await backendResponse.json();

            if (backendResponse.ok && backendData.status === 'success') {
                // Step 2: Backend successfully created the user. Now trigger password setup email from client-side.
                try {
                    await firebase.auth().sendPasswordResetEmail(email); // Using default settings

                    registerErrorMessage.textContent = 'Pendaftaran berhasil! Silakan periksa email Anda untuk mengatur kata sandi.';
                    registerErrorMessage.style.color = 'green';
                    registerErrorMessage.classList.add('show');
                    registerEmailInput.value = ''; 
                    
                    // Close modal after successful registration after 3 seconds
                    setTimeout(() => {
                        closeModal(registerModal);
                    }, 3000);
                    
                } catch (firebaseError) {
                    console.error('Firebase sendPasswordResetEmail Error:', firebaseError);
                    registerErrorMessage.textContent = firebaseError.message || 'Gagal mengirim email pengaturan kata sandi. Akun telah dibuat, coba "Lupa Kata Sandi".';
                    registerErrorMessage.classList.add('show');
                }
            } else {
                // Error from backend (e.g., email exists, validation error)
                registerErrorMessage.textContent = backendData.message || 'Pendaftaran gagal. Silakan coba lagi.';
                registerErrorMessage.classList.add('show');
            }
        } catch (networkError) {
            console.error('Registration Fetch Network Error:', networkError);
            registerErrorMessage.textContent = 'Terjadi kesalahan jaringan. Silakan coba lagi nanti.';
            registerErrorMessage.classList.add('show');
        } finally {
            submitRegisterBtn.disabled = false;
            submitRegisterBtn.classList.remove('loading');
        }
    });
}

// Handle Password Reset Submit
if (submitResetBtn) {
    submitResetBtn.addEventListener('click', async function() {
        const email = resetEmailInput.value.trim();
        resetErrorMessage.textContent = ''; // Clear previous messages
        resetErrorMessage.classList.remove('show');
        
        // Basic validation
        if (!email) {
            resetErrorMessage.textContent = 'Silakan masukkan alamat email Anda.';
            resetErrorMessage.classList.add('show');
            return;
        }
        
        // Disable button and show loading state
        submitResetBtn.disabled = true;
        submitResetBtn.classList.add('loading');

        try {
            // Step 1: Call backend to check rate limit and log the request
            const backendResponse = await fetch('/auth/request-password-reset', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({ email: email })
            });

            const backendData = await backendResponse.json();

            if (!backendResponse.ok) { // Handles 429 from backend rate limiter or other backend errors
                resetErrorMessage.textContent = backendData.message || 'Gagal memproses permintaan atur ulang kata sandi.';
                resetErrorMessage.classList.add('show');
                // Do not proceed to Firebase if backend check fails
                return; 
            }
            
            // Step 2: If backend check is okay, proceed to call Firebase to send the email
            await firebase.auth().sendPasswordResetEmail(email);
            resetErrorMessage.textContent = 'Email untuk mengatur ulang kata sandi telah dikirim. Silakan periksa kotak masuk Anda.';
            resetErrorMessage.style.color = 'green';
            resetErrorMessage.classList.add('show');
            
            // Close modal after successful password reset email after 3 seconds
            setTimeout(() => {
                closeModal(resetPasswordModal);
            }, 3000);
            
        } catch (error) { // Catches network errors for backend call or Firebase errors
            console.error('Password Reset Error:', error);
            // If error has a message from backend (already parsed), use it. Otherwise, Firebase error or generic.
            resetErrorMessage.textContent = error.message || 'Gagal mengirim email pengaturan ulang kata sandi. Silakan coba lagi.';
            if (error.code) { // Firebase errors usually have a 'code' property
                 resetErrorMessage.textContent = error.message; // Use Firebase's specific message
            }
            resetErrorMessage.classList.add('show');
        } finally {
            submitResetBtn.disabled = false;
            submitResetBtn.classList.remove('loading');
        }
    });
}
