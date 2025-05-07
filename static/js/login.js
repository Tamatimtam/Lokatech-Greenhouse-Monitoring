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
        }
    } catch (error) {
        // If something goes wrong with Firebase, log the error and show a message
        console.error('Firebase Error:', error);
        errorElement.textContent = error.message || 'Login failed. Please try again.';
    }
});

// Handle password reset
document.getElementById('resetPassword').addEventListener('click', async function(e) {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const errorElement = document.getElementById('error-message');

    if (!email) {
        errorElement.textContent = 'Please enter your email address to reset password';
        return;
    }

    try {
        await firebase.auth().sendPasswordResetEmail(email);
        errorElement.textContent = 'Password reset email sent. Check your inbox.';
        errorElement.style.color = 'green';
    } catch (error) {
        errorElement.textContent = error.message;
    }
});

// Registration Modal Functionality
const registerModal = document.getElementById('registerModal');
const openRegisterModalBtn = document.getElementById('openRegisterModal');
const closeModalBtns = document.querySelectorAll('.close-modal, .close-modal-btn');
const submitRegisterBtn = document.getElementById('submitRegister');
const registerEmailInput = document.getElementById('registerEmail');
const registerErrorMessage = document.getElementById('register-error-message');

// Open Registration Modal
if (openRegisterModalBtn) {
    openRegisterModalBtn.addEventListener('click', function(e) {
        e.preventDefault();
        registerModal.style.display = 'block';
        registerEmailInput.focus();
    });
}

// Close Modal Function
function closeModal() {
    registerModal.style.display = 'none';
    registerEmailInput.value = '';
    registerErrorMessage.textContent = '';
}

// Close Modal with Buttons
closeModalBtns.forEach(btn => {
    btn.addEventListener('click', closeModal);
});

// Close Modal When Clicking Outside
window.addEventListener('click', function(event) {
    if (event.target === registerModal) {
        closeModal();
    }
});

// Close Modal with Escape Key
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape' && registerModal.style.display === 'block') {
        closeModal();
    }
});

// Handle Registration Submit
if (submitRegisterBtn) {
    submitRegisterBtn.addEventListener('click', async function() { // Made function async
        const email = registerEmailInput.value.trim();
        registerErrorMessage.textContent = ''; // Clear previous messages
        registerErrorMessage.style.color = 'red'; // Default to error color
        
        // Basic email validation (client-side)
        if (!email) {
            registerErrorMessage.textContent = 'Silakan masukkan alamat email Anda.';
            return;
        }
        
        // Domain validation for @lokatani.id or @mhsw.pnj.ac.id (client-side)
        const isLokataniDomain = email.endsWith('@lokatani.id');
        const isPnjDomain = email.endsWith('@mhsw.pnj.ac.id');

        if (!isLokataniDomain && !isPnjDomain) {
            registerErrorMessage.textContent = 'Pendaftaran hanya tersedia untuk email dengan domain @lokatani.id atau @mhsw.pnj.ac.id.';
            return;
        }
        
        // If client-side validation passes, proceed with backend registration
        const originalButtonText = submitRegisterBtn.textContent;
        submitRegisterBtn.disabled = true;
        submitRegisterBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Mendaftar...'; // Added spinner icon

        try {
            // Step 1: Call backend to create the user account
            const backendResponse = await fetch('/auth/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                    // TODO: Add CSRF token if implemented
                },
                body: JSON.stringify({ email: email })
            });

            const backendData = await backendResponse.json();

            if (backendResponse.ok && backendData.status === 'success') {
                // Step 2: Backend successfully created the user. Now trigger password setup email from client-side.
                try {
                    // The actionCodeSettings are optional here. If not provided, Firebase uses defaults
                    // from your project settings (e.g., the action URL in the email template).
                    // You can specify them if you need to override the default continue URL.
                    // const actionCodeSettings = {
                    // url: window.location.origin + '/', // Redirect to login page after password set
                    // handleCodeInApp: false
                    // };
                    // await firebase.auth().sendPasswordResetEmail(email, actionCodeSettings);
                    
                    await firebase.auth().sendPasswordResetEmail(email); // Using default settings

                    registerErrorMessage.textContent = 'Pendaftaran berhasil! Silakan periksa email Anda untuk mengatur kata sandi.';
                    registerErrorMessage.style.color = 'green';
                    registerEmailInput.value = ''; 
                } catch (firebaseError) {
                    console.error('Firebase sendPasswordResetEmail Error:', firebaseError);
                    registerErrorMessage.textContent = firebaseError.message || 'Gagal mengirim email pengaturan kata sandi. Akun telah dibuat, coba "Lupa Kata Sandi".';
                    // Keep color red for this error, as the primary action (email) failed.
                }
            } else {
                // Error from backend (e.g., email exists, validation error)
                registerErrorMessage.textContent = backendData.message || 'Pendaftaran gagal. Silakan coba lagi.';
            }
        } catch (networkError) {
            console.error('Registration Fetch Network Error:', networkError);
            registerErrorMessage.textContent = 'Terjadi kesalahan jaringan. Silakan coba lagi nanti.';
        } finally {
            submitRegisterBtn.disabled = false;
            submitRegisterBtn.textContent = originalButtonText;
        }
    });
}
