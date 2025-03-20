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
