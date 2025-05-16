document.addEventListener('DOMContentLoaded', function() {
    const exportButton = document.getElementById('exportExcelBtn');

    if (exportButton) {
        exportButton.addEventListener('click', function() {
            // Assuming history.js has a way to expose the currently selected time range
            // For example, a global variable or a function like getCurrentTimeRange()
            // For now, we'll hardcode to '1hour' as per the initial plan
            let selectedRange = '1hour'; // Default to 1hour for now

            // Try to get the selected range from history.js if possible
            // This assumes history.js might set a global variable or a data attribute on a common element
            if (typeof getCurrentTimeRange === 'function') { // Check if a global function exists
                selectedRange = getCurrentTimeRange();
            } else {
                // Fallback: try to find the active button if history.js doesn't expose the range directly
                const activeButton = document.querySelector('.time-range-btn.active');
                if (activeButton && activeButton.dataset.range) {
                    selectedRange = activeButton.dataset.range;
                }
                // If still not found, it remains '1hour' as per our initial hardcoding for the first phase
            }

            console.log(`Exporting data for range: ${selectedRange}`);

            // Construct the download URL
            const exportUrl = `/history/export_excel?range=${selectedRange}`;

            // Trigger the download
            // Using window.location.href for a simple GET request that results in a download
            window.location.href = exportUrl;
        });
    }
});

// Placeholder for a function that might be defined in history.js to get the current range
// If history.js is modified to have such a function, it would look something like:
/*
function getCurrentTimeRange() {
    const activeButton = document.querySelector('.time-range-btn.active');
    return activeButton ? activeButton.dataset.range : '1hour'; // Default to 1hour if none active
}
*/
