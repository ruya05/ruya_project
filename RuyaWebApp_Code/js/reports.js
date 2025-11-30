// ==================== PDF REPORT GENERATION ====================
function initializePDFReports() {
    document.getElementById('generate-pdf-btn').addEventListener('click', generatePDFReport);
}

/**
 * Generates a PDF report of gas monitoring data
 * Includes latest readings, historical data, and active alerts
 * Uses jsPDF library to create downloadable PDF
 */
async function generatePDFReport() {
    const statusDiv = document.getElementById('pdf-status');
    statusDiv.textContent = 'Generating PDF report...';
    statusDiv.className = 'mt-3 text-sm text-yellow-400';

    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        let yPosition = 20;

        doc.setFillColor(0, 255, 65);
        doc.rect(0, 0, pageWidth, 25, 'F');

        doc.setFontSize(24);
        doc.setTextColor(0, 0, 0);
        doc.setFont(undefined, 'bold');
        doc.text("Ru'ya", 15, 17);

        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(50, 50, 50);
        doc.text('Gas Monitoring System', 15, 22);

        yPosition = 35;
        doc.setFontSize(18);
        doc.setTextColor(0, 100, 0);
        doc.setFont(undefined, 'bold');
        doc.text('Gas Monitoring Report', 15, yPosition);

        yPosition += 8;
        doc.setFontSize(10);
        doc.setTextColor(100, 100, 100);
        doc.setFont(undefined, 'normal');
        doc.text(`Generated: ${new Date().toLocaleString('en-US', {
            dateStyle: 'full',
            timeStyle: 'short'
        })}`, 15, yPosition);

        doc.setDrawColor(200, 200, 200);
        doc.line(15, yPosition + 3, pageWidth - 15, yPosition + 3);

        yPosition += 12;

        if (document.getElementById('include-readings').checked) {
            yPosition = addLatestReadingsSection(doc, yPosition, pageWidth, pageHeight);
        }

        if (document.getElementById('include-charts').checked) {
            yPosition = addHistoricalReadingsSection(doc, yPosition, pageWidth, pageHeight);
        }

        if (document.getElementById('include-alerts').checked) {
            yPosition = addAlertsSection(doc, yPosition, pageWidth, pageHeight);
        }

        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(`Page 1 of 1 | Ru'ya Gas Monitoring System | ${new Date().toLocaleDateString()}`,
            pageWidth / 2, pageHeight - 10, { align: 'center' });

        doc.save(`Ru'ya_Gas_Report_${new Date().toISOString().split('T')[0]}.pdf`);

        statusDiv.textContent = 'PDF report generated successfully!';
        statusDiv.className = 'mt-3 text-sm text-green-400';

        setTimeout(() => {
            statusDiv.textContent = '';
        }, 3000);

    } catch (error) {
        console.error('PDF generation error:', error);
        statusDiv.textContent = 'Error generating PDF report.';
        statusDiv.className = 'mt-3 text-sm';
        statusDiv.style.color = 'var(--alert-red)';
    }
}

function addLatestReadingsSection(doc, yStart, pageWidth, pageHeight) {
    let y = yStart;

    doc.setFontSize(14);
    doc.setTextColor(0, 150, 0);
    doc.setFont(undefined, 'bold');
    doc.text('Latest Gas Readings', 15, y);
    y += 8;

    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    doc.setFont(undefined, 'normal');
    const description = doc.splitTextToSize(
        'This section shows the latest real-time gas readings from all monitored sensors, including their measured values, threshold limits, locations, and timestamps.',
        pageWidth - 30
    );
    doc.text(description, 15, y);
    y += description.length * 5;

    y += 3;
    doc.setFillColor(0, 150, 0);
    doc.rect(15, y, pageWidth - 30, 8, 'F');

    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.setFont(undefined, 'bold');
    doc.text('Gas', 18, y + 6);
    doc.text('Value (ppm)', 50, y + 6);
    doc.text('Threshold (ppm)', 85, y + 6);
    doc.text('Location', 125, y + 6);
    doc.text('Timestamp', 160, y + 6);

    y += 8;

    let rowIndex = 0;
    Object.entries(gasData).forEach(([gasId, gas]) => {
        if (y > pageHeight - 30) {
            doc.addPage();
            y = 20;
        }

        const gasName = gas.config?.gas_name || gasId;
        const reading = gas.latest_reading;
        const threshold = gas.config?.threshold || 50;

        if (rowIndex % 2 === 0) {
            doc.setFillColor(245, 245, 245);
            doc.rect(15, y, pageWidth - 30, 8, 'F');
        }

        doc.setFontSize(9);
        doc.setTextColor(0, 0, 0);
        doc.setFont(undefined, 'normal');
        doc.text(gasName, 18, y + 6);
        doc.text((reading && reading.value_ppm != null) ? reading.value_ppm.toFixed(1) : '--', 50, y + 6);
        doc.text(threshold.toString(), 85, y + 6);
        doc.text(formatLocationPlain(reading?.location), 125, y + 6);
        doc.text(reading ? new Date(reading.timestamp).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }) : '--', 160, y + 6);

        y += 8;
        rowIndex++;
    });

    return y + 10;
}

function addHistoricalReadingsSection(doc, yStart, pageWidth, pageHeight) {
    let y = yStart;

    if (y > pageHeight - 80) {
        doc.addPage();
        y = 20;
    }

    doc.setFontSize(14);
    doc.setTextColor(0, 150, 0);
    doc.setFont(undefined, 'bold');
    doc.text('Historical Readings', 15, y);
    y += 8;

    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    doc.setFont(undefined, 'normal');
    const description = doc.splitTextToSize(
        'The historical readings section provides a chronological record of past gas measurements. It helps identify trends and patterns in gas concentration levels over time.',
        pageWidth - 30
    );
    doc.text(description, 15, y);
    y += description.length * 5;

    const allReadingsByGas = {};
    Object.entries(gasData).forEach(([gasId, gas]) => {
        const gasName = gas.config?.gas_name || gasId;
        const threshold = gas.config?.threshold || 50;
        const historicalData = gas.historical_readings || {};
        const readings = Object.values(historicalData).map(reading => ({
            gasName,
            gasId,
            threshold,
            ...reading
        }));

        if (readings.length > 0) {
            allReadingsByGas[gasId] = {
                gasName,
                threshold,
                readings: readings.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
            };
        }
    });

    Object.entries(allReadingsByGas).forEach(([gasId, gasInfo]) => {
        if (y > pageHeight - 100) {
            doc.addPage();
            y = 20;
        }

        y += 5;
        doc.setFontSize(12);
        doc.setTextColor(0, 100, 0);
        doc.setFont(undefined, 'bold');
        doc.text(`${gasInfo.gasName} - Historical Chart`, 15, y);
        y += 6;

        doc.setFontSize(9);
        doc.setTextColor(80, 80, 80);
        doc.setFont(undefined, 'normal');
        const chartDescription = doc.splitTextToSize(
            'The following chart visualizes all historical gas readings over time. It allows you to quickly identify trends, high concentration events, and any periods where data was not recorded. The red line indicates the configured gas threshold for easy comparison against actual readings.',
            pageWidth - 30
        );
        doc.text(chartDescription, 15, y);
        y += chartDescription.length * 5 + 5;

        y = drawHistoricalChart(doc, gasInfo.readings, gasInfo.threshold, y, pageWidth, pageHeight);

        y += 5;
        doc.setFontSize(11);
        doc.setTextColor(0, 100, 0);
        doc.setFont(undefined, 'bold');
        doc.text(`${gasInfo.gasName} - Complete Historical Data`, 15, y);
        y += 6;

        doc.setFillColor(0, 150, 0);
        doc.rect(15, y, pageWidth - 30, 8, 'F');

        doc.setFontSize(9);
        doc.setTextColor(255, 255, 255);
        doc.setFont(undefined, 'bold');
        doc.text('Date & Time', 18, y + 6);
        doc.text('Value (ppm)', 80, y + 6);
        doc.text('Location', 120, y + 6);

        y += 8;

        let rowIndex = 0;
        const sortedReadings = [...gasInfo.readings].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        sortedReadings.forEach(reading => {
            if (y > pageHeight - 30) {
                doc.addPage();
                y = 20;
            }

            if (rowIndex % 2 === 0) {
                doc.setFillColor(245, 245, 245);
                doc.rect(15, y, pageWidth - 30, 8, 'F');
            }

            doc.setFontSize(8);
            doc.setTextColor(0, 0, 0);
            doc.setFont(undefined, 'normal');
            doc.text(new Date(reading.timestamp).toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            }), 18, y + 6);
            doc.text((reading.value_ppm || 0).toFixed(1), 80, y + 6);
            doc.text(formatLocationPlain(reading.location), 120, y + 6);

            y += 8;
            rowIndex++;
        });

        y += 10;
    });

    return y;
}

function drawHistoricalChart(doc, readings, threshold, yStart, pageWidth, pageHeight) {
    let y = yStart;

    if (y > pageHeight - 80) {
        doc.addPage();
        y = 20;
    }

    const chartHeight = 60;
    const chartWidth = pageWidth - 40;
    const chartX = 20;
    const chartY = y;

    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.5);
    doc.rect(chartX, chartY, chartWidth, chartHeight);

    doc.setFillColor(250, 250, 250);
    doc.rect(chartX, chartY, chartWidth, chartHeight, 'F');
    doc.rect(chartX, chartY, chartWidth, chartHeight);

    if (readings.length === 0) {
        doc.setFontSize(10);
        doc.setTextColor(150, 150, 150);
        doc.text('No historical data available', chartX + chartWidth / 2, chartY + chartHeight / 2, { align: 'center' });
        return y + chartHeight + 5;
    }

    const values = readings.map(r => r.value_ppm);
    const maxValue = Math.max(...values, threshold) * 1.1;
    const minValue = 0;

    const GAP_THRESHOLD_MS = 60 * 60 * 1000;

    doc.setDrawColor(0, 200, 0);
    doc.setLineWidth(1);

    for (let i = 0; i < readings.length - 1; i++) {
        const current = readings[i];
        const next = readings[i + 1];

        const currentTimestamp = new Date(current.timestamp).getTime();
        const nextTimestamp = new Date(next.timestamp).getTime();
        const timeDiff = nextTimestamp - currentTimestamp;

        if (timeDiff > GAP_THRESHOLD_MS) {
            continue;
        }

        const x1 = chartX + (i / (readings.length - 1)) * chartWidth;
        const y1 = chartY + chartHeight - ((current.value_ppm - minValue) / (maxValue - minValue)) * chartHeight;

        const x2 = chartX + ((i + 1) / (readings.length - 1)) * chartWidth;
        const y2 = chartY + chartHeight - ((next.value_ppm - minValue) / (maxValue - minValue)) * chartHeight;

        doc.line(x1, y1, x2, y2);
    }

    doc.setDrawColor(255, 0, 0);
    doc.setLineWidth(0.8);
    const thresholdY = chartY + chartHeight - ((threshold - minValue) / (maxValue - minValue)) * chartHeight;
    doc.setLineDash([2, 2]);
    doc.line(chartX, thresholdY, chartX + chartWidth, thresholdY);
    doc.setLineDash([]);

    doc.setFontSize(7);
    doc.setTextColor(255, 0, 0);
    doc.text(`Threshold: ${threshold} ppm`, chartX + chartWidth - 2, thresholdY - 2, { align: 'right' });

    doc.setFontSize(7);
    doc.setTextColor(100, 100, 100);
    doc.text('0', chartX - 3, chartY + chartHeight + 2, { align: 'right' });
    doc.text(maxValue.toFixed(0), chartX - 3, chartY + 5, { align: 'right' });

    doc.setFontSize(7);
    doc.setTextColor(80, 80, 80);
    if (readings.length > 0) {
        const firstDate = new Date(readings[0].timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const lastDate = new Date(readings[readings.length - 1].timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        doc.text(firstDate, chartX, chartY + chartHeight + 5);
        doc.text(lastDate, chartX + chartWidth, chartY + chartHeight + 5, { align: 'right' });
    }

    y = chartY + chartHeight + 8;

    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text(`Total Readings: ${readings.length} | Range: ${Math.min(...values).toFixed(1)} - ${Math.max(...values).toFixed(1)} ppm`, chartX, y);

    return y + 5;
}

function addAlertsSection(doc, yStart, pageWidth, pageHeight) {
    let y = yStart;

    if (y > pageHeight - 80) {
        doc.addPage();
        y = 20;
    }

    doc.setFontSize(14);
    doc.setTextColor(0, 150, 0);
    doc.setFont(undefined, 'bold');
    doc.text('Recent Alerts', 15, y);
    y += 8;

    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    doc.setFont(undefined, 'normal');
    const description = doc.splitTextToSize(
        'This section lists all recent alerts generated by the gas monitoring system. It highlights readings that exceeded threshold values and indicates the location and time of the alert.',
        pageWidth - 30
    );
    doc.text(description, 15, y);
    y += description.length * 5;

    const recentAlerts = [];
    Object.entries(gasData).forEach(([gasId, gas]) => {
        if (gas.alerts) {
            Object.values(gas.alerts).forEach(alert => {
                recentAlerts.push({
                    gasName: gas.config?.gas_name || gasId,
                    threshold: gas.config?.threshold || 0,
                    ...alert
                });
            });
        }
    });

    recentAlerts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const topAlerts = recentAlerts.slice(0, 10);

    y += 3;
    doc.setFillColor(0, 150, 0);
    doc.rect(15, y, pageWidth - 30, 8, 'F');

    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.setFont(undefined, 'bold');
    doc.text('Gas', 18, y + 6);
    doc.text('Value (ppm)', 55, y + 6);
    doc.text('Threshold (ppm)', 95, y + 6);
    doc.text('Location', 140, y + 6);
    doc.text('Timestamp', 170, y + 6);

    y += 8;

    let rowIndex = 0;
    topAlerts.forEach(alert => {
        if (y > pageHeight - 30) {
            doc.addPage();
            y = 20;
        }

        if (rowIndex % 2 === 0) {
            doc.setFillColor(245, 245, 245);
        } else {
            doc.setFillColor(255, 255, 255);
        }
        doc.rect(15, y, pageWidth - 30, 10, 'F');

        doc.setFontSize(9);
        doc.setTextColor(0, 0, 0);
        doc.setFont(undefined, 'normal');
        doc.text(alert.gasName || 'Unknown', 18, y + 6);
        doc.text((alert.value_ppm || 0).toFixed(1), 55, y + 6);
        doc.text((alert.threshold || 0).toFixed(1), 95, y + 6);
        doc.text(formatLocationPlain(alert.location), 140, y + 6);
        doc.text(new Date(alert.timestamp).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }), 170, y + 6);

        y += 10;
        rowIndex++;
    });

    return y + 10;
}
