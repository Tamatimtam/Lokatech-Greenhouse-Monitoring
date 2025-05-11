from flask import render_template, session, request, jsonify
from . import bp
from ..decorators import isloggedin
from ..sensor.mqtt import sensor_manager # Import the global sensor_manager instance
import logging
import datetime
import json # Import json for creating the MQTT payload
import paho.mqtt.client as mqtt # Import mqtt for error code reference

logger = logging.getLogger(__name__)

# Define the MQTT control topic based on the hardware code
MQTT_CONTROL_TOPIC = "lokatech/greenhouse/controls/set"

@bp.route("/")
@isloggedin
def dashboard():
    logger.debug(f"Serving dashboard for user: {session['user']['email']}")
    sensor_data = sensor_manager.get_data()
    return render_template("dashboard.html", user=session['user'], sensor_data=sensor_data)

@bp.route("/controls/api/set_state", methods=['POST'])
@isloggedin
def set_control_state():
    """
    Receives control commands from the dashboard frontend and publishes them via MQTT.
    """
    data = request.get_json()
    if not data:
        logger.error("Received empty or invalid JSON data for set_control_state")
        return jsonify({"message": "Invalid JSON data"}), 400

    device = data.get('device')
    state = data.get('state')
    mode = data.get('mode', 'manual') # Default to manual if not provided

    if device is None or state is None:
        logger.error(f"Missing 'device' or 'state' in command payload: {data}")
        return jsonify({"message": "Missing 'device' or 'state'"}), 400

    logger.info(f"Received control command: device={device}, state={state}, mode={mode}")

    # Prepare payload for MQTT
    mqtt_payload = json.dumps({
        "device":device,
        "state":state,
        "mode":mode
    })

    # Publish the command to the MQTT broker
    try:
        if sensor_manager.client.publish(MQTT_CONTROL_TOPIC, mqtt_payload).rc == mqtt.MQTT_ERR_SUCCESS:
            logger.info(f"Successfully published MQTT command to {MQTT_CONTROL_TOPIC}: {mqtt_payload}")
            # Update the local state in sensor_manager for immediate feedback on dashboard
            if device in sensor_manager.latest_data.get('actuators', {}):
                 sensor_manager.latest_data['actuators'][device]['state'] = state
                 sensor_manager.latest_data['actuators'][device]['mode'] = mode
                 sensor_manager.last_update = datetime.datetime.now() # Mark data as fresh
                 # Optionally emit via websocket immediately if socketio is set
                 if sensor_manager.socketio:
                     try:
                         sensor_manager.socketio.emit('sensor_update', sensor_manager.latest_data)
                         logger.debug("Emitted updated actuator state via WebSocket after manual control")
                     except Exception as emit_error:
                         logger.error(f"Failed to emit WebSocket update after manual control: {emit_error}")

            return jsonify({
                "status": "success",
                "message": f"Command published for {device}",
                "published_data": data
            }), 200
        else:
            logger.error(f"Failed to publish MQTT command to {MQTT_CONTROL_TOPIC}: {mqtt_payload}")
            return jsonify({"message": "Failed to publish command via MQTT"}), 500
    except Exception as e:
        logger.error(f"Exception during MQTT publish: {e}")
        return jsonify({"message": f"Error publishing command: {e}"}), 500
