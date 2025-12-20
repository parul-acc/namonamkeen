import { db } from './firebase-init.js';
import { collection, query, where, getDocs, orderBy, limit } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { dbg, showToast, safeCall, formatDate } from './utils.js';

let dashboardFilter = 'All';

// --- DASHBOARD INIT ---
export function initDashboard() {
    dbg('Initializing Dashboard...');
    loadDashboardData(dashboardFilter);
    loadLowStockAlerts();
}

export function updateDashboardFilter(val) {
    dashboardFilter = val;
    loadDashboardData(val);
}

// --- DATA FETCHING ---
async function loadDashboardData(timeframe) {
    try {
        const now = new Date();
        let startDate = new Date(0); // Default All Time

        if (timeframe === 'Today') {
            startDate = new Date(); startDate.setHours(0, 0, 0, 0);
        } else if (timeframe === 'Week') {
            startDate = new Date(); startDate.setDate(now.getDate() - 7);
        } else if (timeframe === 'Month') {
            startDate = new Date(); startDate.setMonth(now.getMonth() - 1);
        } else if (timeframe === 'Year') {
            startDate = new Date(); startDate.setFullYear(now.getFullYear() - 1);
        }

        // Fetch Orders
        const q = query(
            collection(db, "orders"),
            where('timestamp', '>=', startDate)
        );
        const snap = await getDocs(q);

        let revenue = 0;
        let count = 0;
        let pending = 0;

        const dailyRevenue = {};
        const paymentStats = { Online: 0, COD: 0 };

        snap.forEach(doc => {
            const o = doc.data();
            if (o.status !== 'Cancelled') {
                revenue += (parseFloat(o.total) || 0);
                count++;

                const dateKey = o.timestamp.toDate().toLocaleDateString('en-IN');
                dailyRevenue[dateKey] = (dailyRevenue[dateKey] || 0) + (parseFloat(o.total) || 0);

                const pMethod = o.paymentMethod === 'COD' ? 'COD' : 'Online';
                paymentStats[pMethod]++;
            }
            if (o.status === 'Pending') pending++;
        });

        document.getElementById('today-rev').innerText = `₹${revenue.toLocaleString()}`;
        document.getElementById('total-orders').innerText = count;
        document.getElementById('pending-count').innerText = pending;
        document.getElementById('avg-order').innerText = count > 0 ? `₹${Math.round(revenue / count)}` : '₹0';

        updateCharts(dailyRevenue, paymentStats);

    } catch (e) {
        console.error("Dashboard Load Error:", e);
        showToast("Failed to load dashboard data", "error");
    }
}

function loadLowStockAlerts() {
    const q = query(collection(db, "restockAlerts"), where("acknowledged", "==", false));
    getDocs(q).then(snap => {
        const list = document.getElementById('low-stock-list');
        const alertBox = document.getElementById('low-stock-alert');
        if (snap.empty) {
            alertBox.style.display = 'none';
        } else {
            alertBox.style.display = 'flex';
            list.innerHTML = '';
            snap.forEach(doc => {
                const d = doc.data();
                list.innerHTML += `<span class="badge badge-warning">${d.productName} (${d.currentStock})</span>`;
            });
        }
    });
}

function updateCharts(revenueMap, paymentStats) {
    const ctxSales = document.getElementById('salesChart');
    if (ctxSales && Chart) {
        if (window.salesChartInstance) window.salesChartInstance.destroy();
        window.salesChartInstance = new Chart(ctxSales, {
            type: 'line',
            data: {
                labels: Object.keys(revenueMap),
                datasets: [{
                    label: 'Revenue (₹)',
                    data: Object.values(revenueMap),
                    borderColor: '#e85d04',
                    tension: 0.4,
                    fill: true,
                    backgroundColor: 'rgba(232, 93, 4, 0.1)'
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }

    const ctxPay = document.getElementById('paymentChart');
    if (ctxPay && Chart) {
        if (window.paymentChartInstance) window.paymentChartInstance.destroy();
        window.paymentChartInstance = new Chart(ctxPay, {
            type: 'doughnut',
            data: {
                labels: Object.keys(paymentStats),
                datasets: [{
                    data: Object.values(paymentStats),
                    backgroundColor: ['#3498db', '#2ecc71']
                }]
            }
        });
    }
}
