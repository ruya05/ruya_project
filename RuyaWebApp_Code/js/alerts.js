// ==================== ALERT HANDLING ====================
/**
 * Processes a new alert from Firebase
 * Optionally displays modal and updates alerts section
 * @param {string} gasId - Gas sensor identifier
 * @param {Object} alert - Alert data object
 * @param {boolean} showModal - Whether to display modal popup
 */
function handleNewAlert(gasId, alert, showModal = false) {
    // Display modal popup if requested (new real-time alerts)
    if (showModal && (typeof getAlertsEnabled !== 'function' || getAlertsEnabled())) {
        showAlertModal({
            gasId,
            gasName: gasData[gasId]?.config?.gas_name || gasId,
            alertId: alert.alertId,
            ...alert
        });
    }

    // Re-render alerts section
    renderAlerts();
}

/**
 * Adds an alert to the display queue
 * Manages queue system to prevent overlapping modals
 * @param {Object} alert - Alert object with gas data
 */
function showAlertModal(alert) {
    // Respect alert control setting
    if (typeof getAlertsEnabled === 'function' && !getAlertsEnabled()) {
        console.log('Alerts are disabled; suppressing modal.');
        return;
    }
    // Add to FIFO queue
    alertQueue.push(alert);
    console.log(`Alert added to queue. Queue length: ${alertQueue.length}`);

    // Display immediately if no modal is currently showing
    if (!isAlertModalVisible) {
        displayNextAlert();
    }
}

/**
 * Displays the next alert from the queue in a modal
 * Manages queue state and shows count of remaining alerts
 * Updates modal content with alert details
 */
function displayNextAlert() {
    // Respect alert control setting
    if (typeof getAlertsEnabled === 'function' && !getAlertsEnabled()) {
        alertQueue = [];
        isAlertModalVisible = false;
        return;
    }
    // Exit if queue is empty
    if (alertQueue.length === 0) {
        console.log('No more alerts in queue');
        isAlertModalVisible = false;
        return;
    }

    // Remove first alert from queue (FIFO)
    const alert = alertQueue.shift();
    console.log(`Displaying alert. Remaining in queue: ${alertQueue.length}`);

    const modal = document.getElementById('alert-modal');
    const content = document.getElementById('modal-content');

    // Store identifiers in modal for acknowledgment handler
    modal.dataset.gasId = alert.gasId;
    modal.dataset.alertId = alert.alertId;

    const isDark = !document.body.classList.contains('light-mode');
    const textColor = isDark ? 'text-gray-400' : 'text-gray-600';
    const valueColor = isDark ? 'text-white' : 'text-gray-900';

    // Update queue indicator and button text
    const queueIndicator = document.getElementById('queue-indicator');
    const acknowledgeBtn = document.getElementById('acknowledge-alert-btn');

    if (alertQueue.length > 0) {
        queueIndicator.textContent = `⚠️ ${alertQueue.length} more alert${alertQueue.length > 1 ? 's' : ''} in queue`;
        queueIndicator.classList.remove('hidden');
        acknowledgeBtn.innerHTML = `✅ Acknowledge & View Next (${alertQueue.length} remaining)`;
    } else {
        queueIndicator.classList.add('hidden');
        acknowledgeBtn.innerHTML = `✅ Acknowledge Alert`;
    }

    content.innerHTML = `
        <div class="space-y-3">
            <div class="flex justify-between">
                <span class="${textColor}">Gas Type:</span>
                <span class="${valueColor} font-semibold">${alert.gasName}</span>
            </div>
            <div class="flex justify-between">
                <span class="${textColor}">Alert Type:</span>
                <span class="font-semibold text-red-500">${alert.alert_type}</span>
            </div>
            <div class="flex justify-between">
                <span class="${textColor}">Gas Level:</span>
                <span class="${valueColor} font-semibold">${alert.value_ppm} ppm</span>
            </div>
            <div class="flex justify-between">
                <span class="${textColor}">Threshold:</span>
                <span class="${valueColor}">${alert.threshold} ppm</span>
            </div>
            <div class="flex justify-between">
                <span class="${textColor}">Location:</span>
                <span class="${valueColor}">${formatLocationPlain(alert.location)}</span>
            </div>
            <div class="flex justify-between">
                <span class="${textColor}">Time:</span>
                <span class="${valueColor}">${formatTimestamp(alert.timestamp)}</span>
            </div>
        </div>
    `;

    // Show modal
    modal.classList.remove('hidden');
    isAlertModalVisible = true;

    // Play an audible alert when the modal appears
    try { playAlertSound(); } catch (_) {}
}


// ==================== ALERT SOUND ====================
// Plays a short, attention‑grabbing tone when an alert modal appears.
function playAlertSound() {
    // Create or reuse a single AudioContext
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return; // Audio not supported
    if (!window.__ruyaAlertAudioCtx) {
        window.__ruyaAlertAudioCtx = new AC();
    }

    const ctx = window.__ruyaAlertAudioCtx;
    // Resume context if it was suspended due to autoplay policies
    if (typeof ctx.resume === 'function') {
        ctx.resume().catch(() => {});
    }

    // Build a quick two‑beep pattern (siren‑like) to grab attention
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    // Target ~70% perceived volume; adjust with care
    gain.gain.exponentialRampToValueAtTime(0.6, now + 0.02);

    // First beep
    const osc1 = ctx.createOscillator();
    osc1.type = 'square';
    osc1.frequency.setValueAtTime(1000, now); // 1 kHz
    osc1.connect(gain);
    gain.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.25);

    // Brief gap then second beep at a different pitch
    const osc2 = ctx.createOscillator();
    osc2.type = 'square';
    osc2.frequency.setValueAtTime(1400, now + 0.35);
    osc2.connect(gain);
    osc2.start(now + 0.35);
    osc2.stop(now + 0.6);

    // Fade out to avoid clicks and then disconnect
    gain.gain.setTargetAtTime(0.0001, now + 0.55, 0.05);
    setTimeout(() => {
        try {
            osc1.disconnect();
            osc2.disconnect();
            gain.disconnect();
        } catch (_) {}
    }, 750);
}
