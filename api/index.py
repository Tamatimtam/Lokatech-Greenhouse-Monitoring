import sys
import os

# Add root folder to sys.path so blueprints and local modules are loaded
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app2 import app
