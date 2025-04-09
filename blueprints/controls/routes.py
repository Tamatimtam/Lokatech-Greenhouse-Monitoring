from flask import render_template, session, request, jsonify
from . import bp
from ..decorators import isloggedin
# Import the global sensor_manager to access its MQTT client instance
# Note: This creates a dependency between blueprints. Consider refactoring later if needed.
from ..sensor.mqtt import sensor_manager
import paho.mqtt.client as mqtt # <-- Add this import
import logging
import json

logger = logging.getLogger(__name__)

# Define the MQTT topic for sending control commands to the hardware
MQTT_CONTROL_TOPIC = "lokatech/greenhouse/controls/set"

@bp.route("/")
@isloggedin
def controls_page():
    # Route for rendering the controls page (if you have one separate from dashboard)
    # If controls are only on dashboard, this route might not be needed.
    logger.debug(f"Serving controls page for user: {session['user']['email']}")
    # Pass initial actuator state if needed, fetched similarly to dashboard
    # initial_actuator_state = sensor_manager.get_data().get('actuators', None)
    return render_template("controls.html", user=session['user']) # Or maybe dashboard.html?

@bp.route("/api/set_state", methods=["POST"])
@isloggedin
def set_actuator_state():
    """API endpoint for UI to send control commands."""
    try:
        data = request.get_json()
        if not data or 'device' not in data or 'state' not in data:
            logger.warning("Invalid control command received: Missing device or state")
            return jsonify({"status": "error", "message": "Invalid command format"}), 400

        device = data['device']
        state = data['state'] # Expecting boolean true/false

        if device not in ['fan', 'light']:
            logger.warning(f"Invalid control command received: Unknown device '{device}'")
            return jsonify({"status": "error", "message": "Unknown device"}), 400

        if not isinstance(state, bool):
             logger.warning(f"Invalid control command received: State is not boolean for device '{device}'")
             return jsonify({"status": "error", "message": "Invalid state value"}), 400

        # Construct the MQTT payload
        # Mode is implicitly 'manual' when set via API
        command_payload = {
            "device": device,
            "state": state,
            "mode": "manual" 
        }
        payload_str = json.dumps(command_payload)

        logger.info(f"Attempting to publish control command: {payload_str} to topic {MQTT_CONTROL_TOPIC}")

        # Use the MQTT client from the sensor_manager
        mqtt_client = sensor_manager.client
        if mqtt_client and sensor_manager.mqtt_connected:
            result = mqtt_client.publish(MQTT_CONTROL_TOPIC, payload_str)
            if result.rc == mqtt.MQTT_ERR_SUCCESS:
                 logger.info(f"Control command published successfully for {device}")
                 return jsonify({"status": "success", "message": "Command sent"})
            else:
                 logger.error(f"Failed to publish MQTT control command, rc={result.rc}")
                 return jsonify({"status": "error", "message": "Failed to send command via MQTT"}), 500
        else:
            logger.error("MQTT client not available or not connected. Cannot send control command.")
            return jsonify({"status": "error", "message": "MQTT client unavailable"}), 503

    except Exception as e:
        logger.error(f"Error processing set_state request: {str(e)}")
        return jsonify({"status": "error", "message": "Internal server error"}), 500
