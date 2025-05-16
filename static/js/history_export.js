document.addEventListener('DOMContentLoaded', function() {
    const export1HourButton = document.getElementById('export1HourBtn');
    const export1DayButton = document.getElementById('export1DayBtn');

    if (export1HourButton) {
        export1HourButton.addEventListener('click', function() {
            exportData('1hour');
        });
    }

    if (export1DayButton) {
        export1DayButton.addEventListener('click', function() {
            exportData('1day');
        });
    }

    function exportData(range) {
        // Construct the URL for the export endpoint
        const exportUrl = `/history/export_excel?range=${range}`;

        // Trigger the download by navigating to the URL
        window.location.href = exportUrl;

        // Optional: Provide feedback to the user
        // alert(`Mengekspor data untuk ${range}...`); 
        // Consider a more subtle notification system if alert is too intrusive.
    }
});
