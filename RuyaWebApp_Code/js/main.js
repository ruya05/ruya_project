// ==================== MODAL EVENT HANDLERS ====================
/**
 * Alert acknowledgment button handler
 * Closes current alert modal and displays next queued alert if any
 * Note: Alert remains active in Firebase; only the modal is dismissed
 */
document.getElementById('acknowledge-alert-btn').addEventListener('click', () => {
    const modal = document.getElementById('alert-modal');
    const gasId = modal.dataset.gasId;
    const alertId = modal.dataset.alertId;

    console.log(`Alert acknowledged (modal hidden) - Alert remains active in Firebase: ${gasId}/${alertId}`);

    // Close modal
    modal.classList.add('hidden');
    isAlertModalVisible = false;

    // Display next queued alert after brief delay for smooth UX
    setTimeout(() => {
        displayNextAlert();
    }, 200);
});

// ==================== INITIALIZATION ====================
/**
 * Main application entry point
 * Initializes splash screen and authentication on page load
 */
document.addEventListener('DOMContentLoaded', () => {
    initializeThemeToggle();
    initializeSplashScreen();
    initializeAuth();
    initializeUserMenu();
});

/**
 * Mobile sidebar auto-close handler
 * Closes sidebar when user clicks outside of it on mobile devices
 */
document.addEventListener('click', (e) => {
    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebar-toggle');
    
    if (window.innerWidth < 768 && 
        !sidebar.contains(e.target) && 
        !sidebarToggle.contains(e.target) &&
        !sidebar.classList.contains('-translate-x-full')) {
        sidebar.classList.add('-translate-x-full');
    }
});

// ==================== USER MENU (HEADER DROPDOWN) ====================
function initializeUserMenu() {
    const menu = document.getElementById('user-menu');
    const button = document.getElementById('user-menu-button');
    const dropdown = document.getElementById('user-dropdown');
    if (!menu || !button || !dropdown) return;

    let isOpen = false;

    function openMenu() {
        dropdown.classList.remove('hidden');
        dropdown.classList.remove('opacity-0', '-translate-y-1');
        dropdown.classList.add('opacity-100', 'translate-y-0');
        isOpen = true;
    }

    function closeMenu() {
        dropdown.classList.add('hidden');
        dropdown.classList.remove('opacity-100', 'translate-y-0');
        dropdown.classList.add('opacity-0', '-translate-y-1');
        isOpen = false;
    }

    button.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isOpen) {
            closeMenu();
        } else {
            openMenu();
        }
    });

    document.addEventListener('click', (e) => {
        if (!menu.contains(e.target) && isOpen) {
            closeMenu();
        }
    });

    // Close on escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isOpen) {
            closeMenu();
        }
    });
}
