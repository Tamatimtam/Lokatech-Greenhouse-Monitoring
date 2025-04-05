# Project Guidelines & Conventions

## Project Structure
```
simpleLogin/
├── app2.py                # Main Flask application
├── blueprints/            # Blueprint modules
├── Hardware/              # PlatformIO project for ESP32 nodes
├── static/                # Static assets (CSS, JS, images)
│   ├── css/
│   ├── images/
│   └── js/
├── templates/             # HTML templates (Jinja2)
│   └── macros/
├── secrets/               # Sensitive configuration (e.g., Firebase creds)
├── Dockerfile             # Containerization configuration
├── instructions.md        # This file
├── README.md              # Project overview
└── requirements.txt       # Python dependencies
```

## Core Files
- `main.css`: Contains global CSS variables and base styles
- `base.html`: Base template that all pages extend
- `app2.py`: Main Flask application

## Design System

### CSS Variables (from main.css)
```css
Colors:
--primary: #286247
--primary-light: #357456
--primary-dark: #035c1d
--background: #F5F7FA
--surface: #FFFFFF
--text-primary: #1A1A1A
--text-secondary: #666666

Spacing:
--spacing-xs: 0.25rem
--spacing-sm: 0.5rem
--spacing-md: 1rem
--spacing-lg: 1.5rem
--spacing-xl: 2rem

Border Radius:
--radius-sm: 4px
--radius-md: 8px
--radius-lg: 16px
```

### Component Structure
1. Each component has its own CSS file in `/static/css/components/`
2. Each component has its own macro file in `/templates/macros/`
3. Components should be self-contained and reusable

## File Organization

### CSS Files
- `main.css`: Global variables and base styles
- `layout.css`: Grid system and layout utilities
- `[page].css`: Page-specific styles
- `components/*.css`: Individual component styles

### JavaScript Files
- `dashboard.js`: Dashboard functionality and sensor data handling
- `login.js`: Authentication and login handling
- `profile-page.js`: Profile management and settings
- `firebase-init.js`: Firebase configuration

### Templates
- All pages extend `base.html`
- Use macros for reusable components
- Page-specific content goes in content block
- Scripts go in scripts block
- Styles go in styles block

## Important Conventions

### Template Structure
```html
{% extends "base.html" %}
{% import "macros/components.html" as components %}

{% block title %}Page Title{% endblock %}

{% block styles %}
<link rel="stylesheet" href="{{ url_for('static', filename='css/[page].css') }}">
{% endblock %}

{% block content %}
<!-- Page content here -->
{% endblock %}

{% block scripts %}
<!-- Page-specific scripts here -->
{% endblock %}
```

### CSS Component Pattern
```css
/* Component base */
.component {
  /* Use CSS variables for consistency */
  padding: var(--spacing-md);
  background: var(--surface);
  border-radius: var(--radius-md);
}

/* Component variants */
.component--variant {
  /* Variant-specific styles */
}

/* Responsive adjustments */
@media (max-width: 768px) {
  .component {
    /* Tablet styles */
  }
}

@media (max-width: 480px) {
  .component {
    /* Mobile styles */
  }
}
```

### JavaScript Organization
- Use class/object-based organization for complex features
- Group related functionality into logical objects
- Use consistent naming conventions
- Handle errors gracefully
- Use async/await for asynchronous operations

## Key Features

### Authentication
- Firebase Authentication
- Session management in Flask
- Protected routes with @isloggedin decorator

### Sensor Data
- MQTT communication
- Real-time updates
- Data validation
- Error handling
- Status monitoring

### UI Components
1. Environmental Gauges
   - Temperature
   - Humidity
   - Light

2. Control Panels
   - Fan controls (UI implemented, backend control logic pending)
   - Light controls (UI implemented, backend control logic pending)

3. Status Indicators
   - Connection status
   - Node status
   - Sensor status

## Common Pitfalls to Avoid
1. Don't duplicate component styles - use existing components
2. Always extend base.html for new pages
3. Use CSS variables for consistency
4. Keep JavaScript modular and organized
5. Use proper error handling
6. Follow the established component patterns
7. Use responsive design patterns
8. Maintain consistent naming conventions

## Development Workflow
1. Check existing components before creating new ones
2. Use the macro system for reusable HTML
3. Keep styles organized by component
4. Test features with the hardware simulator
5. Validate changes across different screen sizes
6. Use proper error handling and logging

## Node Names Convention
- penyemaian
- peremajaan
- dewasa

## Sensor Types
- temp (temperature)
- humidity
- light

## Important URLs
- Login: / (root)
- Dashboard: /dashboard/
- Controls: /controls/
- Profile: /profile/
- Auth endpoints: /auth/*
- Sensor API: /api/sensor/data

## API Endpoints
- GET /api/sensor/data: Get latest sensor readings and status
- POST /auth/login: Authenticate user
- GET /auth/logout: Log out user

## Flask Application Structure

### Blueprints Organization
```
simpleLogin/
├── app2.py              # Main application entry point
└── blueprints/         # Blueprint modules
    ├── __init__.py     # Blueprint initialization
    ├── auth/           # Authentication related routes
    │   ├── __init__.py
    │   ├── routes.py   # Login, logout, session management
    │   └── utils.py    # Auth helper functions
    ├── dashboard/      # Dashboard functionality
    │   ├── __init__.py
    │   ├── routes.py   # Dashboard views and API endpoints
    │   └── utils.py    # Dashboard helper functions
    ├── sensor/         # Sensor data management
    │   ├── __init__.py
    │   ├── routes.py   # Sensor data endpoints
    │   ├── mqtt.py     # MQTT client and handlers
    │   └── utils.py    # Sensor data processing
    ├── controls/       # Control panel functionality
    │   ├── __init__.py
    │   ├── routes.py   # Control interface routes
    │   └── utils.py    # Control helper functions
    └── profile/        # Profile management
        ├── __init__.py
        ├── routes.py   # Profile routes
        └── utils.py    # Profile helper functions
```

### Blueprint Responsibilities

1. **Auth Blueprint** (`blueprints/auth/`)
   - Handle user authentication with Firebase
   - Session management
   - Login/logout routes
   - Authentication decorators and middleware
   - URL prefix: `/auth`

2. **Dashboard Blueprint** (`blueprints/dashboard/`)
   - Main dashboard view
   - Environmental data visualization
   - Status overview
   - Real-time updates
   - URL prefix: `/dashboard`

3. **Sensor Blueprint** (`blueprints/sensor/`)
   - MQTT client management
   - Sensor data processing and validation
   - Data aggregation and calculations
   - Sensor status monitoring
   - URL prefix: `/api/sensor`

4. **Controls Blueprint** (`blueprints/controls/`)
   - Control panel interface routes (UI implemented)
   - Device control endpoints (Planned, not implemented)
   - Control state management (Planned, not implemented)
   - URL prefix: `/controls`

5. **Profile Blueprint** (`blueprints/profile/`)
   - User profile management
   - User settings and preferences
   - Profile information display
   - URL prefix: `/profile`

### Blueprint Usage Convention
```python
# Blueprint initialization pattern
from flask import Blueprint

bp = Blueprint('name', __name__, url_prefix='/prefix')

# Route pattern
@bp.route('/')
def index():
    return 'Blueprint route'

# Register pattern (in app2.py)
from blueprints.name import bp as name_bp
app.register_blueprint(name_bp)
```

### Shared Utilities
- Common utilities should go in `blueprints/utils.py`
- Blueprint-specific utilities go in the blueprint's `utils.py`
- Shared decorators go in `blueprints/decorators.py`
- Shared models go in `blueprints/models.py`

### Error Handling
- Each blueprint should define its own error handlers
- Global error handlers remain in app2.py
- Use consistent error response format

### State Management
- Blueprint-specific state should be contained within the blueprint
- Shared state should be managed through Flask app context
- Use proper scoping for MQTT clients and other resources
