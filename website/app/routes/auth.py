from flask import Blueprint, render_template, request, redirect, url_for, flash
from flask_login import login_user, logout_user, login_required, current_user
from app import db
from app.models import User, RegistrationToken
from app.forms import LoginForm, RegistrationForm, PasswordChangeForm

auth_bp = Blueprint('auth', __name__)

@auth_bp.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('main.index'))
    form = LoginForm()
    if form.validate_on_submit():
        user = User.query.filter_by(username=form.username.data).first()
        if user and user.check_password(form.password.data):
            login_user(user)
            flash('Logged in successfully.', 'success')
            next_page = request.args.get('next')
            return redirect(next_page) if next_page else redirect(url_for('main.index'))
        else:
            flash('Login Unsuccessful. Please check username and password', 'danger')
    return render_template('login.html', title='Login', form=form)

@auth_bp.route('/logout')
def logout():
    logout_user()
    flash('You have been logged out.', 'info')
    return redirect(url_for('auth.login'))

@auth_bp.route('/register', methods=['GET', 'POST'])
def register():
    if current_user.is_authenticated:
        return redirect(url_for('main.index'))
    form = RegistrationForm()
    if form.validate_on_submit():
        token_entry = RegistrationToken.query.filter_by(token=form.registration_token.data).first()
        # Double-check token validity (already done in form validator, but good practice)
        if not token_entry or token_entry.is_used or token_entry.uses_left <= 0:
            flash('Invalid or expired registration token.', 'danger')
            return render_template('register.html', title='Register', form=form)

        # Create new user
        user = User(username=form.username.data)
        user.set_password(form.password.data)
        # First user registered automatically becomes admin
        if User.query.count() == 0:
            user.is_admin = True
            flash('Admin account created successfully!', 'success')
        else:
             user.is_admin = False # Ensure non-first users are not admin by default

        # Update token usage
        token_entry.uses_left -= 1
        if token_entry.uses_left <= 0:
             token_entry.is_used = True # Mark as fully used if uses reach 0

        try:
            db.session.add(user)
            db.session.commit()
            flash(f'Account created for {form.username.data}! You can now log in.', 'success')
            return redirect(url_for('auth.login'))
        except Exception as e:
            db.session.rollback()
            flash(f'An error occurred during registration: {e}', 'danger')

    return render_template('register.html', title='Register', form=form)

@auth_bp.route('/change_password', methods=['GET', 'POST'])
@login_required
def change_password():
    form = PasswordChangeForm()
    if form.validate_on_submit():
        # Verify current password
        if current_user.check_password(form.current_password.data):
            # Set new password
            current_user.set_password(form.new_password.data)
            db.session.commit()
            flash('Your password has been updated!', 'success')
            return redirect(url_for('main.index')) # Or redirect to a profile page if you add one
        else:
            flash('Incorrect current password.', 'danger')
    return render_template('change_password.html', title='Change Password', form=form)