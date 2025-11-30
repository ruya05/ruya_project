// ==================== SPLASH SCREEN LOGIC ====================
/**
 * Displays animated splash screen with tech grid background
 * Shows for 4 seconds before checking authentication state
 */
function initializeSplashScreen() {
    initializeTechGrid();

    // Display splash screen for 4 seconds before proceeding
    setTimeout(() => {
        document.getElementById('splash-screen').classList.add('hidden');
        // Check auth state after splash is done
        if (currentUser && currentUser.emailVerified) {
            showDashboard();
        } else {
            document.getElementById('auth-page').classList.remove('hidden');
        }
    }, 4000);
}

// ==================== TECH GRID ANIMATION ====================
function initializeTechGrid() {
    const canvas = document.getElementById('tech-grid-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let animationId;

    // Set canvas size
    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Network nodes
    const nodes = [];
    const nodeCount = 50;
    const maxDistance = 150;

    // Create nodes
    for (let i = 0; i < nodeCount; i++) {
        nodes.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            vx: (Math.random() - 0.5) * 0.5,
            vy: (Math.random() - 0.5) * 0.5,
            radius: Math.random() * 2 + 1,
            pulse: Math.random() * Math.PI * 2
        });
    }

    // Animation loop
    function animate() {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Update and draw nodes
        nodes.forEach((node, i) => {
            // Update position
            node.x += node.vx;
            node.y += node.vy;

            // Bounce off edges
            if (node.x < 0 || node.x > canvas.width) node.vx *= -1;
            if (node.y < 0 || node.y > canvas.height) node.vy *= -1;

            // Pulse effect
            node.pulse += 0.02;
            const pulseAlpha = Math.sin(node.pulse) * 0.3 + 0.5;

            // Draw node
            ctx.beginPath();
            ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(34, 197, 94, ${pulseAlpha})`;
            ctx.fill();

            // Draw glow
            const gradient = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, node.radius * 3);
            gradient.addColorStop(0, `rgba(34, 197, 94, ${pulseAlpha * 0.3})`);
            gradient.addColorStop(1, 'rgba(34, 197, 94, 0)');
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(node.x, node.y, node.radius * 3, 0, Math.PI * 2);
            ctx.fill();

            // Draw connections
            nodes.forEach((otherNode, j) => {
                if (i >= j) return;

                const dx = node.x - otherNode.x;
                const dy = node.y - otherNode.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance < maxDistance) {
                    const alpha = (1 - distance / maxDistance) * 0.3;
                    ctx.beginPath();
                    ctx.strokeStyle = `rgba(34, 197, 94, ${alpha})`;
                    ctx.lineWidth = 0.5;
                    ctx.moveTo(node.x, node.y);
                    ctx.lineTo(otherNode.x, otherNode.y);
                    ctx.stroke();

                    // Particle flow along line
                    if (Math.random() > 0.98) {
                        const t = Math.random();
                        const px = node.x + (otherNode.x - node.x) * t;
                        const py = node.y + (otherNode.y - node.y) * t;

                        ctx.beginPath();
                        ctx.arc(px, py, 1.5, 0, Math.PI * 2);
                        ctx.fillStyle = `rgba(34, 197, 94, ${alpha * 2})`;
                        ctx.fill();
                    }
                }
            });
        });

        animationId = requestAnimationFrame(animate);
    }

    animate();

    // Clean up when splash screen is hidden
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.target.classList.contains('hidden')) {
                cancelAnimationFrame(animationId);
                observer.disconnect();
            }
        });
    });

    observer.observe(document.getElementById('splash-screen'), {
        attributes: true,
        attributeFilter: ['class']
    });
}

