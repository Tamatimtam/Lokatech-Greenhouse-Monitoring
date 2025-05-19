document.addEventListener('DOMContentLoaded', function() {
    const systemLogContent = document.getElementById('tab-system');

    if (systemLogContent) {
        systemLogContent.innerHTML = `
            <div style="text-align: center; padding: 20px; font-style: italic; color: var(--text-secondary);">
                <i class="fas fa-cogs fa-2x" style="margin-bottom: 10px; color: var(--primary-light);"></i>
                <p>System Logs section is currently under development.</p>
                <p>Please check back later for updates.</p>
            </div>
        `;
    } else {
        console.error('System Log content area (tab-system) not found.');
    }
});
