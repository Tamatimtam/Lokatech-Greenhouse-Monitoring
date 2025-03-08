import tkinter as tk
from tkinter import ttk
import paho.mqtt.client as mqtt
import json
import time
import threading
import random
from typing import Dict, Any, List, Optional

# MQTT Configuration
MQTT_BROKER = "localhost"
MQTT_PORT = 1883
MQTT_TOPIC_BASE = "greenhouse/sensors"
CLIENT_ID = "greenhouse-simulator"

class SensorType:
    TEMPERATURE = "temperature"
    HUMIDITY = "humidity"
    LIGHT = "light"
    SOIL_MOISTURE = "soil_moisture"
    CO2 = "co2"
    
    # Dictionary mapping sensor types to their properties
    PROPERTIES = {
        TEMPERATURE: {"unit": "°C", "min": 0, "max": 50, "default": 25, "color": "#286247"},
        HUMIDITY: {"unit": "%", "min": 0, "max": 100, "default": 60, "color": "#333333"},
        LIGHT: {"unit": "%", "min": 0, "max": 100, "default": 50, "color": "#F9D949"},
        SOIL_MOISTURE: {"unit": "%", "min": 0, "max": 100, "default": 70, "color": "#3498db"},
        CO2: {"unit": "ppm", "min": 400, "max": 2000, "default": 800, "color": "#EB6B6B"}
    }
    
    @classmethod
    def get_all_types(cls) -> List[str]:
        return [cls.TEMPERATURE, cls.HUMIDITY, cls.LIGHT, cls.SOIL_MOISTURE, cls.CO2]

class SimulationMode:
    FIXED = "Fixed"
    MANUAL = "Manual"
    AUTOMATIC = "Automatic"
    
    @classmethod
    def get_all_modes(cls) -> List[str]:
        return [cls.FIXED, cls.MANUAL, cls.AUTOMATIC]

class Sensor:
    def __init__(self, sensor_id: str, sensor_type: str):
        self.id = sensor_id
        self.type = sensor_type
        self.properties = SensorType.PROPERTIES[sensor_type].copy()
        self.value = self.properties["default"]
        self.connected = True
        self.mode = SimulationMode.MANUAL
        self.target_value = self.value
        self.fluctuation_range = 5  # Default range for automatic fluctuation
    
    def get_topic(self) -> str:
        """Generate the MQTT topic for this sensor"""
        return f"{MQTT_TOPIC_BASE}/{self.type}/{self.id}"
    
    def get_payload(self) -> Dict[str, Any]:
        """Generate the MQTT payload for this sensor"""
        if not self.connected:
            return {
                "status": "disconnected",
                "timestamp": int(time.time())
            }
        
        return {
            "value": self.value,
            "unit": self.properties["unit"],
            "status": "connected",
            "timestamp": int(time.time())
        }
    
    def update_value(self):
        """Update sensor value based on simulation mode"""
        if not self.connected or self.mode == SimulationMode.FIXED:
            return
            
        if self.mode == SimulationMode.AUTOMATIC:
            # Move current value towards target with small random fluctuations
            direction = 1 if self.target_value > self.value else -1
            step = min(abs(self.target_value - self.value), random.uniform(0.1, 0.5))
            fluctuation = random.uniform(-0.5, 0.5)
            self.value = max(self.properties["min"], 
                           min(self.properties["max"],
                               self.value + (step * direction) + fluctuation))

class SensorSimulator:
    def __init__(self, master):
        self.master = master
        self.master.title("Greenhouse Sensor Simulator")
        self.master.geometry("900x600")
        self.master.configure(bg="#F5F7FA")  # Match your app's background
        
        self.sensors: Dict[str, Sensor] = {}
        self.mqtt_client = self._setup_mqtt()
        self.running = True
        
        self._create_ui()
        
        # Start publishing thread
        self.mqtt_thread = threading.Thread(target=self._publish_sensor_data)
        self.mqtt_thread.daemon = True
        self.mqtt_thread.start()
    
    def _setup_mqtt(self) -> mqtt.Client:
        """Set up the MQTT client"""
        client = mqtt.Client(client_id=CLIENT_ID)
        try:
            client.connect(MQTT_BROKER, MQTT_PORT, 60)
            client.loop_start()
            print(f"Connected to MQTT broker at {MQTT_BROKER}:{MQTT_PORT}")
        except Exception as e:
            print(f"Failed to connect to MQTT broker: {e}")
        return client
    
    def _create_ui(self):
        """Create the user interface"""
        # Main container
        self.main_frame = ttk.Frame(self.master, padding="20")
        self.main_frame.pack(fill=tk.BOTH, expand=True)
        
        # Title and instructions
        title_frame = ttk.Frame(self.main_frame)
        title_frame.pack(fill=tk.X, pady=(0, 20))
        
        ttk.Label(
            title_frame, 
            text="Greenhouse Sensor Simulator", 
            font=("Helvetica", 18, "bold")
        ).pack(side=tk.LEFT)
        
        # Sensor controls container (scrollable)
        self.sensor_canvas = tk.Canvas(self.main_frame, bg="#F5F7FA")
        self.sensor_scroll = ttk.Scrollbar(
            self.main_frame, 
            orient="vertical", 
            command=self.sensor_canvas.yview
        )
        self.sensor_frame = ttk.Frame(self.sensor_canvas)
        
        self.sensor_frame.bind(
            "<Configure>",
            lambda e: self.sensor_canvas.configure(scrollregion=self.sensor_canvas.bbox("all"))
        )
        
        self.sensor_canvas.create_window((0, 0), window=self.sensor_frame, anchor="nw")
        self.sensor_canvas.configure(yscrollcommand=self.sensor_scroll.set)
        
        self.sensor_canvas.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        self.sensor_scroll.pack(side=tk.RIGHT, fill=tk.Y)
        
        # Controls at the bottom
        control_frame = ttk.Frame(self.master, padding="20")
        control_frame.pack(fill=tk.X, side=tk.BOTTOM)
        
        # Add sensor button
        ttk.Button(
            control_frame, 
            text="Add Sensor", 
            command=self._show_add_sensor_dialog
        ).pack(side=tk.LEFT, padx=5)
        
        # Clear all sensors button
        ttk.Button(
            control_frame, 
            text="Remove All Sensors", 
            command=self._remove_all_sensors
        ).pack(side=tk.LEFT, padx=5)
        
        # Add some default sensors
        self._add_sensor("temp1", SensorType.TEMPERATURE)
        self._add_sensor("humid1", SensorType.HUMIDITY)
        self._add_sensor("light1", SensorType.LIGHT)
    
    def _show_add_sensor_dialog(self):
        """Show dialog to add a new sensor"""
        dialog = tk.Toplevel(self.master)
        dialog.title("Add New Sensor")
        dialog.geometry("400x200")
        dialog.transient(self.master)
        dialog.grab_set()
        
        ttk.Label(dialog, text="Sensor ID:").grid(row=0, column=0, padx=10, pady=10, sticky=tk.W)
        sensor_id = ttk.Entry(dialog, width=20)
        sensor_id.grid(row=0, column=1, padx=10, pady=10)
        
        ttk.Label(dialog, text="Sensor Type:").grid(row=1, column=0, padx=10, pady=10, sticky=tk.W)
        sensor_type = ttk.Combobox(dialog, values=SensorType.get_all_types(), state="readonly")
        sensor_type.current(0)
        sensor_type.grid(row=1, column=1, padx=10, pady=10)
        
        def add_sensor():
            sid = sensor_id.get().strip()
            stype = sensor_type.get()
            
            if not sid:
                tk.messagebox.showerror("Error", "Please enter a Sensor ID")
                return
                
            if sid in self.sensors:
                tk.messagebox.showerror("Error", f"Sensor with ID '{sid}' already exists")
                return
            
            self._add_sensor(sid, stype)
            dialog.destroy()
        
        ttk.Button(dialog, text="Add", command=add_sensor).grid(
            row=2, column=0, columnspan=2, pady=20
        )
    
    def _add_sensor(self, sensor_id: str, sensor_type: str):
        """Add a new sensor to the simulator"""
        sensor = Sensor(sensor_id, sensor_type)
        self.sensors[sensor_id] = sensor
        
        # Create sensor UI controls
        sensor_frame = ttk.LabelFrame(
            self.sensor_frame, 
            text=f"{sensor_type.capitalize()} - {sensor_id}",
            padding="10"
        )
        sensor_frame.pack(fill=tk.X, padx=10, pady=5)
        
        # Top row with mode selection and connection toggle
        top_row = ttk.Frame(sensor_frame)
        top_row.pack(fill=tk.X, pady=5)
        
        ttk.Label(top_row, text="Mode:").pack(side=tk.LEFT, padx=(0, 5))
        mode_var = tk.StringVar(value=sensor.mode)
        mode_combo = ttk.Combobox(
            top_row, 
            textvariable=mode_var,
            values=SimulationMode.get_all_modes(),
            state="readonly",
            width=10
        )
        mode_combo.pack(side=tk.LEFT, padx=(0, 20))
        
        # Connection toggle
        connected_var = tk.BooleanVar(value=sensor.connected)
        connected_check = ttk.Checkbutton(
            top_row,
            text="Connected",
            variable=connected_var,
            onvalue=True,
            offvalue=False
        )
        connected_check.pack(side=tk.LEFT)
        
        # Remove button
        ttk.Button(
            top_row,
            text="Remove",
            command=lambda sid=sensor_id: self._remove_sensor(sid)
        ).pack(side=tk.RIGHT)
        
        # Middle row with current value display
        middle_row = ttk.Frame(sensor_frame)
        middle_row.pack(fill=tk.X, pady=10)
        
        value_var = tk.StringVar(value=f"{sensor.value} {sensor.properties['unit']}")
        value_label = ttk.Label(
            middle_row,
            textvariable=value_var,
            font=("Helvetica", 16)
        )
        value_label.pack(side=tk.LEFT)
        
        # Bottom row with slider
        bottom_row = ttk.Frame(sensor_frame)
        bottom_row.pack(fill=tk.X, pady=5)
        
        slider_var = tk.DoubleVar(value=sensor.value)
        slider = ttk.Scale(
            bottom_row,
            from_=sensor.properties["min"],
            to=sensor.properties["max"],
            variable=slider_var,
            orient="horizontal"
        )
        slider.pack(fill=tk.X, padx=(0, 10), side=tk.LEFT, expand=True)
        
        # Target value for automatic mode
        target_frame = ttk.Frame(sensor_frame)
        target_frame.pack(fill=tk.X, pady=5)
        
        ttk.Label(target_frame, text="Target:").pack(side=tk.LEFT, padx=(0, 5))
        target_var = tk.DoubleVar(value=sensor.target_value)
        target_entry = ttk.Spinbox(
            target_frame,
            from_=sensor.properties["min"],
            to=sensor.properties["max"],
            textvariable=target_var,
            width=5,
            increment=1.0
        )
        target_entry.pack(side=tk.LEFT, padx=(0, 20))
        
        ttk.Label(target_frame, text="Fluctuation:").pack(side=tk.LEFT, padx=(0, 5))
        fluctuation_var = tk.DoubleVar(value=sensor.fluctuation_range)
        fluctuation_entry = ttk.Spinbox(
            target_frame,
            from_=0.1,
            to=20.0,
            textvariable=fluctuation_var,
            width=5,
            increment=0.5
        )
        fluctuation_entry.pack(side=tk.LEFT)
        
        # Update functions to sync UI with sensor state
        def update_sensor_from_ui(*args):
            sensor.mode = mode_var.get()
            sensor.connected = connected_var.get()
            sensor.target_value = target_var.get()
            sensor.fluctuation_range = fluctuation_var.get()
            
            if sensor.mode == SimulationMode.MANUAL:
                sensor.value = slider_var.get()
        
        def update_ui_from_sensor(*args):
            value_var.set(f"{sensor.value:.1f} {sensor.properties['unit']}")
            
            # Enable/disable controls based on mode
            if sensor.mode == SimulationMode.FIXED:
                slider.state(['disabled'])
                target_entry.state(['disabled'])
                fluctuation_entry.state(['disabled'])
            elif sensor.mode == SimulationMode.MANUAL:
                slider.state(['!disabled'])
                target_entry.state(['disabled'])
                fluctuation_entry.state(['disabled'])
            else:  # AUTOMATIC
                slider.state(['disabled'])
                target_entry.state(['!disabled'])
                fluctuation_entry.state(['!disabled'])
        
        # Bind update functions
        mode_var.trace_add("write", update_sensor_from_ui)
        connected_var.trace_add("write", update_sensor_from_ui)
        slider_var.trace_add("write", update_sensor_from_ui)
        target_var.trace_add("write", update_sensor_from_ui)
        fluctuation_var.trace_add("write", update_sensor_from_ui)
        
        # Store UI elements with sensor for updates
        sensor.ui = {
            "frame": sensor_frame,
            "value_var": value_var,
            "slider_var": slider_var,
            "update_ui": update_ui_from_sensor
        }
        
        # Initial UI update
        update_ui_from_sensor()
    
    def _remove_sensor(self, sensor_id: str):
        """Remove a sensor from the simulator"""
        if sensor_id in self.sensors:
            # Destroy the sensor's UI frame
            if hasattr(self.sensors[sensor_id], 'ui'):
                self.sensors[sensor_id].ui["frame"].destroy()
            
            # Remove sensor from dictionary
            del self.sensors[sensor_id]
    
    def _remove_all_sensors(self):
        """Remove all sensors from the simulator"""
        sensor_ids = list(self.sensors.keys())
        for sensor_id in sensor_ids:
            self._remove_sensor(sensor_id)
    
    def _publish_sensor_data(self):
        """Continuously publish sensor data to MQTT"""
        while self.running:
            for sensor_id, sensor in list(self.sensors.items()):
                # Update sensor value
                sensor.update_value()
                
                # Update UI
                if hasattr(sensor, 'ui'):
                    self.master.after(0, sensor.ui["update_ui"])
                
                # Publish to MQTT
                try:
                    topic = sensor.get_topic()
                    payload = json.dumps(sensor.get_payload())
                    self.mqtt_client.publish(topic, payload, qos=1)
                except Exception as e:
                    print(f"Error publishing sensor {sensor_id}: {e}")
            
            # Wait for next publish cycle
            time.sleep(1)
    
    def on_closing(self):
        """Clean up resources when closing the application"""
        self.running = False
        if hasattr(self, 'mqtt_client'):
            self.mqtt_client.loop_stop()
            self.mqtt_client.disconnect()
        self.master.destroy()

if __name__ == "__main__":
    root = tk.Tk()
    
    # Apply a theme
    style = ttk.Style()
    if "clam" in style.theme_names():
        style.theme_use("clam")
    
    # Configure styles
    style.configure("TButton", font=("Helvetica", 10))
    style.configure("TLabel", font=("Helvetica", 10))
    style.configure("TLabelframe", font=("Helvetica", 10, "bold"))
    
    app = SensorSimulator(root)
    root.protocol("WM_DELETE_WINDOW", app.on_closing)
    root.mainloop()
