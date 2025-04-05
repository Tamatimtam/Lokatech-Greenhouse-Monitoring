from flask import jsonify
from . import bp
from .mqtt import sensor_manager
from ..decorators import isloggedin
import logging

logger = logging.getLogger(__name__)

@bp.route("/data")
@isloggedin
def get_sensor_data():
    """API endpoint to get the latest sensor data"""
    data = sensor_manager.get_data()
    if not data:
        logger.warning("No sensor data available")
        return jsonify({
            "error": "No sensor data available",
            "status": "offline",
            "message": "Tidak ada data dari jaringan ESP"
        }), 404
    return jsonify(data)
