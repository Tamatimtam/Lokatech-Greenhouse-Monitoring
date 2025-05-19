document.addEventListener('DOMContentLoaded', function() {
    const userLogContent = document.getElementById('tab-user');

    if (userLogContent) {
        userLogContent.innerHTML = `
            <div style="text-align: center; padding: 20px; font-style: italic; color: var(--text-secondary);">
                <i class="fas fa-users fa-2x" style="margin-bottom: 10px; color: var(--primary-light);"></i>
                <p>User Logs section is currently under development.</p>
                <p>Please check back later for updates.</p>
            </div>
        `;
    } else {
        console.error('User Log content area (tab-user) not found.');
    }
});
