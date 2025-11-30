// ==================== AUTHENTICATION LOGIC ====================
function initializeAuth() {
    // Form switching
    document.getElementById('show-signup-btn').addEventListener('click', () => {
        document.getElementById('login-section').classList.add('hidden');
        document.getElementById('signup-section').classList.remove('hidden');
    });
    
    document.getElementById('show-login-btn').addEventListener('click', () => {
        document.getElementById('signup-section').classList.add('hidden');
        document.getElementById('login-section').classList.remove('hidden');
    });
    
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const forgotPasswordForm = document.getElementById('forgot-password-form');
    const loginError = document.getElementById('login-error');
    const signupError = document.getElementById('signup-error');
    const signupSuccess = document.getElementById('signup-success');
    const forgotError = document.getElementById('forgot-error');
    const forgotSuccess = document.getElementById('forgot-success');

    // Basic email format validation
    function validateEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }


    // Password validation functions
    function validatePassword(password) {
        const requirements = {
            length: password.length >= 8 && password.length <= 30,
            uppercase: /[A-Z]/.test(password),
            lowercase: /[a-z]/.test(password),
            number: /[0-9]/.test(password),
            special: /[!@#$%^&*(),.?":{}|<>]/.test(password)
        };
        return requirements;
    }

    function updatePasswordRequirements(password) {
        const requirements = validatePassword(password);
        const allMet = Object.values(requirements).every(req => req);
        
        // Update visual indicators
        Object.entries(requirements).forEach(([key, met]) => {
            const element = document.getElementById(`req-${key}`);
            if (met) {
                element.className = 'flex items-center text-green-400';
                element.querySelector('span').textContent = '✓';
            } else {
                element.className = 'flex items-center text-gray-400';
                element.querySelector('span').textContent = '○';
            }
        });

        // Enable/disable submit button
        const submitBtn = document.getElementById('signup-submit-btn');
        submitBtn.disabled = !allMet;
        
        return allMet;
    }

    // Password input event listener
    document.getElementById('signup-password').addEventListener('input', (e) => {
        updatePasswordRequirements(e.target.value);
    });

    // Show/hide password toggles
    document.getElementById('toggle-login-password').addEventListener('click', () => {
        const passwordInput = document.getElementById('login-password');
        const eyeOpen = document.getElementById('login-eye-open');
        const eyeClosed = document.getElementById('login-eye-closed');
        
        if (passwordInput.type === 'password') {
            passwordInput.type = 'text';
            eyeOpen.classList.add('hidden');
            eyeClosed.classList.remove('hidden');
        } else {
            passwordInput.type = 'password';
            eyeOpen.classList.remove('hidden');
            eyeClosed.classList.add('hidden');
        }
    });

    document.getElementById('toggle-signup-password').addEventListener('click', () => {
        const passwordInput = document.getElementById('signup-password');
        const eyeOpen = document.getElementById('signup-eye-open');
        const eyeClosed = document.getElementById('signup-eye-closed');
        
        if (passwordInput.type === 'password') {
            passwordInput.type = 'text';
            eyeOpen.classList.add('hidden');
            eyeClosed.classList.remove('hidden');
        } else {
            passwordInput.type = 'password';
            eyeOpen.classList.remove('hidden');
            eyeClosed.classList.add('hidden');
        }
    });

    // Removed legacy password requirements tooltip (no-op)

    // Forgot password modal handlers
    document.getElementById('forgot-password-btn').addEventListener('click', () => {
        document.getElementById('forgot-password-modal').classList.remove('hidden');
    });

    document.getElementById('close-forgot-modal').addEventListener('click', () => {
        document.getElementById('forgot-password-modal').classList.add('hidden');
        document.getElementById('forgot-password-form').reset();
        document.getElementById('forgot-error').classList.add('hidden');
        document.getElementById('forgot-success').classList.add('hidden');
    });
    
    /**
     * Verifies if an email address is authorized to access the system
     * Checks against Firebase whitelist database
     * @param {string} email - Email address to verify
     * @returns {Promise<boolean>} True if email is whitelisted
     */
    async function checkWhitelist(email) {
        try {
            const snapshot = await database.ref('whitelist').once('value');
            const whitelistData = snapshot.val() || {};
            const whitelistedEmails = Object.values(whitelistData);
            return whitelistedEmails.includes(email);
        } catch (error) {
            console.error('Error checking whitelist:', error);
            return false;
        }
    }

    // Utility: build a safe Action Code Settings with an authorized continue URL
    function buildActionCodeSettings() {
        // Always use an authorized Firebase domain to avoid invalid-continue-uri
        // Prefer the project's configured authDomain; fallback to the known project domain.
        let domain = '';
        try {
            if (typeof firebaseConfig !== 'undefined' && firebaseConfig.authDomain) {
                domain = firebaseConfig.authDomain;
            }
        } catch (_) {}
        if (!domain) {
            // Hardcode your project's auth domain as a safe fallback
            domain = 'ruya-11c11.firebaseapp.com';
        }
        return { url: `https://${domain}/index.html`, handleCodeInApp: false };
    }

    // Login form submission handler
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value.trim().toLowerCase();
        const password = document.getElementById('login-password').value;
        const rememberMe = document.getElementById('remember-me').checked;

        // Display loading spinner during authentication
        const submitBtn = document.getElementById('login-submit-btn');
        const btnText = document.getElementById('login-btn-text');
        const spinner = document.getElementById('login-spinner');
        
        submitBtn.disabled = true;
        btnText.textContent = 'Signing In...';
        spinner.classList.remove('hidden');

        try {
            // Validate email format first for clear, relevant feedback
            if (!validateEmail(email)) {
                showError(loginError, getAuthErrorMessage('auth/invalid-email'));
                document.getElementById('login-email').focus();
                return;
            }
            // Check whitelist first
            const isWhitelisted = await checkWhitelist(email);
            if (!isWhitelisted) {
                showError(loginError, 'Your email is not authorized to access this system.');
                document.getElementById('login-email').focus();
                return;
            }
            
            // Set persistence based on remember me checkbox
            if (rememberMe) {
                await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
            } else {
                await auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);
            }
            
            const userCredential = await auth.signInWithEmailAndPassword(email, password);
            const user = userCredential.user;

            if (!user.emailVerified) {
                // Show persistent message with only a resend action
                const container = loginError;
                container.classList.remove('hidden');
                container.innerHTML = `
                    <div class="flex flex-col space-y-2">
                        <div>Please verify your email before signing in.</div>
                        <div class="flex items-center space-x-2">
                            <button id="resend-verification-btn" class="bg-green-700 hover:bg-green-800 text-white px-3 py-1 rounded text-sm">Resend verification email</button>
                        </div>
                    </div>`;

                const resendBtn = document.getElementById('resend-verification-btn');
                resendBtn?.addEventListener('click', async () => {
                    try {
                        resendBtn.disabled = true;
                        resendBtn.textContent = 'Sending...';
                        const actionCodeSettings = buildActionCodeSettings();
                        await user.sendEmailVerification(actionCodeSettings);
                        container.innerHTML = '<div class="p-2 bg-green-900 border border-green-700 rounded text-green-300 text-sm">Verification email sent. Please check your inbox.</div>';
                    } catch (emailError) {
                        console.error('Resend verification failed:', emailError);
                        const msg = (emailError && emailError.code === 'auth/invalid-continue-uri')
                            ? 'Verification email could not be sent due to an invalid return URL. Please add this domain to Firebase Auth authorized domains or use the hosted domain.'
                            : 'Failed to send verification email. Please try again later.';
                        container.innerHTML = `<div class="p-2 bg-red-900 border border-red-700 rounded text-red-300 text-sm">${msg}</div>`;
                    }
                });

                // Keep user signed in (unverified) so resend can work
                return;
            }

            // Success - will be handled by auth state change listener
        } catch (error) {
            console.log('Login error code:', error.code);
            
            // Check if it's a user-not-found error and email is in whitelist
            if (error.code === 'auth/user-not-found') {
                const isWhitelisted = await checkWhitelist(email);
                if (isWhitelisted) {
                    showError(loginError, 'Account not created. Please sign up first.');
                } else {
                    showError(loginError, 'Your email is not authorized to access this system.');
                    document.getElementById('login-email').focus();
                }
            } else {
                showError(loginError, getAuthErrorMessage(error.code));
                if (error.code === 'auth/wrong-password') {
                    document.getElementById('login-password').focus();
                } else if (error.code === 'auth/invalid-email' || error.code === 'auth/user-not-found') {
                    document.getElementById('login-email').focus();
                }
            }
        } finally {
            // Reset loading state
            submitBtn.disabled = false;
            btnText.textContent = 'Sign In';
            spinner.classList.add('hidden');
        }
    });

    // Signup form handler
    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('signup-email').value.trim().toLowerCase();
        const password = document.getElementById('signup-password').value;
        
        // Show loading state
        const submitBtn = document.getElementById('signup-submit-btn');
        const btnText = document.getElementById('signup-btn-text');
        const spinner = document.getElementById('signup-spinner');
        
        submitBtn.disabled = true;
        btnText.textContent = 'Creating Account...';
        spinner.classList.remove('hidden');

        try {
            // Validate email format first
            if (!validateEmail(email)) {
                showError(signupError, getAuthErrorMessage('auth/invalid-email'));
                document.getElementById('signup-email').focus();
                return;
            }
            // Check whitelist first
            const isWhitelisted = await checkWhitelist(email);
            if (!isWhitelisted) {
                showError(signupError, 'Your email is not authorized to access this system.');
                document.getElementById('signup-email').focus();
                return;
            }
            
            // Validate password requirements
            const requirements = validatePassword(password);
            const allMet = Object.values(requirements).every(req => req);
            if (!allMet) {
                showError(signupError, 'Please ensure all password requirements are met.');
                return;
            }

            // Create user account
            const userCredential = await auth.createUserWithEmailAndPassword(email, password);
            const user = userCredential.user;

            // Send verification email
            try {
                // Configure action code settings with a safe, authorized continue URL
                const actionCodeSettings = buildActionCodeSettings();
                
                await user.sendEmailVerification(actionCodeSettings);
                console.log('Verification email sent successfully');
                showSuccess(signupSuccess, 'Account created! Please check your email for verification link.');
            } catch (emailError) {
                console.error('Error sending verification email:', emailError);
                const msg = (emailError && emailError.code === 'auth/invalid-continue-uri')
                    ? 'Account created, but verification email could not be sent because the return URL is not authorized. Please add this domain to Firebase Auth authorized domains or use your Firebase hosted domain.'
                    : 'Account created but verification email failed to send. Please try signing in to resend verification or contact support.';
                showSuccess(signupSuccess, msg);
            }
            
            signupForm.reset();
            updatePasswordRequirements(''); // Reset requirements display
        } catch (error) {
            showError(signupError, getAuthErrorMessage(error.code));
        } finally {
            // Reset loading state
            submitBtn.disabled = false;
            btnText.textContent = 'Sign Up';
            spinner.classList.add('hidden');
        }
    });

    // Forgot password form handler
    forgotPasswordForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('forgot-email').value.trim().toLowerCase();
        
        // Show loading state
        const submitBtn = document.getElementById('forgot-submit-btn');
        const btnText = document.getElementById('forgot-btn-text');
        const spinner = document.getElementById('forgot-spinner');
        
        submitBtn.disabled = true;
        btnText.textContent = 'Sending...';
        spinner.classList.remove('hidden');

        try {
            // Validate email format first
            if (!validateEmail(email)) {
                showError(forgotError, getAuthErrorMessage('auth/invalid-email'));
                document.getElementById('forgot-email').focus();
                return;
            }
            // Enforce whitelist for password resets as well
            const isWhitelisted = await checkWhitelist(email);
            if (!isWhitelisted) {
                showError(forgotError, 'Your email is not authorized to access this system.');
                document.getElementById('forgot-email').focus();
                return;
            }
            await auth.sendPasswordResetEmail(email);
            showSuccess(forgotSuccess, 'Password reset email sent! Check your inbox.');
            forgotPasswordForm.reset();
        } catch (error) {
            showError(forgotError, getAuthErrorMessage(error.code));
        } finally {
            // Reset loading state
            submitBtn.disabled = false;
            btnText.textContent = 'Send Reset Email';
            spinner.classList.add('hidden');
        }
    });

    // Auth state change listener
    auth.onAuthStateChanged((user) => {
        if (user && user.emailVerified) {
            currentUser = user;
            const headerNameEl = document.getElementById('user-email');
            if (headerNameEl) {
                const preferred = (user.displayName || '').trim() || user.email;
                headerNameEl.textContent = preferred;
            }
            // Only show dashboard if splash screen is already hidden
            if (document.getElementById('splash-screen').classList.contains('hidden')) {
                showDashboard();
            }
        } else {
            currentUser = null;
            // Only show auth page if splash screen is already hidden
            if (document.getElementById('splash-screen').classList.contains('hidden')) {
                showAuthPage();
            }
        }
    });

    // Logout handler (optimistic UI: switch immediately, sign out in background)
    document.getElementById('logout-btn').addEventListener('click', async () => {
        try {
            // Optimistic UI: hide dashboard, show auth instantly so it feels immediate
            try {
                // Ensure any skip-splash state doesn't keep auth page hidden
                try { document.documentElement.classList.remove('skip-splash'); } catch (_) {}
                const dropdown = document.getElementById('user-dropdown');
                if (dropdown) dropdown.classList.add('hidden');
                const emailEl = document.getElementById('user-email');
                if (emailEl) emailEl.textContent = '';
                const dash = document.getElementById('dashboard-page');
                const authPage = document.getElementById('auth-page');
                if (dash) dash.classList.add('hidden');
                if (authPage) authPage.classList.remove('hidden');
            } catch (_) {}

            if (console && console.time) console.time('signOut');
            await auth.signOut();
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            if (console && console.timeEnd) console.timeEnd('signOut');
        }
    });
}

