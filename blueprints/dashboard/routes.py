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

try:
    from ..logs.firestore_logger import log_user_action, UserActionType # Added UserActionType for consistency, though not directly used here
    system_logger_available = True
except ImportError:
    system_logger_available = False
    # Ensure the dummy function matches the new signature if system_logger is not available
    def log_user_action(username, action_description, device=None, node_affected="meja_apung", source="user_interface", ip_address=None): # Changed 'remaja' to 'meja_apung'
        logging.warning(f"[DUMMY_USER_ACTION_LOG] User: {username}, Action: {action_description}, Device: {device}, Node: {node_affected}, Source: {source}, IP: {ip_address}")

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
        "node": "meja_apung", # Changed 'remaja' to 'meja_apung' as it's the master node
        "device":device,
        "state":state,
        "mode":mode
    })

    # Publish the command to the MQTT broker
    try:
        publish_result = sensor_manager.client.publish(MQTT_CONTROL_TOPIC, mqtt_payload)
        if publish_result.rc == mqtt.MQTT_ERR_SUCCESS:
            logger.info(f"Successfully published MQTT command to {MQTT_CONTROL_TOPIC}: {mqtt_payload}")
            
            if system_logger_available:
                user_email = session['user'].get('email', 'unknown_user')
                action_details = f"Set {device} to {'ON' if state else 'OFF'}, mode to {mode}."
                # Pass ip_address to log_user_action
                log_user_action(
                    username=user_email, 
                    action_description=action_details, 
                    device=device, 
                    node_affected="remaja", # Assuming 'remaja' is the target node for dashboard controls
                    source="dashboard_controls",
                    ip_address=request.remote_addr
                )

            # Update the local state in sensor_manager for immediate feedback on dashboard
            if device in sensor_manager.latest_data.get('actuators', {}):
                 sensor_manager.latest_data['actuators'][device]['state'] = state
                 sensor_manager.latest_data['actuators'][device]['mode'] = mode
                 sensor_manager.last_update = datetime.datetime.now(datetime.timezone.utc)
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
            logger.warning(f"MQTT offline or failed publish, applying state to simulation: {mqtt_payload}")
            if device in sensor_manager.latest_data.get('actuators', {}):
                 sensor_manager.latest_data['actuators'][device]['state'] = state
                 sensor_manager.latest_data['actuators'][device]['mode'] = mode
                 sensor_manager.last_update = datetime.datetime.now(datetime.timezone.utc)
                 if sensor_manager.socketio:
                     sensor_manager.socketio.emit('sensor_update', sensor_manager.latest_data)
            return jsonify({
                "status": "success",
                "simulated": True,
                "message": f"Command updated for {device} (simulated)",
                "published_data": data
            }), 200
    except Exception as e:
        logger.warning(f"Exception during MQTT publish, falling back to simulated state: {e}")
        if device in sensor_manager.latest_data.get('actuators', {}):
             sensor_manager.latest_data['actuators'][device]['state'] = state
             sensor_manager.latest_data['actuators'][device]['mode'] = mode
             sensor_manager.last_update = datetime.datetime.now(datetime.timezone.utc)
             if sensor_manager.socketio:
                 sensor_manager.socketio.emit('sensor_update', sensor_manager.latest_data)
        return jsonify({
            "status": "success",
            "simulated": True,
            "message": f"Command updated for {device} (simulated fallback)",
            "published_data": data
        }), 200
