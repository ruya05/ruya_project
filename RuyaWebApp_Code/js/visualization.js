// ==================== INTERACTIVE GAS VISUALIZATION ====================
let gasMap = null;
let gasMarkers = [];
let gasPathLayer = null;
let allReadings = []; // Store all valid readings for historical tracking
let processedReadingIds = new Set(); // Track which readings we've already processed
let gasColorMap = {}; // Map gas IDs to base colors
let maxConcentration = {}; // Track max concentration per gas for normalization

// Color palette for different gas types
const GAS_COLORS = {
    'gas-1': { base: '#00ff41', name: 'Gas 1' }, // Green
    'gas-2': { base: '#22d3ee', name: 'Gas 2' }, // Cyan
    'gas-3': { base: '#a855f7', name: 'Gas 3' }, // Purple
    'gas-4': { base: '#f97316', name: 'Gas 4' }, // Orange
    'gas-5': { base: '#38bdf8', name: 'Gas 5' }, // Sky Blue
    'gas-6': { base: '#f43f5e', name: 'Gas 6' }, // Pink
    'gas-7': { base: '#84cc16', name: 'Gas 7' }, // Lime
    'default': { base: '#00ff41', name: 'Unknown Gas' }
};

/**
 * Initialize the interactive gas visualization map
 */
function initializeGasVisualization() {
    const mapContainer = document.getElementById('gas-visualization-map');
    if (!mapContainer) return;

    // Initialize Leaflet map with default center (UAE coordinates)
    gasMap = L.map('gas-visualization-map', {
        center: [25.2048, 55.2708], // Default to UAE
        zoom: 13,
        zoomControl: true,
        attributionControl: true
    });

    // Add Esri World Street Map tile layer (English labels by default)
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
        attribution: '© Esri, HERE, Garmin, © OpenStreetMap contributors',
        maxZoom: 19
    }).addTo(gasMap);

    // Initialize path layer (polyline for robot path)
    gasPathLayer = L.layerGroup().addTo(gasMap);

    // Set up Firebase listeners for real-time updates
    setupVisualizationListeners();

    // Set up export buttons
    setupExportButtons();

    // Initialize legend
    updateLegend();

    // Initial load will happen via Firebase listener
    // The listener will process existing data on first load
}

/**
 * Set up Firebase real-time listeners for gas readings
 */
function setupVisualizationListeners() {
    let isInitialLoad = true;
    
    // Listen to all gas sensors
    database.ref('robots/spider-01/gasses').on('value', (snapshot) => {
        const gases = snapshot.val() || {};
        
        // Process each gas sensor
        Object.entries(gases).forEach(([gasId, gas]) => {
            // Process latest reading if it's new and valid (only "Live" readings)
            if (gas.latest_reading) {
                processNewReading(gasId, gas, gas.latest_reading);
            }

            // On initial load, process all historical readings to build complete path
            // After that, only new readings from latest_reading will be added
            if (isInitialLoad && gas.historical_readings) {
                processHistoricalReadings(gasId, gas, gas.historical_readings);
            }
        });

        // Update path visualization
        updatePathVisualization();
        
        // Update legend
        updateLegend();
        
        isInitialLoad = false;
    });
}

/**
 * Process a new reading - only add if it's valid and hasn't been processed
 */
function processNewReading(gasId, gas, reading) {
    // Check if reading has valid GPS coordinates
    if (!reading.location || 
        typeof reading.location.lat !== 'number' || 
        typeof reading.location.lng !== 'number') {
        return; // Skip invalid readings
    }

    // Only process "Live" readings for real-time updates
    // Historical readings are processed separately
    if (reading.location.status && reading.location.status !== 'Live') {
        return; // Skip stale readings
    }

    // Create unique ID for this reading
    const readingId = `${gasId}-${reading.timestamp}-${reading.location.lat}-${reading.location.lng}`;
    
    // Skip if already processed
    if (processedReadingIds.has(readingId)) {
        return;
    }

    // Mark as processed
    processedReadingIds.add(readingId);

    // Add to all readings array
    const readingData = {
        id: readingId,
        gasId: gasId,
        gasName: gas.config?.gas_name || gasId,
        lat: reading.location.lat,
        lng: reading.location.lng,
        concentration: reading.value_ppm || 0,
        timestamp: reading.timestamp,
        threshold: gas.config?.threshold || 50
    };

    allReadings.push(readingData);

    // Update max concentration for normalization
    if (!maxConcentration[gasId] || readingData.concentration > maxConcentration[gasId]) {
        maxConcentration[gasId] = readingData.concentration;
    }

    // Add marker to map
    addMarkerToMap(readingData);
}

/**
 * Process historical readings to build complete path
 */
function processHistoricalReadings(gasId, gas, historicalReadings) {
    Object.values(historicalReadings).forEach(reading => {
        // Check if reading has valid GPS coordinates
        if (!reading.location || 
            typeof reading.location.lat !== 'number' || 
            typeof reading.location.lng !== 'number') {
            return; // Skip invalid readings
        }

        // Accept historical readings with "Live" status or no status field
        // (some historical readings might not have status field)
        if (reading.location.status && reading.location.status !== 'Live') {
            return; // Skip explicitly stale readings
        }

        const readingId = `${gasId}-${reading.timestamp}-${reading.location.lat}-${reading.location.lng}`;
        
        // Skip if already processed
        if (processedReadingIds.has(readingId)) {
            return;
        }

        processedReadingIds.add(readingId);

        const readingData = {
            id: readingId,
            gasId: gasId,
            gasName: gas.config?.gas_name || gasId,
            lat: reading.location.lat,
            lng: reading.location.lng,
            concentration: reading.value_ppm || 0,
            timestamp: reading.timestamp,
            threshold: gas.config?.threshold || 50
        };

        allReadings.push(readingData);

        // Update max concentration
        if (!maxConcentration[gasId] || readingData.concentration > maxConcentration[gasId]) {
            maxConcentration[gasId] = readingData.concentration;
        }

        // Add marker to map for historical readings too
        addMarkerToMap(readingData);
    });
}

/**
 * Add a marker to the map with unified color-coded styling
 */
function addMarkerToMap(readingData) {
    const gasColor = GAS_COLORS[readingData.gasId] || GAS_COLORS['default'];
    
    // Get unified color based on threshold
    const markerColor = getUnifiedColor(readingData.concentration, readingData.threshold);
    const percentage = (readingData.concentration / readingData.threshold) * 100;
    
    // Consistent marker size for all markers
    const iconSize = 12; // Fixed size for all markers
    
    const icon = L.divIcon({
        className: 'gas-marker',
        html: `<div style="
            width: ${iconSize}px;
            height: ${iconSize}px;
            background-color: ${markerColor};
            border: 2px solid ${percentage >= 100 ? '#ffffff' : '#000000'};
            border-radius: 50%;
            box-shadow: 0 0 8px ${markerColor};
        "></div>`,
        iconSize: [iconSize, iconSize],
        iconAnchor: [iconSize / 2, iconSize / 2]
    });

    // Create marker
    const marker = L.marker([readingData.lat, readingData.lng], { icon: icon })
        .addTo(gasMap);

    // Show timestamp on click
    marker.on('click', function() {
        const timestamp = readingData.timestamp ? formatTimestamp(readingData.timestamp) : 'No timestamp';
        alert(timestamp);
    });

    // Store marker reference
    gasMarkers.push({ marker, readingData });

    // Auto-fit map bounds if this is a new area
    if (gasMarkers.length === 1) {
        gasMap.setView([readingData.lat, readingData.lng], 15);
    } else if (gasMarkers.length > 1) {
        const bounds = gasMarkers.map(m => [m.readingData.lat, m.readingData.lng]);
        gasMap.fitBounds(bounds, { padding: [50, 50] });
    }
}

/**
 * Get unified color based on concentration relative to threshold
 * Safe (<60%) = green, Caution (60-99%) = orange, Alert (≥100%) = red
 */
function getUnifiedColor(concentration, threshold) {
    const percentage = (concentration / threshold) * 100;
    
    if (percentage < 60) {
        // Safe: Green
        return '#00ff41'; // Green
    } else if (percentage < 100) {
        // Caution: Orange
        return '#ffaa00'; // Orange
    } else {
        // Alert: Red
        return '#ef4444'; // Red
    }
}

/**
 * Update the robot path visualization with color-coded line
 */
function updatePathVisualization() {
    if (!gasPathLayer || allReadings.length < 2) return;

    // Sort readings by timestamp
    const sortedReadings = [...allReadings].sort((a, b) => 
        new Date(a.timestamp) - new Date(b.timestamp)
    );

    // Clear existing path
    gasPathLayer.clearLayers();

    // Group readings by gas type for separate paths
    const readingsByGas = {};
    sortedReadings.forEach(reading => {
        if (!readingsByGas[reading.gasId]) {
            readingsByGas[reading.gasId] = [];
        }
        readingsByGas[reading.gasId].push(reading);
    });

    // Draw path for each gas type
    Object.entries(readingsByGas).forEach(([gasId, readings]) => {
        if (readings.length < 2) return;

        const gasColor = GAS_COLORS[gasId] || GAS_COLORS['default'];
        const threshold = readings[0].threshold;

        // Create polyline with unified colors based on threshold
        const latlngs = readings.map(r => [r.lat, r.lng]);
        
        // For gradient effect, we'll create segments
        for (let i = 0; i < readings.length - 1; i++) {
            const current = readings[i];
            const next = readings[i + 1];
            
            // Get unified color based on average concentration
            const avgConcentration = (current.concentration + next.concentration) / 2;
            const segmentColor = getUnifiedColor(avgConcentration, threshold);
            
            const segment = L.polyline(
                [[current.lat, current.lng], [next.lat, next.lng]],
                {
                    color: segmentColor,
                    weight: 4,
                    opacity: 0.8,
                    smoothFactor: 1
                }
            ).addTo(gasPathLayer);

            // Add tooltip to segment
            segment.bindTooltip(`
                <div style="font-family: sans-serif; color: #000;">
                    <strong>${current.gasName} Path</strong><br>
                    Concentration: ${current.concentration.toFixed(2)} → ${next.concentration.toFixed(2)} ppm
                </div>
            `, {
                permanent: false,
                direction: 'top'
            });
        }
    });
}

/**
 * Update the legend with unified color scheme
 */
function updateLegend() {
    const legendContainer = document.getElementById('gas-legend');
    if (!legendContainer) return;

    if (allReadings.length === 0) {
        legendContainer.innerHTML = '<span class="text-gray-400">No readings yet</span>';
        return;
    }

    // Show unified color scheme legend
    const legendHTML = `
        <div class="flex items-center gap-2">
            <div class="w-4 h-4 rounded-full" style="background-color: #00ff41;"></div>
            <span class="text-gray-300">Safe (&lt;60% threshold)</span>
        </div>
        <div class="flex items-center gap-2">
            <div class="w-4 h-4 rounded-full" style="background-color: #ffaa00;"></div>
            <span class="text-gray-300">Caution (60-99% threshold)</span>
        </div>
        <div class="flex items-center gap-2">
            <div class="w-4 h-4 rounded-full" style="background-color: #ef4444;"></div>
            <span class="text-gray-300">Alert (≥100% threshold)</span>
        </div>
    `;

    legendContainer.innerHTML = legendHTML;
}

/**
 * Set up export buttons
 */
function setupExportButtons() {
    const exportHeatmapBtn = document.getElementById('export-heatmap-btn');

    if (exportHeatmapBtn) {
        exportHeatmapBtn.addEventListener('click', exportHeatmap);
    }
}

/**
 * Export static heatmap image
 */
async function exportHeatmap() {
    if (!gasMap || allReadings.length === 0) {
        alert('No readings available to generate heatmap.');
        return;
    }

    try {
        // Show loading state
        const btn = document.getElementById('export-heatmap-btn');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<span>Generating...</span>';
        btn.disabled = true;

        // Prepare heatmap data with unified color scheme
        const heatmapData = allReadings.map(reading => {
            const percentage = (reading.concentration / reading.threshold) * 100;
            // Normalize intensity: 0-0.6 for safe, 0.6-1.0 for caution, 1.0+ for alert
            let intensity;
            if (percentage < 60) {
                intensity = (percentage / 60) * 0.6; // 0 to 0.6
            } else if (percentage < 100) {
                intensity = 0.6 + ((percentage - 60) / 40) * 0.4; // 0.6 to 1.0
            } else {
                intensity = 1.0 + Math.min((percentage - 100) / 100, 0.5); // 1.0 to 1.5
            }
            return {
                lat: reading.lat,
                lng: reading.lng,
                intensity: intensity
            };
        });

        // Create a temporary map for export
        const tempMapContainer = document.createElement('div');
        tempMapContainer.style.width = '1920px';
        tempMapContainer.style.height = '1080px';
        tempMapContainer.style.position = 'absolute';
        tempMapContainer.style.left = '-9999px';
        document.body.appendChild(tempMapContainer);

        const exportMap = L.map(tempMapContainer, {
            center: gasMap.getCenter(),
            zoom: gasMap.getZoom(),
            zoomControl: false,
            attributionControl: false
        });

        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 19,
            attribution: '© Esri, HERE, Garmin, © OpenStreetMap contributors'
        }).addTo(exportMap);

        // Add heatmap layer
        if (typeof L.heatLayer !== 'undefined') {
            const heatLayer = L.heatLayer(
                heatmapData.map(d => [d.lat, d.lng, d.intensity * 0.8]),
                {
                    radius: 25,
                    blur: 15,
                    maxZoom: 17,
                    gradient: {
                        0.0: '#00ff41',    // Green (Safe)
                        0.4: '#00ff41',    // Green (Safe)
                        0.6: '#ffaa00',    // Orange (Caution)
                        0.99: '#ffaa00',   // Orange (Caution)
                        1.0: '#ef4444'     // Red (Alert)
                    }
                }
            ).addTo(exportMap);

            // Wait for map to render
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Capture as image
            html2canvas(tempMapContainer, {
                backgroundColor: '#1a1a1a',
                scale: 1,
                useCORS: true
            }).then(canvas => {
                // Download image
                const link = document.createElement('a');
                link.download = `gas-heatmap-${new Date().toISOString().split('T')[0]}.png`;
                link.href = canvas.toDataURL('image/png');
                link.click();

                // Cleanup
                document.body.removeChild(tempMapContainer);
                exportMap.remove();

                btn.innerHTML = originalText;
                btn.disabled = false;
            });
        } else {
            // Fallback: use markers instead of heatmap with unified colors
            allReadings.forEach(reading => {
                const markerColor = getUnifiedColor(reading.concentration, reading.threshold);
                const percentage = (reading.concentration / reading.threshold) * 100;
                
                // Consistent marker size
                L.circleMarker([reading.lat, reading.lng], {
                    radius: 10, // Fixed size for all markers
                    fillColor: markerColor,
                    color: '#fff',
                    weight: 1,
                    opacity: 1,
                    fillOpacity: 0.8
                }).addTo(exportMap);
            });

            await new Promise(resolve => setTimeout(resolve, 1000));

            html2canvas(tempMapContainer, {
                backgroundColor: '#1a1a1a',
                scale: 1,
                useCORS: true
            }).then(canvas => {
                const link = document.createElement('a');
                link.download = `gas-heatmap-${new Date().toISOString().split('T')[0]}.png`;
                link.href = canvas.toDataURL('image/png');
                link.click();

                document.body.removeChild(tempMapContainer);
                exportMap.remove();

                btn.innerHTML = originalText;
                btn.disabled = false;
            });
        }
    } catch (error) {
        console.error('Error exporting heatmap:', error);
        alert('Error generating heatmap. Please try again.');
        const btn = document.getElementById('export-heatmap-btn');
        btn.disabled = false;
    }
}


