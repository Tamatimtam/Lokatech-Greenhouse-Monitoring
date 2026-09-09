# Use an official Python runtime as a parent image
FROM python:3.11-slim

# Set the working directory in the container
WORKDIR /app

# Copy the requirements file into the container
COPY requirements.txt .

# Install any needed packages specified in requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application code into the container
COPY . .

# Expose the port the app runs on (Cloud Run requires listening on 8080 by default)
ENV PORT 8080
EXPOSE $PORT

# Run the application
# Assuming app2.py is the main entry point and it runs a Flask app
CMD ["python", "app2.py"]