// ===========================
// LOW STOCK ALERTS UI FUNCTIONS
// ===========================

// Load and Display Low Stock Alerts
async function loadStockAlerts() {
    const alertsList = document.getElementById('stock-alerts-list');
    const dashboardAlert = document.getElementById('low-stock-alert');
    const dashboardList = document.getElementById('low-stock-list');

    if (!alertsList) return;

    alertsList.innerHTML = '<p style="color:#666; text-align:center;">Loading...</p>';

    try {
        const alertsSnapshot = await db.collection('restockAlerts')
            .where('acknowledged', '==', false)
            .orderBy('createdAt', 'desc')
            .limit(20)
            .get();

        if (alertsSnapshot.empty) {
            alertsList.innerHTML = '<p style="color:#666; text-align:center;">No pending alerts 🎉</p>';
            if (dashboardAlert) dashboardAlert.style.display = 'none';
            return;
        }

        // Render alerts in inventory section
        let alertsHTML = '';
        const dashboardItems = [];

        alertsSnapshot.forEach(doc => {
            const alert = doc.data();
            const isCritical = alert.alertType === 'criticalStock';
            const bgColor = isCritical ? '#ffebee' : '#fff8e1';
            const textColor = isCritical ? '#c62828' : '#e65100';
            const icon = isCritical ? 'fas fa-exclamation-circle' : 'fas fa-exclamation-triangle';

            alertsHTML += `
                <div style="background:${bgColor}; border-left:4px solid ${textColor}; padding:12px; margin-bottom:10px; border-radius:6px; display:flex; justify-content:space-between; align-items:center;">
                    <div style="flex:1;">
                        <div style="display:flex; align-items:center; gap:8px; margin-bottom:5px;">
                            <i class="${icon}" style="color:${textColor}; font-size:1.1rem;"></i>
                            <strong style="color:${textColor};">${alert.productName}</strong>
                            <span style="background:${textColor}; color:white; padding:2px 8px; border-radius:12px; font-size:0.75rem; font-weight:700;">
                                ${alert.currentStock} ${alert.unit || 'units'} left
                            </span>
                        </div>
                        <p style=" margin:0; font-size:0.85rem; color:#666;">
                            ${isCritical ? '🚨 Critical - Restock Urgently' : '⚠️ Low Stock - Action Needed'}
                        </p>
                    </div>
                    <button class="btn btn-sm" onclick="acknowledgeAlert('${doc.id}')" 
                            style="background:white; border:1px solid ${textColor}; color:${textColor}; padding:6px 12px; font-size:0.85rem;">
                        <i class="fas fa-check"></i> Acknowledge
                    </button>
                </div>
            `;

            dashboardItems.push({ name: alert.productName, stock: alert.currentStock, isCritical });
        });

        alertsList.innerHTML = alertsHTML;

        // Show on dashboard if there are alerts
        if (dashboardAlert && dashboardList && dashboardItems.length > 0) {
            dashboardAlert.style.display = 'block';
            dashboardList.innerHTML = dashboardItems
                .slice(0, 5)  // Show max 5 on dashboard
                .map(item => `
                    <span style="background:${item.isCritical ? '#e74c3c' : '#f39c12'}; color:white; padding:8px 12px; border-radius:6px; font-size:0.9rem; font-weight:600;">
                        ${item.name} (${item.stock} left)
                    </span>
                `).join('');
        }

    } catch (error) {
        console.error('Error loading stock alerts:', error);
        alertsList.innerHTML = '<p style="color:#e74c3c;">Error loading alerts</p>';
    }
}

// Acknowledge an Alert
async function acknowledgeAlert(alertId) {
    const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (isDev) console.log('Acknowledging alert:', alertId);

    try {
        await db.collection('restockAlerts').doc(alertId).update({
            acknowledged: true,
            acknowledgedAt: firebase.firestore.FieldValue.serverTimestamp(),
            acknowledgedBy: auth.currentUser?.email || 'admin'
        });

        showToast('Alert acknowledged', 'success');
        loadStockAlerts(); // Reload alerts

    } catch (error) {
        console.error('Error acknowledging alert:', error);
        showToast('Failed to acknowledge alert', 'error');
    }
}

// Call this on dashboard load
if (typeof initDashboard !== 'undefined') {
    const originalInitDashboard = initDashboard;
    initDashboard = function () {
        originalInitDashboard();
        loadStockAlerts();
    };
} else {
    // If initDashboard doesn't exist, create it
    function initDashboard() {
        loadStockAlerts();
    }
}
