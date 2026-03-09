"""
__init__.py — Flask application factory.

Usage:
    export FLASK_APP=app
    flask run

Or via create_app() directly in tests.
"""

import os
from flask import Flask
from flask_cors import CORS
from .db import init_db
from .routes import api
from .test_routes import test_api


def create_app(test_config=None):
    """
    Application factory. Reads configuration from environment variables.

    Required env vars:
        DATABASE_URL   — PostgreSQL DSN (e.g. postgresql://user:pass@host/dbname)

    Optional env vars:
        TEST_MODE      — "true" to enable /api/test/* endpoints (default: "false")
        FLASK_DEBUG    — "1" or "true" for debug mode
    """
    app = Flask(__name__, instance_relative_config=False)
    CORS(app, resources={
        r"/api/*":{
            "origins": "*",
            "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
            "allow_headers": ["Content-Type", "X-Test-Password"],
        }
    })

    # Allow override for unit tests
    if test_config:
        app.config.update(test_config)

    # Register blueprints
    app.register_blueprint(api)
    app.register_blueprint(test_api)

    # Manual CORS fallback for proxies that strip headers
    def add_cors_headers(response):
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, X-Test-Password"
        return response
    # Initialize DB schema on startup (idempotent)
    with app.app_context():
        try:
            init_db()
        except Exception as exc:
            app.logger.warning(f"DB init skipped or failed: {exc}")

    return app


# Expose app at module level for `flask run` and Gunicorn
app = create_app()
