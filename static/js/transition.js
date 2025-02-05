document.addEventListener('DOMContentLoaded', () => {
    // Add fade-in animation when page loads
    document.body.classList.add('fade');
    setTimeout(() => {
        document.body.classList.remove('fade');
        document.body.style.opacity = '1';
    }, 10);

    // Intercept all link clicks
    document.addEventListener('click', async (e) => {
        const link = e.target.closest('a');
        if (link && !link.target && !link.download) {
            e.preventDefault();
            
            // Add fade-out animation
            document.body.classList.add('fade');
            
            // Wait for animation to finish
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Navigate to new page
            window.location.href = link.href;
        }
    });
});