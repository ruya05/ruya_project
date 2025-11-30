// ==================== UTILITY FUNCTIONS ====================
/**
 * Updates the alert threshold for a gas sensor in Firebase
 * Validates input and provides user feedback
 * @param {string} gasId - Gas sensor identifier
 */
function updateThreshold(gasId) {
    const input = document.getElementById(`threshold-${gasId}`);
    const statusDiv = document.getElementById(`threshold-status-${gasId}`);
    const newThreshold = parseFloat(input.value);

    if (isNaN(newThreshold) || newThreshold < 1) {
        statusDiv.textContent = 'Please enter a valid threshold value.';
        statusDiv.className = 'mt-2 text-sm';
        statusDiv.style.color = 'var(--alert-red)';
        return;
    }

    // Update threshold in Firebase
    database.ref(`robots/spider-01/gasses/${gasId}/config/threshold`).set(newThreshold)
        .then(() => {
            statusDiv.textContent = 'Threshold updated successfully!';
            statusDiv.className = 'mt-2 text-sm text-green-400';
            
            setTimeout(() => {
                statusDiv.textContent = '';
            }, 3000);
        })

        .catch((error) => {
            console.error('Error updating threshold:', error);

            // Check if it's a Firebase "PERMISSION_DENIED" error
            if (error.code === 'PERMISSION_DENIED') {
                statusDiv.textContent = 'Only admins can update thresholds.';
            } else {
                statusDiv.textContent = 'Error updating threshold. Please try again.';
            }

            statusDiv.className = 'mt-2 text-sm';
            statusDiv.style.color = 'var(--alert-red)';
        });
}

/**
 * Updates the overview section with system status
 * Sets status to 'Alert' if any active alerts exist, otherwise 'Online'
 * Triggers re-render of alerts and thresholds sections
 */
function updateOverview() {
    // Check for any active alerts across all sensors
    let hasActiveAlerts = false;
    Object.values(gasData).forEach(gas => {
        if (gas.alerts) {
            const activeAlerts = Object.values(gas.alerts).filter(alert => alert.status === 'active');
            if (activeAlerts.length > 0) {
                hasActiveAlerts = true;
            }
        }
    });

    const statusElement = document.getElementById('system-status');
    if (hasActiveAlerts) {
        statusElement.textContent = 'Alert';
        statusElement.className = 'text-lg font-semibold';
        statusElement.style.color = 'var(--alert-red)';
    } else {
        statusElement.textContent = 'Online';
        statusElement.className = 'text-lg font-semibold text-green-400';
        statusElement.style.color = '';
    }

    // Re-render all sections
    renderAlerts();
    renderThresholds();
}

/**
 * Formats a timestamp into a human-readable string
 * @param {string|number} timestamp - ISO string or Unix timestamp
 * @param {boolean} short - If true, returns time only; otherwise full date and time
 * @returns {string} Formatted timestamp string
 */
function formatTimestamp(timestamp, short = false) {
    if (!timestamp) return '--';

    const date = new Date(timestamp);
    if (short) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleString();
}

// ==================== ALERT CONTROL UTILS ====================
function getAlertsEnabled() {
    const val = localStorage.getItem('alertsEnabled');
    if (val === null) return true; // default to enabled
    return val === 'true';
}

function setAlertsEnabled(enabled) {
    localStorage.setItem('alertsEnabled', enabled ? 'true' : 'false');
}

/**
 * Displays an error message in the specified element
 * Auto-hides after 5 seconds
 * @param {HTMLElement} element - DOM element to show message in
 * @param {string} message - Error message text
 */
function showError(element, message) {
    element.textContent = message;
    element.classList.remove('hidden');
    setTimeout(() => {
        element.classList.add('hidden');
    }, 5000);
}

/**
 * Displays a success message in the specified element
 * Auto-hides after 5 seconds
 * @param {HTMLElement} element - DOM element to show message in
 * @param {string} message - Success message text
 */
function showSuccess(element, message) {
    element.textContent = message;
    element.classList.remove('hidden');
    setTimeout(() => {
        element.classList.add('hidden');
    }, 5000);
}

/**
 * Converts Firebase authentication error codes to user-friendly messages
 * @param {string} errorCode - Firebase error code
 * @returns {string} Human-readable error message
 */
function getAuthErrorMessage(errorCode) {
    switch (errorCode) {
        case 'auth/invalid-email':
            return 'Please enter a valid email address.';
        case 'auth/email-already-in-use':
            return 'This email is already registered. Try signing in instead.';
        case 'auth/user-disabled':
            return 'This account has been disabled. Please contact support.';
        case 'auth/user-not-found':
            return 'No account found with this email.';
        case 'auth/wrong-password':
            return 'Incorrect password. Please try again.';
        case 'auth/invalid-credential':
        case 'auth/invalid-login-credentials':
            return 'Invalid login credentials. Please check your email and password.';
        case 'auth/network-request-failed':
            return 'Network error. Please check your connection.';
        case 'auth/too-many-requests':
            return 'Too many failed attempts. Please try again later or reset your password.';
        case 'auth/operation-not-allowed':
            return 'Email/password sign-in is not enabled. Contact admin.';
        case 'auth/account-exists-with-different-credential':
            return 'An account already exists with this email using a different sign-in method.';
        case 'auth/requires-recent-login':
            return 'Please sign out and sign in again to perform this action.';
        case 'auth/credential-already-in-use':
            return 'This credential is already associated with a different account.';
        case 'auth/internal-error':
            return 'An internal error occurred. Please try again.';
        default:
            return 'An unexpected error occurred. Please try again.';
    }
}

// ==================== TOAST NOTIFICATIONS ====================
let __toastTimeoutId = null;
function showToast(message, actionLabel = null, onAction = null, durationMs = 5000) {
    let toast = document.getElementById('toast');
    if (!toast) {
        // Create lazily if not present
        toast = document.createElement('div');
        toast.id = 'toast';
        toast.className = 'fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white px-4 py-3 rounded-lg border border-green-700 shadow-lg hidden z-50 flex items-center';
        toast.innerHTML = '<span id="toast-message" class="mr-4"></span><button id="toast-action" class="text-green-400 underline hidden"></button>';
        document.body.appendChild(toast);
    }

    const msgEl = document.getElementById('toast-message');
    const actionBtn = document.getElementById('toast-action');
    msgEl.textContent = message;

    if (actionLabel && typeof onAction === 'function') {
        actionBtn.textContent = actionLabel;
        actionBtn.classList.remove('hidden');
        actionBtn.onclick = () => {
            try { onAction(); } catch (_) {}
            hideToast();
        };
    } else {
        actionBtn.classList.add('hidden');
        actionBtn.onclick = null;
    }

    toast.classList.remove('hidden');

    if (__toastTimeoutId) {
        clearTimeout(__toastTimeoutId);
        __toastTimeoutId = null;
    }
    __toastTimeoutId = setTimeout(() => hideToast(), durationMs);
}

function hideToast() {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.classList.add('hidden');
}

// ==================== LOCATION HELPERS ====================
/**
 * Returns a concise, human-friendly location label.
 * If `loc` is an object with {lat,lng}, uses shared reverse-geocode cache when available,
 * otherwise falls back to fixes as "lat, lng". If `loc` is already a string, returns it.
 * @param {any} loc
 * @returns {string}
 */
function formatLocationPlain(loc) {
    if (!loc) return 'Unknown';
    if (typeof loc === 'string') return loc;
    if (typeof loc === 'object' && typeof loc.lat === 'number' && typeof loc.lng === 'number') {
        const lat = Number(loc.lat);
        const lng = Number(loc.lng);
        try {
            if (window.ruyaGeo && typeof window.ruyaGeo.getCachedPlaceName === 'function') {
                const cached = window.ruyaGeo.getCachedPlaceName(lat, lng);
                if (cached) return cached;
                if (typeof window.ruyaGeo.ensureGeocode === 'function') {
                    window.ruyaGeo.ensureGeocode(lat, lng);
                }
            }
        } catch (_) {}
        return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    }
    return 'Unknown';
}

function showAuthPage() {
    try { document.documentElement.classList.remove('skip-splash'); sessionStorage.removeItem('skipSplash'); } catch (_) {}
    document.getElementById('splash-screen').classList.add('hidden');
    document.getElementById('auth-page').classList.remove('hidden');
    document.getElementById('dashboard-page').classList.add('hidden');
}

function showDashboard() {
    try { document.documentElement.classList.remove('skip-splash'); sessionStorage.removeItem('skipSplash'); } catch (_) {}
    document.getElementById('splash-screen').classList.add('hidden');
    document.getElementById('auth-page').classList.add('hidden');
    document.getElementById('dashboard-page').classList.remove('hidden');

    // Initialize dashboard if not already done
    if (!document.getElementById('dashboard-page').dataset.initialized) {
        initializeDashboard();
        document.getElementById('dashboard-page').dataset.initialized = 'true';
    }
}
