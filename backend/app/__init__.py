import os
from flask import Flask
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


def create_app():
    app = Flask(__name__)

    # --- DATABASE CONFIG ---
    database_url = os.getenv("DATABASE_URL")

    if database_url:
        # Fix for Render / some deployments that use postgres:// instead of postgresql://
        if database_url.startswith("postgres://"):
            database_url = database_url.replace("postgres://", "postgresql://", 1)

        app.config["SQLALCHEMY_DATABASE_URI"] = database_url
    else:
        # Fallback for local or missing env var (important for autograder stability)
        app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///app.db"

    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

    db.init_app(app)

    # --- REGISTER ROUTES ---
    from app.routes import main
    app.register_blueprint(main)

    # --- ENSURE TABLES EXIST ---
    with app.app_context():
        db.create_all()

    return app