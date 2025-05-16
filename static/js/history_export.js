document.addEventListener('DOMContentLoaded', function() {
    const export1HourButton = document.getElementById('export1HourBtn');
    const export1DayButton = document.getElementById('export1DayBtn');
    const export7DaysButton = document.getElementById('export7DaysBtn');

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

    if (export7DaysButton) {
        export7DaysButton.addEventListener('click', function() {
            exportData('7day');
        });
    }

    async function exportData(range) {
        // Construct the URL for the export endpoint
        const exportUrl = `/history/export_excel?range=${range}`;

        // Optional: Show some loading indicator to the user
        // For example, you could disable the button and change its text
        const buttonId = `export${range.charAt(0).toUpperCase() + range.slice(1).replace('day','Day').replace('hour','Hour').replace('Days','DaysBtn').replace('Btn','')}Btn`;
        const button = document.getElementById(buttonId);
        let originalButtonText = '';
        if (button) {
            originalButtonText = button.innerHTML;
            button.disabled = true;
            button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Mengekspor...';
        }

        try {
            const response = await fetch(exportUrl);

            if (response.ok) {
                const contentType = response.headers.get('Content-Type');
                if (contentType && contentType.includes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')) {
                    // It's an Excel file, proceed with download
                    const blob = await response.blob();
                    const disposition = response.headers.get('Content-Disposition');
                    let filename = `sensor_data_${range}.xlsx`; // Default filename

                    if (disposition && disposition.indexOf('attachment') !== -1) {
                        const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
                        const matches = filenameRegex.exec(disposition);
                        if (matches != null && matches[1]) {
                            filename = matches[1].replace(/['"]/g, '');
                        }
                    }

                    const link = document.createElement('a');
                    link.href = URL.createObjectURL(blob);
                    link.setAttribute('download', filename);
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    URL.revokeObjectURL(link.href);
                } else {
                    // Response is OK, but not an Excel file. This is unexpected.
                    // Try to parse as JSON error, or show generic error.
                    try {
                        const errorData = await response.json();
                        alert(`Error: ${errorData.message || 'Terjadi kesalahan saat mengekspor data (format tidak dikenal).'}`);
                    } catch (e) {
                        alert('Error: Terjadi kesalahan saat mengekspor data (respons tidak dikenal).');
                    }
                }
            } else {
                // Server returned an error (e.g., 400, 404, 500)
                // Attempt to parse the error message if it's JSON
                let errorMessage = `Gagal mengekspor data. Status: ${response.status}`;
                try {
                    const errorData = await response.json();
                    if (errorData && errorData.message) {
                        errorMessage = errorData.message;
                    }
                } catch (e) {
                    // Could not parse JSON, use the generic error message
                    console.error('Could not parse error response as JSON:', e);
                }
                alert(errorMessage);
            }
        } catch (error) {
            // Network error or other issues with fetch
            console.error('Export error:', error);
            alert('Terjadi kesalahan jaringan atau masalah lain saat mencoba mengekspor data.');
        } finally {
            // Restore button state
            if (button) {
                button.disabled = false;
                button.innerHTML = originalButtonText;
            }
        }
    }
});
