// ==================== DASHBOARD LOGIC ====================
function initializeDashboard() {
    // Dynamically set header heights for accurate offsets
    const setHeaderHeights = () => {
        const header = document.querySelector('header');
        if (!header) return;
        const px = header.offsetHeight + 2; // minimal buffer to avoid clipping without large gap
        document.documentElement.style.setProperty('--mobile-header-height', px + 'px');
        document.documentElement.style.setProperty('--desktop-header-height', px + 'px');
    };

    setHeaderHeights();
    window.addEventListener('resize', setHeaderHeights);
    window.addEventListener('load', setHeaderHeights);
    setTimeout(setHeaderHeights, 250);
    // Sidebar toggle for mobile
    document.getElementById('sidebar-toggle').addEventListener('click', () => {
        const sidebar = document.getElementById('sidebar');
        sidebar.classList.toggle('-translate-x-full');
        setHeaderHeights();
    });

    // Navigation links
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = link.getAttribute('href').substring(1);
            document.getElementById(targetId).scrollIntoView({ behavior: 'smooth', block: 'start' });

            // Update active state
            document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
            link.classList.add('active');

            // Close sidebar on mobile
            if (window.innerWidth < 768) {
                document.getElementById('sidebar').classList.add('-translate-x-full');
            }
        });
    });

    // Set initial active nav link based on scroll position
    const updateActiveNavLink = () => {
        const sections = ['overview', 'readings', 'live-location', 'gas-visualization', 'charts', 'alerts', 'thresholds', 'reports'];
        const scrollPosition = window.scrollY + 100;

        for (const sectionId of sections) {
            const section = document.getElementById(sectionId);
            if (section) {
                const sectionTop = section.offsetTop;
                const sectionBottom = sectionTop + section.offsetHeight;

                if (scrollPosition >= sectionTop && scrollPosition < sectionBottom) {
                    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
                    const activeLink = document.querySelector(`.nav-link[href="#${sectionId}"]`);
                    if (activeLink) activeLink.classList.add('active');
                    break;
                }
            }
        }
    };

    // Update active link on scroll
    window.addEventListener('scroll', updateActiveNavLink);

    // Set initial active link
    setTimeout(updateActiveNavLink, 500);

    // Initialize gas monitoring
    initializeGasMonitoring();
    
    // Initialize PDF report generation
    initializePDFReports();
    
    // Initialize interactive gas visualization
    initializeGasVisualization();
}

