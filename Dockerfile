# Use an official Python runtime as a parent image
FROM python:3.11-slim

# Create user with UID 1000 (standard for Hugging Face Spaces and non-root security)
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH

WORKDIR $HOME/app

# Copy the requirements file into the container
COPY --chown=user requirements.txt .

# Install any needed packages specified in requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application code into the container
COPY --chown=user . .

# Expose port (7860 for Hugging Face Spaces; dynamic PORT on other hosts)
ENV PORT=7860
EXPOSE 7860

# Run the application
CMD ["python", "app2.py"]