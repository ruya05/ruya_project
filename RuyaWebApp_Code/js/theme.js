// ==================== THEME TOGGLE LOGIC ====================
/**
 * Switches all logos between light and dark versions
 * @param {boolean} isLightMode - True for light mode, false for dark mode
 */
function updateLogos(isLightMode) {
    const logos = document.querySelectorAll('.logo-img[data-dark-logo][data-light-logo]');
    logos.forEach(logo => {
        const darkLogo = logo.getAttribute('data-dark-logo');
        const lightLogo = logo.getAttribute('data-light-logo');
        logo.src = isLightMode ? lightLogo : darkLogo;
    });
}

/**
 * Initializes theme toggle functionality and restores saved theme preference
 * Handles switching between dark and light modes with persistence
 */

function applySavedTheme() {
    const savedTheme = localStorage.getItem('theme');
    const isLight = savedTheme === 'light';
    if (isLight) {
        document.body.classList.add('light-mode');
        updateLogos(true);
        try { updateChartsForTheme('light'); } catch (_) {}
    } else {
        document.body.classList.remove('light-mode');
        updateLogos(false);
        try { updateChartsForTheme('dark'); } catch (_) {}
    }
}

function initializeThemeToggle() {
    const savedTheme = localStorage.getItem('theme');
    const themeToggle = document.getElementById('theme-toggle');
    if (!themeToggle) {
        // Even if no toggle exists on the page, still apply saved theme
        applySavedTheme();
        return;
    }
    if (themeToggle.dataset.initialized === 'true') return;
    const themeSlider = themeToggle.querySelector('.theme-toggle-slider');

    // Restore saved theme preference from localStorage
    if (savedTheme === 'light') {
        document.body.classList.add('light-mode');
        themeToggle.classList.add('active');
        themeSlider.textContent = '☀️';
        updateLogos(true);
    } else {
        if (!savedTheme) {
            localStorage.setItem('theme', 'dark');
        }
        document.body.classList.remove('light-mode');
        themeToggle.classList.remove('active');
        themeSlider.textContent = '🌙';
        updateLogos(false);
    }

    themeToggle.addEventListener('click', () => {
        document.body.classList.toggle('light-mode');
        themeToggle.classList.toggle('active');

        if (document.body.classList.contains('light-mode')) {
            themeSlider.textContent = '☀️';
            localStorage.setItem('theme', 'light');
            updateChartsForTheme('light');
            updateLogos(true);
        } else {
            themeSlider.textContent = '🌙';
            localStorage.setItem('theme', 'dark');
            updateChartsForTheme('dark');
            updateLogos(false);
        }
    });
    themeToggle.dataset.initialized = 'true';
}

/**
 * Updates all Chart.js instances to match the current theme
 * Adjusts colors for text, grid lines, and legends
 * @param {string} theme - Either 'dark' or 'light'
 */
function updateChartsForTheme(theme) {
    const isDark = theme === 'dark';
    const textColor = isDark ? '#66ff66' : '#2e7d32';
    const gridColor = isDark ? 'rgba(0, 255, 65, 0.1)' : 'rgba(46, 125, 50, 0.1)';

    Object.entries(charts).forEach(([key, chart]) => {
        if (chart && chart.options) {
            if (key.startsWith('gauge-')) {
                renderGasReadings();
            } else {
                if (chart.options.scales) {
                    if (chart.options.scales.x) {
                        chart.options.scales.x.ticks.color = textColor;
                        chart.options.scales.x.grid.color = gridColor;
                    }
                    if (chart.options.scales.y) {
                        chart.options.scales.y.ticks.color = textColor;
                        chart.options.scales.y.grid.color = gridColor;
                    }
                }
                if (chart.options.plugins && chart.options.plugins.legend) {
                    chart.options.plugins.legend.labels.color = textColor;
                }
                chart.update();
            }
        }
    });
}
