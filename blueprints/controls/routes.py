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
        logger.info(f"[DEBUG] Received POST to /api/set_state")
        logger.info(f"[DEBUG] Request headers: {dict(request.headers)}")
        logger.info(f"[DEBUG] Request content type: {request.content_type}")
        
        # Log raw request data
        raw_data = request.get_data().decode('utf-8', errors='replace')
        logger.info(f"[DEBUG] Raw request data: {raw_data}")
        
        data = request.get_json()
        logger.info(f"[DEBUG] Parsed JSON data: {data}")
        
        if not data or 'device' not in data or 'state' not in data:
            logger.warning("Invalid control command received: Missing device or state")
            return jsonify({"status": "error", "message": "Invalid command format"}), 400

        device = data['device']
        state = data['state'] # Expecting boolean true/false
        mode = data.get('mode', 'manual')  # Get mode if present, default to manual
        
        logger.info(f"Received control request: device={device}, state={state}, mode={mode}")

        if device not in ['fan', 'light']:
            logger.warning(f"Invalid control command received: Unknown device '{device}'")
            return jsonify({"status": "error", "message": "Unknown device"}), 400

        if not isinstance(state, bool):
             logger.warning(f"Invalid control command received: State is not boolean for device '{device}'")
             return jsonify({"status": "error", "message": "Invalid state value"}), 400

        # Construct the MQTT payload
        # Get the mode from the request, default to 'manual' if not specified
        # Note: We already got the mode earlier, but let's ensure we handle it properly here
        logger.info(f"[DEBUG] Processing mode from data: {data.get('mode')}")
        
        # Explicitly extract mode and log the value
        extracted_mode = data.get('mode')
        logger.info(f"[DEBUG] Extracted mode value: {extracted_mode} (type: {type(extracted_mode).__name__})")
        
        mode = data.get('mode', 'manual')
        logger.info(f"[DEBUG] Mode after get with default: {mode}")
        
        if mode not in ['manual', 'auto']:
            logger.warning(f"[DEBUG] Invalid mode '{mode}' received, falling back to 'manual'")
            mode = 'manual'  # Fallback to manual if invalid mode
            
        command_payload = {
            "device": device,
            "state": state,
            "mode": mode
        }
        logger.info(f"[DEBUG] Final command payload structure: {command_payload}")
        payload_str = json.dumps(command_payload)
        logger.info(f"[DEBUG] Serialized payload: {payload_str}")

        logger.info(f"Attempting to publish control command: {payload_str} to topic {MQTT_CONTROL_TOPIC}")

        # Use the MQTT client from the sensor_manager
        mqtt_client = sensor_manager.client
        logger.info(f"[DEBUG] MQTT client status - Available: {mqtt_client is not None}, Connected: {sensor_manager.mqtt_connected}")
        
        if mqtt_client and sensor_manager.mqtt_connected:
            # Examine the message to be sent
            logger.info(f"[DEBUG] JSON string length: {len(payload_str)} bytes")
            logger.info(f"[DEBUG] ASCII values of each byte: {[ord(c) for c in payload_str]}")
            logger.info(f"[DEBUG] About to publish to MQTT - Topic: {MQTT_CONTROL_TOPIC}, Message: {repr(payload_str)}")
            
            result = mqtt_client.publish(MQTT_CONTROL_TOPIC, payload_str)
            logger.info(f"[DEBUG] MQTT publish result - RC: {result.rc}, is_published: {result.is_published()}")
            
            if result.rc == mqtt.MQTT_ERR_SUCCESS:
                 logger.info(f"[DEBUG] Control command published successfully for {device} with mode={mode}")
                 return jsonify({"status": "success", "message": "Command sent"})
            else:
                 logger.error(f"[DEBUG] Failed to publish MQTT control command, rc={result.rc}")
                 return jsonify({"status": "error", "message": "Failed to send command via MQTT"}), 500
        else:
            logger.error("MQTT client not available or not connected. Cannot send control command.")
            return jsonify({"status": "error", "message": "MQTT client unavailable"}), 503

    except Exception as e:
        logger.error(f"Error processing set_state request: {str(e)}")
        return jsonify({"status": "error", "message": "Internal server error"}), 500
