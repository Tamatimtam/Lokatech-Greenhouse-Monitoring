document.addEventListener('DOMContentLoaded', function() {
    console.log('Plants guide page loaded');
    
    // Add smooth transitions for card hover
    const plantCards = document.querySelectorAll('.plant-card');
    
    plantCards.forEach(card => {
        card.addEventListener('mouseenter', () => {
            card.classList.add('plant-card--hover');
        });
        
        card.addEventListener('mouseleave', () => {
            card.classList.remove('plant-card--hover');
        });
        
        // Make the entire card clickable if it has a detail link
        const detailLink = card.querySelector('a.button--primary');
        if (detailLink) {
            card.style.cursor = 'pointer';
            card.addEventListener('click', (e) => {
                // Don't trigger if the click was on the button itself
                if (!e.target.closest('.button')) {
                    detailLink.click();
                }
            });
        }
    });
    
    // Add view transition API support if available
    if ('startViewTransition' in document) {
        document.querySelectorAll('a[href^="/plants/"]').forEach(link => {
            link.addEventListener('click', e => {
                e.preventDefault();
                const href = link.getAttribute('href');
                
                document.startViewTransition(() => {
                    window.location.href = href;
                });
            });
        });
    }
});
