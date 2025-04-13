from flask import Blueprint, render_template, redirect, url_for, flash
from flask_login import current_user, login_required
from functools import wraps
from app import db
from app.models import User, RegistrationToken
from app.forms import TokenGenerationForm

admin_bp = Blueprint('admin', __name__)

def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not current_user.is_authenticated or not current_user.is_admin:
            flash("Admin access required for this page.", "warning")
            return redirect(url_for('main.index'))
        return f(*args, **kwargs)
    return decorated_function

@admin_bp.route('/admin')
@login_required
@admin_required
def admin_dashboard():
    return render_template('admin/dashboard.html', title='Admin Dashboard')

@admin_bp.route('/admin/users')
@login_required
@admin_required
def admin_users():
    users = User.query.all()
    return render_template('admin/users.html', title='Manage Users', users=users)

@admin_bp.route('/admin/tokens')
@login_required
@admin_required
def admin_tokens():
    form = TokenGenerationForm()
    tokens = RegistrationToken.query.order_by(RegistrationToken.id.desc()).all()
    return render_template('admin/tokens.html', title='Manage Tokens', tokens=tokens, form=form)

@admin_bp.route('/admin/generate_token', methods=['POST'])
@login_required
@admin_required
def generate_token():
    form = TokenGenerationForm() # Process the submitted form
    if form.validate_on_submit():
        uses = form.uses.data
        if uses <= 0:
            flash('Number of uses must be positive.', 'warning')
        else:
            token = RegistrationToken(uses_left=uses)
            db.session.add(token)
            db.session.commit()
            flash(f'New registration token generated: {token.token}', 'success')
    else:
        flash('Invalid input for token generation.', 'error')
    return redirect(url_for('admin.admin_tokens'))

@admin_bp.route('/admin/delete_token/<int:token_id>', methods=['POST'])
@login_required
@admin_required
def delete_token(token_id):
     token = db.session.get(RegistrationToken, token_id)
     if token:
         db.session.delete(token)
         db.session.commit()
         flash(f'Token {token.token[:8]}... deleted.', 'success')
     else:
         flash('Token not found.', 'error')
     return redirect(url_for('admin.admin_tokens'))