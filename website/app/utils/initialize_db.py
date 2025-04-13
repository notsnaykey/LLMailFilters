import os
from app import db
from app.models import User, RegistrationToken
from flask import current_app

def initialize_database():
    """Initialize the database with initial data if needed."""
    print("Initializing database...")
    
    # Create all tables
    db.create_all()
    
    # Create first admin user if no users exist
    if User.query.count() == 0:
        print("No users found. Creating default admin user.")
        print("IMPORTANT: Please change the default admin password immediately after login.")
        admin_user = User(username='admin', is_admin=True)
        # Use a more secure default password, but still recommend changing it.
        default_admin_pass = os.getenv('DEFAULT_ADMIN_PASSWORD', 'changeme123')
        admin_user.set_password(default_admin_pass)
        db.session.add(admin_user)
        # Create a default token for the admin to register if needed
        first_token = RegistrationToken(uses_left=1)
        db.session.add(first_token)
        db.session.commit()
        print(f"Default admin user 'admin' created with password '{default_admin_pass}'.")
        print(f"A registration token has been created: {first_token.token}")
    else:
        print("Users found in database.")