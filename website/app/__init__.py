from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager
import os

# Initialize extensions
db = SQLAlchemy()
login_manager = LoginManager()
login_manager.login_view = 'auth.login'
login_manager.login_message_category = 'info'

def create_app(config_class=None):
    app = Flask(__name__)
    
    # Load config
    if config_class:
        app.config.from_object(config_class)
    else:
        # Load from environment if no config object passed
        app.config['SECRET_KEY'] = os.getenv('FLASK_SECRET_KEY')
        app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{os.getenv("DATABASE_FILE", "app.db")}'
        app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    
    # Initialize extensions with app
    db.init_app(app)
    login_manager.init_app(app)
    
    # Import models to ensure they're known to Flask-SQLAlchemy
    from app.models import User
    
    @login_manager.user_loader
    def load_user(user_id):
        return User.query.get(int(user_id))
    
    # Register blueprints
    from app.routes.main import main_bp
    from app.routes.auth import auth_bp
    from app.routes.admin import admin_bp
    
    app.register_blueprint(main_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(admin_bp)
    
    # Create database tables if they don't exist
    with app.app_context():
        db.create_all()
        
    return app