from flask import Blueprint, render_template, request, jsonify, send_file
from datetime import datetime, timedelta
from blueprints.decorators import isloggedin
from .firestore import get_historical_data, get_latest_data
import openpyxl
from io import BytesIO
from openpyxl.utils import get_column_letter
import pytz # Added pytz import

# Create a blueprint for history routes
history = Blueprint('history', __name__, url_prefix='/history')

@history.route('/')
@isloggedin
def history_page():
    """Render the history page template"""
    return render_template('history.html')

@history.route('/data')
@isloggedin
def history_data():
    """API endpoint to get historical data"""
    # Get query parameters
    section = request.args.get('section', None)
    days = int(request.args.get('days', 7))
    data_type = request.args.get('type', None)
    
    # Get data from Firestore
    data = get_historical_data(section=section, days=days, data_type=data_type)
    
    return jsonify({
        'success': True,
        'data': data
    })

@history.route('/latest')
@isloggedin
def latest_data():
    """API endpoint to get most recent data"""
    data = get_latest_data()
    
    if data:
        return jsonify({
            'success': True,
            'data': data
        })
    else:
        return jsonify({
            'success': False,
            'message': 'No data available'
        }), 404

@history.route('/export_excel')
@isloggedin
def export_excel():
    """API endpoint to export historical data to Excel"""
    time_range_str = request.args.get('range', '1hour') # Default to 1 hour

    # Map string range to days/hours for data fetching
    # For simplicity, we'll use the existing 'days' parameter of get_historical_data.
    # We can refine this to be more precise (e.g., hours for '1hour') if needed.
    # get_historical_data fetches data *up to* 'days' ago.
    # For '1hour', we need a more granular fetch or filter after fetching 1 day.
    # Let's adjust get_historical_data or add a new function for more precise ranges later.
    # For now, '1hour' will effectively get data from the last 24 hours, and we'll filter.
    
    days_to_fetch = 1 # Default to fetching data for the last day for all ranges initially
    if time_range_str == '1day':
        days_to_fetch = 1
    elif time_range_str == '7day':
        days_to_fetch = 7
    elif time_range_str == '30day':
        days_to_fetch = 30
    # For '1hour', we still fetch 1 day and will rely on client-side or a more refined backend filter later.
    # Or, ideally, get_historical_data would support finer granularity.
    # For this phase, we will fetch data for '1day' when '1hour' is requested,
    # and then filter it.

    # Fetch data using the existing function
    # We are not passing section or data_type, so it fetches all sections and all sensor types.
    raw_data = get_historical_data(days=days_to_fetch)

    # Filter data for the '1hour' range if specified
    if time_range_str == '1hour':
        now = datetime.now(pytz.timezone('Asia/Jakarta'))
        one_hour_ago = now - timedelta(hours=1)
        
        filtered_data = []
        for record in raw_data:
            # Assuming record['timestamp'] is an ISO format string from get_historical_data
            record_ts_str = record.get('timestamp')
            if record_ts_str:
                record_ts = datetime.fromisoformat(record_ts_str)
                # Ensure both are offset-aware for comparison if needed, or make them naive
                # get_historical_data returns WIB (Asia/Jakarta) timezone-aware ISO strings
                if record_ts >= one_hour_ago:
                    filtered_data.append(record)
        processed_data = filtered_data
    else:
        processed_data = raw_data


    if not processed_data:
        return jsonify({"success": False, "message": "No data to export for the selected range."}), 404

    # Create an Excel workbook in memory
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Sensor Data"

    # Define headers
    headers = ["Timestamp (WIB)", "Section", "Sensor Type", "Average", "Min", "Max", "Median", "Count"]
    ws.append(headers)

    # Populate data
    # The data structure from get_historical_data is a list of dicts:
    # [{'timestamp': '...', 'data': {'dewasa': {'temps': {...}, 'humidities': {...}}}}]
    for record in processed_data:
        timestamp_str = record.get('timestamp')
        # Attempt to parse the timestamp and format it nicely, or use as is
        try:
            ts_datetime = datetime.fromisoformat(timestamp_str)
            formatted_timestamp = ts_datetime.strftime('%Y-%m-%d %H:%M:%S')
        except (ValueError, TypeError):
            formatted_timestamp = timestamp_str # Fallback to original string if parsing fails

        sections_data = record.get('data', {})
        for section_name, sensor_types_data in sections_data.items():
            for sensor_type, values in sensor_types_data.items():
                if isinstance(values, dict): # Ensure 'values' is a dictionary containing stats
                    row = [
                        formatted_timestamp,
                        section_name.capitalize(),
                        sensor_type.capitalize(),
                        values.get('avg'),
                        values.get('min'),
                        values.get('max'),
                        values.get('median'),
                        values.get('count')
                    ]
                    ws.append(row)
    
    # Adjust column widths
    for col_idx, column_cells in enumerate(ws.columns):
        length = max(len(str(cell.value)) for cell in column_cells)
        ws.column_dimensions[get_column_letter(col_idx + 1)].width = length + 2


    # Save to an in-memory buffer
    excel_buffer = BytesIO()
    wb.save(excel_buffer)
    excel_buffer.seek(0)

    # Create a filename
    filename = f"sensor_data_{time_range_str}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"

    return send_file(
        excel_buffer,
        as_attachment=True,
        download_name=filename,
        mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )