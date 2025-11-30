// ==================== GAS MONITORING LOGIC ====================
// Live Location (Google Maps iframe) helpers
let liveMapIframe;
const geocodeCache = new Map();
const pendingGeocode = new Set();
let lastGeocodeKey = '';
let lastGeocodeAt = 0; // ms
let chartViewMode = 'combined';
let combinedChart = null;
let combinedTimeRange = 'all';
function destroyCombinedChart() {
    if (combinedChart) {
        combinedChart.destroy();
        delete charts['combined-chart'];
        combinedChart = null;
    }
}
const chartPalette = [
    { border: '#00ff41', fill: 'rgba(0, 255, 65, 0.12)' },
    { border: '#22d3ee', fill: 'rgba(34, 211, 238, 0.12)' },
    { border: '#a855f7', fill: 'rgba(168, 85, 247, 0.12)' },
    { border: '#f97316', fill: 'rgba(249, 115, 22, 0.12)' },
    { border: '#38bdf8', fill: 'rgba(56, 189, 248, 0.12)' },
    { border: '#f43f5e', fill: 'rgba(244, 63, 94, 0.12)' },
    { border: '#84cc16', fill: 'rgba(132, 204, 22, 0.12)' }
];

function initializeLiveLocationCard() {
    const mapEl = document.getElementById('live-map');
    if (!mapEl) return;
    if (!document.getElementById('live-map-iframe')) {
        const defaultLat = 25.2048, defaultLng = 55.2708;
        mapEl.innerHTML = `<iframe id="live-map-iframe" width="100%" height="100%" style="border:0;" loading="lazy" allowfullscreen
            src="https://www.google.com/maps?q=${defaultLat},${defaultLng}&hl=en&z=15&output=embed"></iframe>`;
    }
    liveMapIframe = document.getElementById('live-map-iframe');
}

function updateLiveLocationUI(loc) {
    const statusEl = document.getElementById('live-location-status');
    if (!statusEl) return;

    const hasCoords = loc && typeof loc === 'object' && typeof loc.lat === 'number' && typeof loc.lng === 'number';
    const status = loc?.status || 'No GPS signal available';
    const ts = loc?.timestamp;

    if (hasCoords) {
        if (!liveMapIframe) initializeLiveLocationCard();
        const iframe = liveMapIframe || document.getElementById('live-map-iframe');
        if (iframe) {
            const src = `https://www.google.com/maps?q=${loc.lat},${loc.lng}&hl=en&z=16&output=embed`;
            if (iframe.getAttribute('src') !== src) iframe.setAttribute('src', src);
        }
    }

    let html = '';
    if (status === 'Live' && hasCoords) {
        html = `<span class="text-green-300">Live – Updated at ${ts ? formatTimestamp(ts) : '--'} (UAE Time)</span>`;
    } else if (status === 'Last known location' && hasCoords) {
        html = `<span class="text-gray-400">Last known location – ${ts ? formatTimestamp(ts) : '--'}</span>`;
    } else {
        html = `<span style="color: var(--alert-red)">No GPS signal available</span>`;
    }
    // No lat/lng or map link under the map per request
    statusEl.innerHTML = html;

    // Update reverse-geocoded place name under the map
    try { updateLivePlaceName(loc); } catch(_) {}
}

function buildLocationHtml(loc) {
    // Gas cards: clickable fixes + tiny status line, right-aligned, no timestamps
    const hasCoords = loc && typeof loc === 'object' && typeof loc.lat === 'number' && typeof loc.lng === 'number';
    let linkHtml = '<span class="text-gray-400">Unknown</span>';
    if (hasCoords) {
        const lat = Number(loc.lat).toFixed(6);
        const lng = Number(loc.lng).toFixed(6);
        const url = `https://www.google.com/maps?q=${lat},${lng}`;
        // Try cached place; if missing, trigger background reverse geocode and refresh
        const cached = getCachedPlaceName(lat, lng);
        if (!cached) { try { ensureGeocode(Number(lat), Number(lng)); } catch (_) {} }
        const label = cached || `${lat}, ${lng}`;
        linkHtml = `<a href="${url}" target="_blank" class="text-green-400 hover:text-green-300 underline">${label}</a>`;
    }

    const rawStatus = (loc && loc.status) ? loc.status : 'No GPS signal available';
    let statusClass = 'text-gray-400';
    let statusText = rawStatus;
    if (rawStatus === 'Live') {
        statusClass = 'text-green-300';
        statusText = 'Live';
    } else if (rawStatus === 'Last known location') {
        statusClass = 'text-gray-400';
        statusText = 'Last known';
    } else if (rawStatus.toLowerCase().includes('no gps')) {
        statusClass = '';
        statusText = 'No GPS signal available';
    }

    const colored = statusClass
        ? `<span class="${statusClass}">${statusText}</span>`
        : `<span style="color: var(--alert-red)">${statusText}</span>`;

    // Right-align both the link and status for a tidy layout
    return `<span class="block text-right">${linkHtml}<span class="block mt-1 text-xs">${colored}</span></span>`;
}

async function updateLivePlaceName(loc) {
    const placeEl = document.getElementById('live-location-place');
    if (!placeEl) return;

    const hasCoords = loc && typeof loc === 'object' && typeof loc.lat === 'number' && typeof loc.lng === 'number';
    if (!hasCoords) {
        placeEl.textContent = '';
        return;
    }

    const lat = Number(loc.lat);
    const lng = Number(loc.lng);
    const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;

    // Cached place name
    if (geocodeCache.has(key)) {
        placeEl.textContent = geocodeCache.get(key);
        return;
    }

    // Throttle: max one request every 3s and only when key changes
    const now = Date.now();
    if (key === lastGeocodeKey && (now - lastGeocodeAt) < 3000) return;
    lastGeocodeKey = key;
    lastGeocodeAt = now;

    // Show fixes while resolving
    placeEl.innerHTML = `<span class="text-gray-400">Resolving address… (${lat.toFixed(6)}, ${lng.toFixed(6)})</span>`;

    try {
        const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=14&addressdetails=1&accept-language=en`;
        const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
        if (!res.ok) throw new Error('Geocoding failed');
        const data = await res.json();
        const place = formatPlaceName(data);
        const display = place || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        geocodeCache.set(key, display);
        placeEl.textContent = display;
    } catch (e) {
        // Fallback to fixes if geocoding unavailable
        placeEl.textContent = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    }
}

function formatPlaceName(nominatimJson) {
    if (!nominatimJson) return '';
    // Prefer a concise combination from address fields
    const a = nominatimJson.address || {};
    const parts = [];
    const locality = a.neighbourhood || a.suburb || a.district || a.quarter || a.village || a.town || a.city;
    if (locality) parts.push(locality);
    if (a.state_district && (!a.city && !a.town)) parts.push(a.state_district);
    if (a.city && a.city !== locality) parts.push(a.city);
    if (a.town && a.town !== locality) parts.push(a.town);
    if (a.state && a.state !== a.city && a.state !== a.town) parts.push(a.state);
    if (a.country_code) parts.push((a.country_code || '').toUpperCase());
    const compact = parts.filter(Boolean).join(', ');
    return compact || nominatimJson.display_name || '';
}

function getGeocodeKey(lat, lng) {
    return `${Number(lat).toFixed(5)},${Number(lng).toFixed(5)}`;
}

function getCachedPlaceName(lat, lng) {
    const key = getGeocodeKey(lat, lng);
    return geocodeCache.get(key) || null;
}

async function ensureGeocode(lat, lng) {
    const key = getGeocodeKey(lat, lng);
    if (geocodeCache.has(key) || pendingGeocode.has(key)) return;
    pendingGeocode.add(key);
    try {
        const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=14&addressdetails=1&accept-language=en`;
        const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
        if (!res.ok) throw new Error('Geocoding failed');
        const data = await res.json();
        const place = formatPlaceName(data);
        geocodeCache.set(key, place || `${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}`);
    } catch (_) {
        geocodeCache.set(key, `${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}`);
    } finally {
        pendingGeocode.delete(key);
        refreshGasLocationDisplays();
    }
}

function refreshGasLocationDisplays() {
    try {
        Object.entries(gasData || {}).forEach(([gasId, gas]) => {
            const card = document.querySelector(`[data-gas-id="${gasId}"]`);
            if (!card) return;
            const el = card.querySelector('[data-location]');
            if (!el) return;
            el.innerHTML = buildLocationHtml(gas.latest_reading?.location);
        });
    } catch (_) {}
}

// Expose geocoding helpers to other modules (alerts, reports)
try {
    window.ruyaGeo = {
        getCachedPlaceName,
        ensureGeocode
    };
} catch (_) {}
/**
 * Sets up real-time listeners for gas sensor data from Firebase
 * Monitors gas readings, alerts, and configuration changes
 * Updates UI whenever data changes in the database
 */
function initializeGasMonitoring() {
    // Real-time listener for gas sensor data updates
    database.ref('robots/spider-01/gasses').on('value', (snapshot) => {
        const gases = snapshot.val() || {};
        updateGasData(gases);
        renderGasReadings();
        renderCharts();
        updateOverview();
    });

    // Listen for new alerts
    database.ref('robots/spider-01/gasses').once('value').then(snapshot => {
        snapshot.forEach(gasSnap => {
            const gasId = gasSnap.key;

            // Listen for NEW alerts being added in real-time
            database.ref(`robots/spider-01/gasses/${gasId}/alerts`).on('child_added', alertSnapshot => {
                const alert = alertSnapshot.val();

                // Distinguish between page load alerts and newly triggered alerts
                if (alert && alert.status === 'active') {
                    if (alertsInitialized[gasId]) {
                        // Alert triggered after initialization - show modal popup
                        handleNewAlert(gasId, alert, true);
                    } else {
                        // Alert from page load - update UI silently
                        renderAlerts();
                    }
                }
            });

            // Listen for existing alerts being changed
            database.ref(`robots/spider-01/gasses/${gasId}/alerts`).on('child_changed', alertSnapshot => {
                const alert = alertSnapshot.val();
                if (alert && alert.status === 'active') {
                    // Changed to active - show modal
                    handleNewAlert(gasId, alert, true);
                } else {
                    // Just update the UI without modal
                    renderAlerts();
                }
            });

            // Mark this gas as initialized after loading existing alerts
            database.ref(`robots/spider-01/gasses/${gasId}/alerts`).once('value').then(() => {
                alertsInitialized[gasId] = true;
            });
        });
    });

    // Live Location card: subscribe to gas-1 latest location
    setTimeout(() => {
        try { initializeLiveLocationCard(); } catch (_) {}
        const locRef = database.ref('robots/spider-01/gasses/gas-1/latest_reading/location');
        locRef.on('value', (snap) => {
            updateLiveLocationUI(snap.val());
        });
    }, 300);
}

/**
 * Updates local gas data cache with new Firebase data
 * Preserves UI state (hidden alerts) during updates
 * @param {Object} gases - Gas sensor data from Firebase
 */
function updateGasData(gases) {
    // Save current state before updating
    const oldGasData = gasData;

    // Replace with new Firebase data
    gasData = gases;

    // Maintain user's hidden alert preferences across updates
    if (oldGasData) {
        Object.entries(oldGasData).forEach(([gasId, oldGas]) => {
            if (oldGas.alerts && gasData[gasId] && gasData[gasId].alerts) {
                Object.entries(oldGas.alerts).forEach(([alertId, oldAlert]) => {
                    if (oldAlert.hiddenInUI && gasData[gasId].alerts[alertId]) {
                        gasData[gasId].alerts[alertId].hiddenInUI = true;
                    }
                });
            }
        });
    }

    // Update active gases count
    document.getElementById('active-gases-count').textContent = Object.keys(gases).length;

    // Count active alerts
    let activeAlerts = 0;
    Object.values(gases).forEach(gas => {
        if (gas.alerts) {
            activeAlerts += Object.values(gas.alerts).filter(alert => alert.status === 'active').length;
        }
    });
    document.getElementById('active-alerts-count').textContent = activeAlerts;
}

/**
 * Renders gas sensor readings with gauge visualizations
 * Only rebuilds DOM if sensors are added/removed for performance
 * Updates existing gauges with new values when possible
 */
function renderGasReadings() {
    const container = document.getElementById('gas-readings-container');

    // Detect if sensors changed (optimization to avoid full rebuild)
    const existingGasIds = new Set();
    container.querySelectorAll('[data-gas-id]').forEach(el => {
        existingGasIds.add(el.dataset.gasId);
    });

    const currentGasIds = new Set(Object.keys(gasData));
    const needsRebuild = existingGasIds.size !== currentGasIds.size ||
                         ![...existingGasIds].every(id => currentGasIds.has(id));

    if (needsRebuild) {
        // Full rebuild needed
        Object.keys(charts).forEach(key => {
            if (key.startsWith('gauge-')) {
                if (charts[key]) {
                    if (charts[key].animationFrame) {
                        cancelAnimationFrame(charts[key].animationFrame);
                    }
                    charts[key].destroy();
                    delete charts[key];
                }
            }
        });

        container.innerHTML = '';

        Object.entries(gasData).forEach(([gasId, gas]) => {
            const card = createGasReadingCard(gasId, gas);
            container.appendChild(card);
        });
    } else {
        // Just update existing gauges
        Object.entries(gasData).forEach(([gasId, gas]) => {
            updateGasReadingCard(gasId, gas);
        });
    }
}

function updateGasReadingCard(gasId, gas) {
    const card = document.querySelector(`[data-gas-id="${gasId}"]`);
    if (!card) return;

    const gasName = gas.config?.gas_name || gasId;
    const latestReading = gas.latest_reading;
    const threshold = gas.config?.threshold || 50;

    let statusColor = 'text-green-400';
    let statusText = 'Safe';
    let indicatorColor = 'bg-green-500';
    let indicatorClass = '';
    let percentage = 0;

    if (latestReading) {
        percentage = (latestReading.value_ppm / threshold) * 100;
        if (percentage >= 100) {
            statusColor = '';
            statusText = 'Danger';
            indicatorColor = '';
            indicatorClass = 'pulse-red';
        } else if (percentage >= 60) {
            statusColor = 'text-yellow-400';
            statusText = 'Warning';
            indicatorColor = 'bg-yellow-500';
        }
    }

    // Update text values
    card.querySelector('[data-current-level]').textContent = latestReading ? latestReading.value_ppm.toFixed(1) : '--';
    card.querySelector('[data-threshold]').textContent = threshold;

    const statusElement = card.querySelector('[data-status]');
    statusElement.className = `${statusColor} font-semibold`;
    if (!statusColor) {
        statusElement.style.color = 'var(--alert-red)';
    } else {
        statusElement.style.color = '';
    }
    statusElement.textContent = statusText;

    const locationEl = card.querySelector('[data-location]');
    if (locationEl) {
        locationEl.innerHTML = buildLocationHtml(latestReading?.location);
    }
    card.querySelector('[data-last-update]').textContent = latestReading ? formatTimestamp(latestReading.timestamp) : '--';

    // Update indicator
    const indicator = card.querySelector('[data-indicator]');
    indicator.className = `w-4 h-4 rounded-full ${indicatorColor} ${indicatorClass}`;
    if (indicatorClass) {
        indicator.style.backgroundColor = 'var(--alert-red)';
    } else {
        indicator.style.backgroundColor = '';
    }

    // Update gauge chart
    updateGaugeChart(`gauge-${gasId}`, latestReading ? latestReading.value_ppm : 0, threshold);
}

function createGasReadingCard(gasId, gas) {
    const card = document.createElement('div');
    card.className = 'bg-gray-900 bg-opacity-80 p-6 rounded-xl border border-green-800';
    card.setAttribute('data-gas-id', gasId);

    const gasName = gas.config?.gas_name || gasId;
    const latestReading = gas.latest_reading;
    const threshold = gas.config?.threshold || 50;

    let statusColor = 'text-green-400';
    let statusText = 'Safe';
    let indicatorColor = 'bg-green-500';
    let indicatorClass = '';
    let percentage = 0;

    if (latestReading) {
        percentage = (latestReading.value_ppm / threshold) * 100;
        if (percentage >= 100) {
            statusColor = '';
            statusText = 'Danger';
            indicatorColor = '';
            indicatorClass = 'pulse-red';
        } else if (percentage >= 60) {
            statusColor = 'text-yellow-400';
            statusText = 'Warning';
            indicatorColor = 'bg-yellow-500';
        }
    }

    const gaugeCanvasId = `gauge-${gasId}`;

    const locationHtml = buildLocationHtml(latestReading?.location);

    card.innerHTML = `
        <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-semibold text-green-300">${gasName}</h3>
            <div data-indicator class="w-4 h-4 rounded-full ${indicatorColor} ${indicatorClass}" ${indicatorClass ? 'style="background-color: var(--alert-red);"' : ''}></div>
        </div>
        <div class="space-y-2">
            <div class="flex justify-between">
                <span class="text-gray-400">Current Level:</span>
                <span class="text-white font-semibold"><span data-current-level>${latestReading ? latestReading.value_ppm.toFixed(1) : '--'}</span> ppm</span>
            </div>
            <div class="flex justify-between">
                <span class="text-gray-400">Threshold:</span>
                <span class="text-white"><span data-threshold>${threshold}</span> ppm</span>
            </div>
            <div class="flex justify-between">
                <span class="text-gray-400">Status:</span>
                <span data-status class="${statusColor} font-semibold" ${!statusColor ? 'style="color: var(--alert-red);"' : ''}>${statusText}</span>
            </div>
            <div class="flex justify-between">
                <span class="text-gray-400">Location:</span>
                <span data-location class="text-white text-sm">${locationHtml}</span>
            </div>
            <div class="flex justify-between">
                <span class="text-gray-400">Last Update:</span>
                <span data-last-update class="text-white text-sm">${latestReading ? formatTimestamp(latestReading.timestamp) : '--'}</span>
            </div>
        </div>
        <div class="mt-4 pt-4 border-t border-green-800">
            <div class="flex justify-center items-center" style="height: 160px;">
                <canvas id="${gaugeCanvasId}" width="200" height="160"></canvas>
            </div>
            <div class="gauge-legend">
                <div class="flex items-center gap-1">
                    <div class="w-3 h-3 rounded-full" style="background: #00ff41;"></div>
                    <span class="text-gray-400">Safe (&lt;60%)</span>
                </div>
                <div class="flex items-center gap-1">
                    <div class="w-3 h-3 rounded-full" style="background: #ffaa00;"></div>
                    <span class="text-gray-400">Caution (60-99%)</span>
                </div>
                <div class="flex items-center gap-1">
                    <div class="w-3 h-3 rounded-full" style="background: #ef4444;"></div>
                    <span class="text-gray-400">Alert (≥100%)</span>
                </div>
            </div>
        </div>
    `;

    setTimeout(() => {
        createGaugeChart(gaugeCanvasId, latestReading ? latestReading.value_ppm : 0, threshold);
    }, 100);

    return card;
}

function createGaugeChart(canvasId, currentValue, threshold) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    const safeZone = 60;
    const cautionZone = 40;
    const alertZone = 50;

    const data = {
        datasets: [{
            data: [safeZone, cautionZone, alertZone],
            backgroundColor: ['#00ff41', '#ffaa00', '#ef4444'],
            borderWidth: 0,
            circumference: 180,
            rotation: 270,
        }]
    };

    const gaugeNeedlePlugin = {
        id: 'gaugeNeedlePlugin',
        afterDatasetsDraw(chart, args, options) {
            const { ctx, data } = chart;
            const chartArea = chart.chartArea;
            const meta = chart.getDatasetMeta(0);
            const arc = meta.data[0];

            // Get current values from chart options
            const currentValue = chart.options.gaugeValue || 0;
            const threshold = chart.options.gaugeThreshold || 50;
            const percentage = Math.min((currentValue / threshold) * 100, 150);
            const isAlert = percentage >= 100;
            const isDark = !document.body.classList.contains('light-mode');

            ctx.save();

            const centerX = arc.x;
            const centerY = arc.y;
            const outerRadius = arc.outerRadius;
            const innerRadius = arc.innerRadius;

            if (isAlert) {
                const time = Date.now() / 1000;
                const redOpacity = 0.4 + Math.abs(Math.sin(time * Math.PI)) * 0.6;

                const redArc = meta.data[2];
                ctx.globalAlpha = redOpacity;
                ctx.beginPath();
                ctx.arc(centerX, centerY, outerRadius, redArc.startAngle, redArc.endAngle);
                ctx.arc(centerX, centerY, innerRadius, redArc.endAngle, redArc.startAngle, true);
                ctx.closePath();
                ctx.fillStyle = '#ef4444';
                ctx.fill();
                ctx.globalAlpha = 1;
            }

            const needleAngle = (percentage / 150) * Math.PI + Math.PI;
            const needleLength = (outerRadius + innerRadius) / 2;
            const needleEndX = centerX + needleLength * Math.cos(needleAngle);
            const needleEndY = centerY + needleLength * Math.sin(needleAngle);

            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.lineTo(needleEndX, needleEndY);
            ctx.lineWidth = 3;
            ctx.strokeStyle = isDark ? '#ffffff' : '#000000';
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(centerX, centerY, 6, 0, 2 * Math.PI);
            ctx.fillStyle = isDark ? '#ffffff' : '#000000';
            ctx.fill();

            ctx.restore();
        }
    };

    const config = {
        type: 'doughnut',
        data: data,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            gaugeValue: currentValue,
            gaugeThreshold: threshold,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    enabled: false
                }
            }
        },
        plugins: [gaugeNeedlePlugin]
    };

    const gaugeChart = new Chart(ctx, config);
    charts[canvasId] = gaugeChart;

    const percentage = Math.min((currentValue / threshold) * 100, 150);
    const isAlert = percentage >= 100;

    if (isAlert) {
        const animate = () => {
            gaugeChart.update('none');
        };
        gaugeChart.animationFrame = requestAnimationFrame(function animateLoop() {
            animate();
            gaugeChart.animationFrame = requestAnimationFrame(animateLoop);
        });
    }
}

function updateGaugeChart(canvasId, currentValue, threshold) {
    const gaugeChart = charts[canvasId];
    if (!gaugeChart) return;

    const percentage = Math.min((currentValue / threshold) * 100, 150);
    const isAlert = percentage >= 100;

    // Update the gauge values in chart options
    gaugeChart.options.gaugeValue = currentValue;
    gaugeChart.options.gaugeThreshold = threshold;

    // Cancel old animation if exists
    if (gaugeChart.animationFrame) {
        cancelAnimationFrame(gaugeChart.animationFrame);
        gaugeChart.animationFrame = null;
    }

    // Update to trigger a redraw with new needle position
    gaugeChart.update('none');

    // Restart animation if in alert state
    if (isAlert) {
        const animate = () => {
            gaugeChart.update('none');
        };
        gaugeChart.animationFrame = requestAnimationFrame(function animateLoop() {
            animate();
            gaugeChart.animationFrame = requestAnimationFrame(animateLoop);
        });
    }
}

function renderCharts() {
    const container = document.getElementById('charts-container');
    if (!container) return;

    ensureChartLayout(container);
    const individualWrapper = document.getElementById('individual-charts');
    const combinedCard = document.getElementById('combined-chart-card');

    // Check if we need to rebuild (gas added/removed or first load)
    const existingGasIds = new Set();
    individualWrapper.querySelectorAll('[data-chart-gas-id]').forEach(el => {
        existingGasIds.add(el.dataset.chartGasId);
    });

    const currentGasIds = new Set(Object.keys(gasData));
    const needsRebuild = existingGasIds.size !== currentGasIds.size ||
                         ![...existingGasIds].every(id => currentGasIds.has(id));

    if (needsRebuild) {
        // Full rebuild needed
        destroyCombinedChart();
        Object.keys(charts).forEach(key => {
            if (key.startsWith('chart-') && charts[key]) {
                charts[key].destroy();
                delete charts[key];
            }
        });
        individualWrapper.innerHTML = '';
        Object.entries(gasData).forEach(([gasId, gas]) => {
            const chartContainer = createChartContainer(gasId, gas);
            individualWrapper.appendChild(chartContainer);
        });
    } else {
        // Just update existing charts with new data
        Object.entries(gasData).forEach(([gasId, gas]) => {
            updateHistoricalChart(`chart-${gasId}`, gas);
        });
    }

    updateCombinedChart(combinedTimeRange);
    toggleChartView(combinedCard, individualWrapper);
}

function ensureChartLayout(container) {
    if (document.getElementById('chart-view-toggle')) return;

    container.innerHTML = '';

    const toggleBar = document.createElement('div');
    toggleBar.id = 'chart-view-toggle';
    toggleBar.className = 'flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6';
    toggleBar.innerHTML = `
        <div class="text-sm text-gray-300">Historical View</div>
        <div class="inline-flex rounded-lg border border-green-800 bg-gray-900 overflow-hidden">
            <button data-chart-view="combined" class="chart-view-btn px-4 py-2 text-sm font-medium bg-green-600 text-white">All Gases</button>
            <button data-chart-view="individual" class="chart-view-btn px-4 py-2 text-sm font-medium text-gray-300 hover:bg-gray-800">Individual</button>
        </div>
    `;

    const combinedCard = document.createElement('div');
    combinedCard.id = 'combined-chart-card';
    combinedCard.className = 'bg-gray-900 bg-opacity-80 p-6 rounded-xl border border-green-800';
    combinedCard.innerHTML = `
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-3">
            <h3 class="text-lg font-semibold text-green-300">All Gases - Historical Trends</h3>
            <div class="flex gap-2 flex-wrap">
                <button class="combined-range-btn px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-800 text-gray-400 hover:bg-gray-700 transition-colors" data-range="1day">1 Day</button>
                <button class="combined-range-btn px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-800 text-gray-400 hover:bg-gray-700 transition-colors" data-range="1week">1 Week</button>
                <button class="combined-range-btn px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-800 text-gray-400 hover:bg-gray-700 transition-colors" data-range="1year">1 Year</button>
                <button class="combined-range-btn active px-3 py-1.5 text-xs font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors" data-range="all">All</button>
            </div>
        </div>
        <div class="relative">
            <canvas id="combined-chart" class="w-full h-80"></canvas>
        </div>
    `;

    const individualWrapper = document.createElement('div');
    individualWrapper.id = 'individual-charts';
    individualWrapper.className = 'space-y-6 mt-6';

    container.appendChild(toggleBar);
    container.appendChild(combinedCard);
    container.appendChild(individualWrapper);

    const toggleButtons = toggleBar.querySelectorAll('[data-chart-view]');
    toggleButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            chartViewMode = btn.getAttribute('data-chart-view');
            toggleChartView(combinedCard, individualWrapper);
        });
    });

    const rangeButtons = combinedCard.querySelectorAll('.combined-range-btn');
    rangeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            rangeButtons.forEach(b => {
                b.classList.remove('active', 'bg-green-600', 'text-white');
                b.classList.add('bg-gray-800', 'text-gray-400');
            });
            btn.classList.add('active', 'bg-green-600', 'text-white');
            btn.classList.remove('bg-gray-800', 'text-gray-400');
            combinedTimeRange = btn.getAttribute('data-range') || 'all';
            updateCombinedChart(combinedTimeRange);
        });
    });

    toggleChartView(combinedCard, individualWrapper);
}

function toggleChartView(combinedCard, individualWrapper) {
    const toggleButtons = document.querySelectorAll('#chart-view-toggle [data-chart-view]');
    toggleButtons.forEach(btn => {
        const isActive = btn.getAttribute('data-chart-view') === chartViewMode;
        btn.classList.toggle('bg-green-600', isActive);
        btn.classList.toggle('text-white', isActive);
        btn.classList.toggle('text-gray-300', !isActive);
        btn.classList.toggle('hover:bg-gray-800', !isActive);
    });

    if (combinedCard && individualWrapper) {
        combinedCard.classList.toggle('hidden', chartViewMode !== 'combined');
        individualWrapper.classList.toggle('hidden', chartViewMode !== 'individual');
    }
}

function createChartContainer(gasId, gas) {
    const container = document.createElement('div');
    container.className = 'bg-gray-900 bg-opacity-80 p-6 rounded-xl border border-green-800';
    container.setAttribute('data-chart-gas-id', gasId);

    const gasName = gas.config?.gas_name || gasId;
    const canvasId = `chart-${gasId}`;

    container.innerHTML = `
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-3">
            <h3 class="text-lg font-semibold text-green-300">${gasName} - Historical Data</h3>
            <div class="flex gap-2 flex-wrap">
                <button class="time-range-btn px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-800 text-gray-400 hover:bg-gray-700 transition-colors" data-range="1day">1 Day</button>
                <button class="time-range-btn px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-800 text-gray-400 hover:bg-gray-700 transition-colors" data-range="1week">1 Week</button>
                <button class="time-range-btn px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-800 text-gray-400 hover:bg-gray-700 transition-colors" data-range="1year">1 Year</button>
                <button class="time-range-btn active px-3 py-1.5 text-xs font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors" data-range="all">All</button>
            </div>
        </div>
        <canvas id="${canvasId}" width="400" height="200"></canvas>
    `;

    // Add event listeners for time range buttons
    setTimeout(() => {
        const buttons = container.querySelectorAll('.time-range-btn');
        buttons.forEach(btn => {
            btn.addEventListener('click', () => {
                buttons.forEach(b => {
                    b.classList.remove('active', 'bg-green-600', 'text-white');
                    b.classList.add('bg-gray-800', 'text-gray-400');
                });
                btn.classList.add('active', 'bg-green-600', 'text-white');
                btn.classList.remove('bg-gray-800', 'text-gray-400');

                const range = btn.getAttribute('data-range');
                updateChartWithTimeRange(canvasId, gas, range);
            });
        });

        createChart(canvasId, gas, 'all');
    }, 100);

    return container;
}

function buildCombinedDatasets(timeRange) {
    const timestampSet = new Set();
    const seriesByGas = {};

    Object.entries(gasData).forEach(([gasId, gas]) => {
        const historicalData = gas.historical_readings || {};
        const allReadings = Object.values(historicalData)
            .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        const readings = filterReadingsByTimeRange(allReadings, timeRange);
        seriesByGas[gasId] = readings;
        readings.forEach(r => timestampSet.add(r.timestamp));
    });

    const orderedTimestamps = Array.from(timestampSet).sort((a, b) => new Date(a) - new Date(b));
    const labels = orderedTimestamps;

    const datasets = [];

    Object.entries(seriesByGas).forEach(([gasId, readings], idx) => {
        const gasName = gasData[gasId]?.config?.gas_name || gasId;
        const palette = chartPalette[idx % chartPalette.length];
        const valueByTs = new Map(readings.map(r => [r.timestamp, r.value_ppm]));
        const values = orderedTimestamps.map(ts => valueByTs.has(ts) ? valueByTs.get(ts) : null);

        datasets.push({
            label: `${gasName} (ppm)`,
            data: values,
            borderColor: palette.border,
            backgroundColor: palette.fill,
            borderWidth: 2,
            borderJoinStyle: 'round',
            cubicInterpolationMode: 'monotone',
            fill: false,
            tension: 0.35,
            spanGaps: true,
            pointRadius: 0,
            pointHoverRadius: 0,
            pointBorderWidth: 0,
            pointHoverBorderWidth: 0
        });
    });

    return { labels, datasets };
}

function updateCombinedChart(timeRange = 'all') {
    const canvas = document.getElementById('combined-chart');
    if (!canvas) {
        destroyCombinedChart();
        return;
    }

    const { labels, datasets } = buildCombinedDatasets(timeRange);

    if (!combinedChart) {
        combinedChart = new Chart(canvas, {
            type: 'line',
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: {
                    padding: { top: 6, right: 12, bottom: 6, left: 6 }
                },
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: {
                        labels: {
                            color: '#e5e7eb',
                            usePointStyle: true,
                            pointStyle: 'line',
                            boxHeight: 12,
                            boxWidth: 18,
                            padding: 14,
                            generateLabels: (chart) => {
                                const original = Chart.defaults.plugins.legend.labels.generateLabels(chart);
                                return original.map(label => {
                                    const ds = chart.data.datasets[label.datasetIndex] || {};
                                    return {
                                        ...label,
                                        fillStyle: ds.borderColor || label.fillStyle,
                                        strokeStyle: ds.borderColor || label.strokeStyle,
                                        lineWidth: ds.borderWidth || 2,
                                        text: label.text
                                    };
                                });
                            }
                        }
                    },
                    tooltip: {
                        enabled: false
                    }
                },
                scales: {
                    x: {
                        ticks: {
                            color: '#00ff41',
                            maxRotation: 45,
                            minRotation: 0,
                            autoSkip: true,
                            maxTicksLimit: 8,
                            callback: function(value, index) {
                                const labels = this.chart?.data?.labels || [];
                                const ts = labels[index];
                                if (!ts) return '';
                                const d = new Date(ts);
                                const dateLabel = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                                const timeLabel = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                                // Show date when it differs from previous tick; otherwise show time
                                if (index === 0) return `${dateLabel} ${timeLabel}`;
                                const prevTs = labels[index - 1];
                                const prevDate = prevTs ? new Date(prevTs).toDateString() : '';
                                if (d.toDateString() !== prevDate) return `${dateLabel} ${timeLabel}`;
                                return timeLabel;
                            }
                        },
                        grid: { color: 'rgba(0, 255, 65, 0.1)' }
                    },
                    y: {
                        beginAtZero: true,
                        ticks: { color: '#00ff41' },
                        grid: { color: 'rgba(0, 255, 65, 0.1)' }
                    }
                }
            }
        });
        charts['combined-chart'] = combinedChart;
    } else {
        if (combinedChart.canvas !== canvas) {
            destroyCombinedChart();
            return updateCombinedChart(timeRange);
        }
        combinedChart.data.labels = labels;
        combinedChart.data.datasets = datasets;
        combinedChart.update('none');
    }
}

/**
 * Filters sensor readings based on selected time range
 * @param {Array} readings - Array of historical readings
 * @param {string} timeRange - Time range filter ('1hour', '1day', '1week', '1year', 'all')
 * @returns {Array} Filtered readings
 */
function filterReadingsByTimeRange(readings, timeRange) {
    if (timeRange === 'all') {
        return readings;
    }

    const now = new Date();
    let cutoffTime;

    switch (timeRange) {
        case '1day':
            cutoffTime = new Date(now.getTime() - (24 * 60 * 60 * 1000));
            break;
        case '1week':
            cutoffTime = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
            break;
        case '1year':
            cutoffTime = new Date(now.getTime() - (365 * 24 * 60 * 60 * 1000));
            break;
        default:
            return readings;
    }

    return readings.filter(reading => new Date(reading.timestamp) >= cutoffTime);
}

function updateChartWithTimeRange(canvasId, gas, timeRange) {
    const chart = charts[canvasId];
    if (!chart) return;

    const historicalData = gas.historical_readings || {};
    const allReadings = Object.values(historicalData)
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    const readings = filterReadingsByTimeRange(allReadings, timeRange);

    const threshold = gas.config?.threshold || 50;
    const GAP_THRESHOLD_MS = 60 * 60 * 1000;

    const labels = [];
    const data = [];
    const readingMetadata = []; // Store reading data for tooltip access
    let lastDate = null;

    readings.forEach((reading, index) => {
        const timestamp = new Date(reading.timestamp);
        const currentDate = timestamp.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const currentTime = timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

        if (index > 0) {
            const prevTimestamp = new Date(readings[index - 1].timestamp);
            const timeDiff = timestamp - prevTimestamp;

            if (timeDiff > GAP_THRESHOLD_MS) {
                labels.push('');
                data.push(null);
                readingMetadata.push(null); // Gap marker
            }
        }

        if (lastDate !== currentDate) {
            labels.push(currentDate);
            lastDate = currentDate;
        } else {
            labels.push(currentTime);
        }

        data.push(reading.value_ppm);
        readingMetadata.push(reading); // Store reading with location data
    });

    chart.data.labels = labels;
    chart.data.datasets[0].data = data;
    chart.data.datasets[1].data = new Array(data.length).fill(threshold);
    
    // Update reading metadata on chart instance
    chart.readingMetadata = readingMetadata;

    chart.update('none');
}

function updateHistoricalChart(canvasId, gas) {
    const chart = charts[canvasId];
    if (!chart) return;

    const container = document.querySelector(`[data-chart-gas-id="${canvasId.replace('chart-', '')}"]`);
    const activeButton = container?.querySelector('.time-range-btn.active');
    const timeRange = activeButton?.getAttribute('data-range') || 'all';

    updateChartWithTimeRange(canvasId, gas, timeRange);
}

function createChart(canvasId, gas, timeRange = 'all') {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    const historicalData = gas.historical_readings || {};
    const allReadings = Object.values(historicalData)
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    const readings = filterReadingsByTimeRange(allReadings, timeRange);

    const threshold = gas.config?.threshold || 50;
    const GAP_THRESHOLD_MS = 60 * 60 * 1000;

    const labels = [];
    const data = [];
    const readingMetadata = []; // Store reading data for tooltip access
    let lastDate = null;

    readings.forEach((reading, index) => {
        const timestamp = new Date(reading.timestamp);
        const currentDate = timestamp.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const currentTime = timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

        if (index > 0) {
            const prevTimestamp = new Date(readings[index - 1].timestamp);
            const timeDiff = timestamp - prevTimestamp;

            if (timeDiff > GAP_THRESHOLD_MS) {
                labels.push('');
                data.push(null);
                readingMetadata.push(null); // Gap marker
            }
        }

        if (lastDate !== currentDate) {
            labels.push(currentDate);
            lastDate = currentDate;
        } else {
            labels.push(currentTime);
        }

        data.push(reading.value_ppm);
        readingMetadata.push(reading); // Store reading with location data
    });

    // Helper function to get or create custom tooltip element
    const getOrCreateTooltip = (chart) => {
        let tooltipEl = chart.canvas.parentNode.querySelector('div[data-chart-tooltip]');
        if (!tooltipEl) {
            tooltipEl = document.createElement('div');
            tooltipEl.setAttribute('data-chart-tooltip', '');
            tooltipEl.style.cssText = `
                position: fixed;
                background: rgba(0, 0, 0, 0.9);
                color: #ffffff;
                padding: 12px;
                border: 1px solid #00ff41;
                border-radius: 4px;
                pointer-events: auto;
                opacity: 0;
                transition: opacity 0.2s;
                z-index: 10000;
                font-family: sans-serif;
                font-size: 12px;
                line-height: 1.5;
                max-width: 300px;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.5);
            `;
            const parent = chart.canvas.parentNode;
            if (parent && window.getComputedStyle(parent).position === 'static') {
                parent.style.position = 'relative';
            }
            chart.canvas.parentNode.appendChild(tooltipEl);
        }
        return tooltipEl;
    };

    const chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Gas Level (ppm)',
                data: data,
                borderColor: '#00ff41',
                backgroundColor: 'rgba(0, 255, 65, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                spanGaps: false,
                pointRadius: 0,
                pointHoverRadius: 5,
                pointHoverBackgroundColor: '#00ff41',
                pointHoverBorderColor: '#ffffff',
                pointHoverBorderWidth: 2
            }, {
                label: 'Threshold',
                data: new Array(data.length).fill(threshold),
                borderColor: '#ef4444',
                backgroundColor: 'transparent',
                borderWidth: 2,
                borderDash: [5, 5],
                pointRadius: 0,
                fill: false,
                tension: 0
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    labels: {
                        color: '#00ff41'
                    }
                },
                tooltip: {
                    enabled: false // Disable default tooltip, we'll use custom HTML tooltip
                }
            },
            scales: {
                x: {
                    ticks: {
                        color: '#00ff41',
                        maxRotation: 45,
                        minRotation: 0
                    },
                    grid: {
                        color: 'rgba(0, 255, 65, 0.1)'
                    }
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: '#00ff41'
                    },
                    grid: {
                        color: 'rgba(0, 255, 65, 0.1)'
                    }
                }
            }
        }
    });
    
    // Store reading metadata on chart instance for tooltip access
    chart.readingMetadata = readingMetadata;
    
    // Add custom tooltip using mouse events
    const tooltipEl = getOrCreateTooltip(chart);
    
    chart.canvas.addEventListener('mousemove', function(evt) {
        const points = chart.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, true);
        
        if (points.length === 0 || points[0].datasetIndex !== 0) {
            tooltipEl.style.opacity = 0;
            return;
        }
        
        const point = points[0];
        const dataIndex = point.index;
        const reading = chart.readingMetadata[dataIndex];
        
        if (!reading || reading.value_ppm === null || reading.value_ppm === undefined) {
            tooltipEl.style.opacity = 0;
            return;
        }
        
        const concentration = reading.value_ppm.toFixed(2);
        const location = reading.location || {};
        const hasCoords = location && typeof location.lat === 'number' && typeof location.lng === 'number';
        
        let html = `<div style="color: #00ff41; font-weight: bold; margin-bottom: 6px;">Gas Level (ppm)</div>`;
        html += `<div style="color: #ffffff; margin-bottom: 6px;">Concentration: ${concentration} ppm</div>`;
        
        if (hasCoords) {
            const lat = Number(location.lat).toFixed(6);
            const lng = Number(location.lng).toFixed(6);
            const url = `https://www.google.com/maps?q=${lat},${lng}`;
            const status = location.status || 'Unknown';
            
            // Try to get cached place name
            const cached = getCachedPlaceName(lat, lng);
            if (!cached) {
                try { ensureGeocode(Number(lat), Number(lng)); } catch (_) {}
            }
            const locationLabel = cached || `${lat}, ${lng}`;
            
            html += `<div style="color: #ffffff;">Location: <a href="${url}" target="_blank" style="color: #00ff41; text-decoration: underline; cursor: pointer;">${locationLabel}</a>`;
            if (status !== 'Live') {
                html += ` <span style="color: #999;">(${status})</span>`;
            }
            html += `</div>`;
        } else {
            html += `<div style="color: #ffffff;">Location: Unknown</div>`;
        }
        
        tooltipEl.innerHTML = html;
        
        // Position tooltip above the actual data point
        const rect = chart.canvas.getBoundingClientRect();
        
        // Get the actual point position from Chart.js element
        // Chart.js returns elements with x and y properties relative to the canvas
        let pointX, pointY;
        
        // Try to get position from the point element directly
        const element = point.element || (point.datasetIndex !== undefined ? chart.getDatasetMeta(point.datasetIndex).data[dataIndex] : null);
        
        if (element && typeof element.x === 'number' && typeof element.y === 'number') {
            pointX = element.x;
            pointY = element.y;
        } else {
            // Fallback: calculate position from data index using chart scales
            const meta = chart.getDatasetMeta(point.datasetIndex);
            const dataPoint = meta && meta.data ? meta.data[dataIndex] : null;
            if (dataPoint && typeof dataPoint.x === 'number' && typeof dataPoint.y === 'number') {
                pointX = dataPoint.x;
                pointY = dataPoint.y;
            } else {
                // Last resort: use mouse position relative to canvas
                pointX = evt.offsetX || (evt.clientX - rect.left);
                pointY = evt.offsetY || (evt.clientY - rect.top);
            }
        }
        
        // Set tooltip content first and make it invisible to measure
        tooltipEl.style.opacity = '0';
        tooltipEl.style.visibility = 'hidden';
        tooltipEl.style.display = 'block';
        
        // Force reflow to get accurate dimensions
        void tooltipEl.offsetWidth;
        
        const tooltipRect = tooltipEl.getBoundingClientRect();
        const tooltipWidth = tooltipRect.width;
        const tooltipHeight = tooltipRect.height;
        
        // Calculate position: centered above the point
        const canvasLeft = rect.left;
        const canvasTop = rect.top;
        
        // Position horizontally centered on the point
        let left = canvasLeft + pointX - (tooltipWidth / 2);
        
        // Position vertically above the point with some spacing
        let top = canvasTop + pointY - tooltipHeight - 15;
        
        // Keep tooltip within viewport bounds
        const padding = 10;
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        // Adjust horizontal position if tooltip goes off-screen
        if (left < padding) {
            left = padding;
        } else if (left + tooltipWidth > viewportWidth - padding) {
            left = viewportWidth - tooltipWidth - padding;
        }
        
        // If tooltip would go above viewport, show it below the point instead
        if (top < padding) {
            top = canvasTop + pointY + 25; // Show below point with spacing
        }
        
        // If tooltip would go below viewport, adjust to fit
        if (top + tooltipHeight > viewportHeight - padding) {
            top = viewportHeight - tooltipHeight - padding;
        }
        
        // Apply position and make visible
        tooltipEl.style.left = left + 'px';
        tooltipEl.style.top = top + 'px';
        tooltipEl.style.opacity = '1';
        tooltipEl.style.visibility = 'visible';
    });
    
    chart.canvas.addEventListener('mouseleave', function() {
        tooltipEl.style.opacity = 0;
    });
    
    charts[canvasId] = chart;
}

function renderAlerts() {
    const container = document.getElementById('alerts-container');
    const noAlertsMessage = document.getElementById('no-alerts-message');
    container.innerHTML = '';

    // Collect all alerts from all gases
    const allAlerts = [];
    let activeAlertsCount = 0;
    
    Object.entries(gasData).forEach(([gasId, gas]) => {
        if (gas.alerts) {
            Object.entries(gas.alerts).forEach(([alertId, alert]) => {
                // Only show alerts that are not hidden (server-wide) and not locally hidden
                if (alert.hidden !== true && !alert.hiddenInUI) {
                    allAlerts.push({
                        gasId,
                        alertId,
                        gasName: gas.config?.gas_name || gasId,
                        ...alert
                    });
                    
                    // Count active alerts for overview
                    if (alert.status === 'active') {
                        activeAlertsCount++;
                    }
                }
            });
        }
    });

    // Update active alerts count in overview
    document.getElementById('active-alerts-count').textContent = activeAlertsCount;

    // Sort alerts: Active first, then by timestamp (newest first)
    allAlerts.sort((a, b) => {
        // First sort by status (active alerts first)
        if (a.status === 'active' && b.status !== 'active') return -1;
        if (a.status !== 'active' && b.status === 'active') return 1;
        
        // Then sort by timestamp (newest first)
        return new Date(b.timestamp) - new Date(a.timestamp);
    });

    // Display all alerts (scrolling will handle the display)
    const alertsToShow = allAlerts;
    
    if (alertsToShow.length === 0) {
        noAlertsMessage.classList.remove('hidden');
    } else {
        noAlertsMessage.classList.add('hidden');
        alertsToShow.forEach(alert => {
            const alertCard = createAlertCard(alert);
            container.appendChild(alertCard);
        });
    }
}

/**
 * Creates an HTML card element for displaying an alert
 * Includes alert details, status badge, and action buttons
 * @param {Object} alert - Alert object with gas data and status
 * @returns {HTMLElement} Alert card DOM element
 */
function createAlertCard(alert) {
    const card = document.createElement('div');

    // Style card based on active/resolved status
    let cardClass = 'relative p-4 rounded-lg border transition-all duration-300 ';
    let statusBadge = '';
    
    if (alert.status === 'active') {
        cardClass += 'bg-red-950 shadow-lg';
        cardClass += ' border-2';
        statusBadge = '<span class="inline-block px-2 py-1 text-xs font-semibold text-white rounded-full" style="background-color: var(--alert-red);">ACTIVE</span>';
    } else {
        cardClass += 'bg-green-900 border-green-700';
        statusBadge = '<span class="inline-block px-2 py-1 text-xs font-semibold bg-green-600 text-white rounded-full">RESOLVED</span>';
    }

    card.className = cardClass;
    if (alert.status === 'active') {
        card.style.borderColor = 'var(--alert-red)';
    }
    const hideBtn = (alert.status !== 'active') ? `
        <!-- Hide Button (Top Right) for non-active alerts -->
        <button class="absolute top-2 right-2 w-6 h-6 bg-gray-700 hover:bg-gray-600 text-white rounded-full flex items-center justify-center text-sm transition-colors" 
                onclick="hideAlertFromUI('${alert.gasId}', '${alert.alertId}')" title="Archive alert">
            ×
        </button>
    ` : '';

    card.innerHTML = `
        ${hideBtn}
        
        <!-- Alert Header -->
        <div class="flex items-center justify-between mb-3 pr-8">
            <h4 class="font-semibold text-white text-lg">${alert.gasName} Alert</h4>
            ${statusBadge}
        </div>
        
        <!-- Alert Details -->
        <div class="space-y-2 text-sm mb-4">
            <div class="flex justify-between">
                <span class="text-gray-300">Level:</span>
                <span class="text-white font-semibold">${alert.value_ppm} ppm</span>
            </div>
            <div class="flex justify-between">
                <span class="text-gray-300">Threshold:</span>
                <span class="text-white">${alert.threshold} ppm</span>
            </div>
            <div class="flex justify-between">
                <span class="text-gray-300">Location:</span>
                <span class="text-white">${formatLocationPlain(alert.location)}</span>
            </div>
            <div class="flex justify-between">
                <span class="text-gray-300">Time:</span>
                <span class="text-white">${formatTimestamp(alert.timestamp)}</span>
            </div>
            <div class="flex justify-between">
                <span class="text-gray-300">Type:</span>
                <span class="text-white">${alert.alert_type || 'Gas Alert'}</span>
            </div>
        </div>
        
        <!-- Action Buttons -->
        <div class="flex">
            ${alert.status === 'active' ?
                `<button class="w-full bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded-lg font-semibold transition-colors flex items-center justify-center space-x-2"
                        onclick="resolveAlert('${alert.gasId}', '${alert.alertId}')">
                    <span>✅</span>
                    <span>Resolve</span>
                </button>` :
                `<div class="w-full bg-gray-600 text-gray-300 py-2 px-4 rounded-lg font-semibold text-center">
                    ✅ Resolved
                </div>`
            }
        </div>
    `;

    return card;
}

/**
 * Marks an alert as resolved in Firebase
 * Updates alert status from 'active' to 'inactive'
 * @param {string} gasId - Gas sensor identifier
 * @param {string} alertId - Unique alert identifier
 */
function resolveAlert(gasId, alertId) {
    const alertRef = database.ref(`robots/spider-01/gasses/${gasId}/alerts/${alertId}`);
    alertRef.update({
        status: 'inactive'
    }).then(() => {
        console.log('Alert resolved successfully');
    }).catch((error) => {
        console.error('Error resolving alert:', error);
        alert('Error resolving alert. Please try again.');
    });
}

/**
 * Hides an alert for all users by setting a server-side flag
 * Only allowed for non-active alerts (inactive/resolved/archived)
 * @param {string} gasId - Gas sensor identifier
 * @param {string} alertId - Unique alert identifier
 */
function hideAlertFromUI(gasId, alertId) {
    const alertObj = gasData[gasId] && gasData[gasId].alerts && gasData[gasId].alerts[alertId];
    if (!alertObj) return;
    if (alertObj.status === 'active') { return; }
    // Optimistic local hide
    alertObj.hiddenInUI = true;
    renderAlerts();
    const alertRef = database.ref(`robots/spider-01/gasses/${gasId}/alerts/${alertId}`);
    alertRef.update({ hidden: true })
        .then(() => {
            console.log('Alert hidden (server-wide) successfully');
            try { showToast('Alert archived.'); } catch (_) {}
        })
        .catch((error) => {
            console.error('Error hiding alert:', error);
            // Revert local hide on failure
            delete alertObj.hiddenInUI;
            renderAlerts();
            try { showToast('Archive failed.'); } catch (_) { alert('Archive failed.'); }
        });
}

function createAlertCard_old(alert) {
    const card = document.createElement('div');
    let cardClass = 'p-4 rounded-lg border cursor-pointer transition-colors ';
    
    switch (alert.alert_type) {
        case 'HIGH_CONCENTRATION':
            cardClass += 'bg-red-950 hover:bg-red-900 border-2';
            break;
        case 'MEDIUM_CONCENTRATION':
            cardClass += 'bg-yellow-900 border-yellow-700 hover:bg-yellow-800';
            break;
        default:
            cardClass += 'bg-green-900 border-green-700 hover:bg-green-800';
    }

    card.className = cardClass;
    if (alert.alert_type === 'HIGH_CONCENTRATION') {
        card.style.borderColor = 'var(--alert-red)';
    }
    card.innerHTML = `
        <div class="flex items-center justify-between mb-2">
            <h4 class="font-semibold text-white">${alert.gasName} Alert</h4>
            <span class="text-sm text-gray-300">${alert.status}</span>
        </div>
        <div class="space-y-1 text-sm">
            <p class="text-gray-300">Level: <span class="text-white font-semibold">${alert.value_ppm} ppm</span></p>
            <p class="text-gray-300">Threshold: <span class="text-white">${alert.threshold} ppm</span></p>
            <p class="text-gray-300">Location: <span class="text-white">${alert.location}</span></p>
            <p class="text-gray-300">Time: <span class="text-white">${formatTimestamp(alert.timestamp)}</span></p>
        </div>
    `;

    card.addEventListener('click', () => {
        showAlertModal(alert);
    });

    return card;
}

// Expose functions to global scope for onclick handlers in dynamically generated HTML
window.resolveAlert = resolveAlert;
window.hideAlertFromUI = hideAlertFromUI;
window.updateThreshold = updateThreshold;

function renderThresholds() {
    const container = document.getElementById('thresholds-container');
    container.innerHTML = '';

    const card = document.createElement('div');
    card.className = 'bg-gray-900 bg-opacity-80 p-6 rounded-xl border border-green-800';
    card.innerHTML = `
        <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-semibold text-green-300">Threshold Settings</h3>
            <span class="text-sm text-gray-400">Adjust alert limits for each gas</span>
        </div>
        <div id="thresholds-list" class="space-y-4"></div>
    `;

    const listContainer = card.querySelector('#thresholds-list');

    Object.entries(gasData).forEach(([gasId, gas]) => {
        const thresholdControl = createThresholdControl(gasId, gas);
        listContainer.appendChild(thresholdControl);
    });

    container.appendChild(card);
}

/**
 * Creates a threshold control widget for a gas sensor
 * Allows users to adjust alert threshold values
 * @param {string} gasId - Gas sensor identifier
 * @param {Object} gas - Gas sensor object with config
 * @returns {HTMLElement} Threshold control DOM element
 */
function createThresholdControl(gasId, gas) {
    const container = document.createElement('div');
    container.className = 'p-4 rounded-lg bg-black bg-opacity-40 border border-green-800';

    const gasName = gas.config?.gas_name || gasId;
    const currentThreshold = gas.config?.threshold || 50;
    
    container.innerHTML = `
        <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div>
                <h3 class="text-base font-semibold text-green-300">${gasName}</h3>
                <span class="text-sm text-gray-400">Current: ${currentThreshold} ppm</span>
            </div>
            <div class="flex items-center gap-3 w-full lg:w-auto">
                <input type="number" id="threshold-${gasId}" value="${currentThreshold}" min="1" max="1000" 
                       class="flex-1 lg:flex-none w-full lg:w-28 p-3 rounded-lg bg-gray-900 border border-green-700 text-white">
                <button onclick="updateThreshold('${gasId}')" 
                        class="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg transition-colors">
                    Update
                </button>
            </div>
        </div>
        <div id="threshold-status-${gasId}" class="mt-2 text-sm"></div>
    `;

    return container;
}

