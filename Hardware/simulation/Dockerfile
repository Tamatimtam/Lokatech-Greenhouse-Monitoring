# Use an official Python runtime as a parent image
FROM python:3.9-slim

# Set the working directory in the container
WORKDIR /app

# Copy the requirements file into the container
# Assuming requirements.txt is in the same directory as the Dockerfile
COPY requirements.txt .

# Install any needed packages specified in requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application code into the container
# This will copy mqtt_to_firestore.py and any other necessary files
COPY . .

# Run the application script
CMD ["python", "mqtt_to_firestore.py"]
