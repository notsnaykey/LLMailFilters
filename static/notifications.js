// --- Constants ---
const NOTIFICATION_CONTAINER_ID = 'notification-container';
const CONFIRMATION_MODAL_ID = 'confirmation-modal';
const CONFIRMATION_TITLE_ID = 'confirmation-title';
const CONFIRMATION_MESSAGE_ID = 'confirmation-message';
const CONFIRMATION_OK_BTN_ID = 'confirmation-ok-btn';
const CONFIRMATION_CANCEL_BTN_ID = 'confirmation-cancel-btn';

// --- DOM Elements ---
let notificationContainer = null;
let confirmationModal = null;
let confirmationTitle = null;
let confirmationMessage = null;
let confirmationOkBtn = null;
let confirmationCancelBtn = null;

// --- State for Confirmation ---
let confirmationResolve = null;

// --- Notification Function ---

/**
 * Displays a styled notification message.
 * @param {string} message - The message to display.
 * @param {string} [type='info'] - Notification type ('success', 'error', 'warning', 'info').
 * @param {number} [duration=3000] - Duration in milliseconds before auto-fading.
 */
function showNotification(message, type = 'info', duration = 3000) {
    if (!notificationContainer) {
        console.warn('Notification container not found. Cannot show notification.');
        alert(message); // Fallback to alert
        return;
    }

    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;

    notificationContainer.appendChild(notification);

    // Trigger animation (slide in)
    setTimeout(() => {
        notification.classList.add('show');
    }, 10); // Small delay to ensure transition works

    // Auto-remove after duration
    setTimeout(() => {
        notification.classList.remove('show');
        // Remove the element after the fade-out transition
        notification.addEventListener('transitionend', () => {
            if (notification.parentNode === notificationContainer) { // Check if still exists
                notificationContainer.removeChild(notification);
            }
        });
        // Failsafe remove if transition doesn't fire
        setTimeout(() => {
             if (notification.parentNode === notificationContainer) { 
                notificationContainer.removeChild(notification);
            }
        }, duration + 500); // Add buffer for fade out

    }, duration);
}

// --- Confirmation Modal Functions ---

/**
 * Shows the custom confirmation modal.
 * @param {string} message - The confirmation question.
 * @param {string} [title='Confirmation'] - The modal title.
 * @returns {Promise<boolean>} - Resolves true if OK is clicked, false otherwise.
 */
function showConfirmation(message, title = 'Confirmation') {
    return new Promise((resolve) => {
        if (!confirmationModal || !confirmationMessage || !confirmationTitle || !confirmationOkBtn || !confirmationCancelBtn) {
            console.warn('Confirmation modal elements not found. Falling back to native confirm.');
            resolve(confirm(message)); // Fallback to native confirm
            return;
        }

        confirmationTitle.textContent = title;
        confirmationMessage.textContent = message;
        confirmationModal.style.display = 'flex';

        // Store the promise resolve function
        confirmationResolve = resolve;

        // Remove previous listeners to avoid stacking
        confirmationOkBtn.replaceWith(confirmationOkBtn.cloneNode(true));
        confirmationCancelBtn.replaceWith(confirmationCancelBtn.cloneNode(true));

        // Re-select buttons after cloning
        confirmationOkBtn = document.getElementById(CONFIRMATION_OK_BTN_ID);
        confirmationCancelBtn = document.getElementById(CONFIRMATION_CANCEL_BTN_ID);

        // Add new listeners
        confirmationOkBtn.addEventListener('click', handleConfirmationOk);
        confirmationCancelBtn.addEventListener('click', handleConfirmationCancel);
    });
}

function handleConfirmationOk() {
    if (confirmationResolve) {
        confirmationResolve(true);
    }
    closeConfirmationModal();
}

function handleConfirmationCancel() {
    if (confirmationResolve) {
        confirmationResolve(false);
    }
    closeConfirmationModal();
}

function closeConfirmationModal() {
    if (confirmationModal) {
        confirmationModal.style.display = 'none';
    }
    confirmationResolve = null; // Clear resolver
}

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    notificationContainer = document.getElementById(NOTIFICATION_CONTAINER_ID);
    confirmationModal = document.getElementById(CONFIRMATION_MODAL_ID);
    confirmationTitle = document.getElementById(CONFIRMATION_TITLE_ID);
    confirmationMessage = document.getElementById(CONFIRMATION_MESSAGE_ID);
    confirmationOkBtn = document.getElementById(CONFIRMATION_OK_BTN_ID);
    confirmationCancelBtn = document.getElementById(CONFIRMATION_CANCEL_BTN_ID);

    // Optional: Close confirmation modal if overlay is clicked
    if (confirmationModal) {
        confirmationModal.addEventListener('click', (event) => {
            if (event.target === confirmationModal) {
                handleConfirmationCancel(); // Treat overlay click as cancel
            }
        });
    }
});

// --- Make functions globally available (or use modules) ---
// Simple approach: attach to window (use with caution in larger projects)
window.showNotification = showNotification;
window.showConfirmation = showConfirmation; 