from flask import Blueprint, render_template, request, jsonify, send_file
from datetime import datetime, timedelta
from blueprints.decorators import isloggedin
from .firestore import get_historical_data, get_latest_data
import openpyxl # Ensure openpyxl is imported
from io import BytesIO
from openpyxl.utils import get_column_letter
import pytz # Ensure pytz is imported

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
    time_range_str = request.args.get('range', '1hour')

    if time_range_str not in ['1hour', '1day', '7day', '30day']:
        return jsonify({"success": False, "message": "Invalid time range specified."}), 400
    
    if time_range_str in ['7day', '30day']: # Block 7d and 30d for now
        return jsonify({"success": False, "message": f"Export for {time_range_str} is not yet supported."}), 400

    days_to_fetch = 1 # Fetch 1 day of data for both 1hour and 1day requests initially
    
    raw_data = get_historical_data(days=days_to_fetch)
    processed_data = []
    now_wib = datetime.now(pytz.timezone('Asia/Jakarta'))

    if time_range_str == '1hour':
        one_hour_ago = now_wib - timedelta(hours=1)
        for record in raw_data:
            record_ts_str = record.get('timestamp')
            if record_ts_str:
                try:
                    record_ts = datetime.fromisoformat(record_ts_str)
                    if record_ts >= one_hour_ago:
                        processed_data.append(record)
                except ValueError:
                    print(f"Warning: Could not parse timestamp {record_ts_str} for 1-hour filter.")
                    continue
    elif time_range_str == '1day':
        one_day_ago = now_wib - timedelta(days=1)
        for record in raw_data:
            record_ts_str = record.get('timestamp')
            if record_ts_str:
                try:
                    record_ts = datetime.fromisoformat(record_ts_str)
                    if record_ts >= one_day_ago: # Ensure data is within the last 24 hours from now
                        processed_data.append(record) # Corrected: Added append here
                except ValueError:
                    print(f"Warning: Could not parse timestamp {record_ts_str} for 1-day filter.")
                    continue
    # No 'else' needed as 7d/30d are blocked and other invalid ranges are caught earlier.

    if not processed_data:
        return jsonify({"success": False, "message": "No data to export for the selected range."}), 404

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Sensor Data"
    headers = ["Timestamp (WIB)", "Section", "Sensor Type", "Average", "Min", "Max", "Median", "Count"]
    ws.append(headers)

    for record in processed_data:
        timestamp_str = record.get('timestamp')
        try:
            ts_datetime = datetime.fromisoformat(timestamp_str)
            formatted_timestamp = ts_datetime.strftime('%Y-%m-%d %H:%M:%S')
        except (ValueError, TypeError):
            formatted_timestamp = timestamp_str

        sections_data = record.get('data', {})
        for section_name, sensor_types_data in sections_data.items():
            for sensor_type, values in sensor_types_data.items():
                if isinstance(values, dict):
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
    
    for col_idx, column_cells in enumerate(ws.columns):
        if column_cells: # Ensure column_cells is not empty
            length = max(len(str(cell.value)) if cell.value is not None else 0 for cell in column_cells)
            ws.column_dimensions[get_column_letter(col_idx + 1)].width = length + 2

    excel_buffer = BytesIO()
    wb.save(excel_buffer)
    excel_buffer.seek(0)
    filename = f"sensor_data_{time_range_str}_{now_wib.strftime('%Y%m%d_%H%M%S')}.xlsx"

    return send_file(
        excel_buffer,
        as_attachment=True,
        download_name=filename,
        mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )