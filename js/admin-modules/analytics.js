
import { db } from './firebase-init.js';
import { collection, getDocs, orderBy, limit, query } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// ===========================
// ENHANCED ANALYTICS DASHBOARD
// ===========================

// Load Enhanced Dashboard Metrics
export async function loadEnhancedDashboard() {
    try {
        // Calculate Average Customer Lifetime Value (CLV)
        const customersSnapshot = await getDocs(collection(db, 'customerAnalytics'));
        let totalCLV = 0;
        let customerCount = 0;
        const segmentCounts = { VIP: 0, Frequent: 0, Regular: 0, New: 0, AtRisk: 0 };

        customersSnapshot.forEach(doc => {
            const data = doc.data();
            totalCLV += data.totalSpent || 0;
            customerCount++;
            const segment = data.segment || 'New';
            if (segmentCounts[segment] !== undefined) {
                segmentCounts[segment]++;
            }
        });

        const avgCLV = customerCount > 0 ? Math.round(totalCLV / customerCount) : 0;

        // Update CLV display if element exists
        const clvElement = document.getElementById('avg-clv');
        if (clvElement) {
            clvElement.textContent = `₹${avgCLV.toLocaleString('en-IN')}`;
        }

        // console.log(`📊 Analytics: ${customerCount} customers, Avg CLV: ₹${avgCLV}`);

    } catch (error) {
        console.error('Error loading enhanced dashboard:', error);
    }
}

// Load Customer Segmentation Chart
export function renderCustomerSegmentationChart() {
    const chartElement = document.getElementById('segmentationChart');
    if (!chartElement) return;

    getDocs(collection(db, 'customerAnalytics')).then(snapshot => {
        const segments = { VIP: 0, Frequent: 0, Regular: 0, New: 0, 'At Risk': 0 };

        snapshot.forEach(doc => {
            const segment = doc.data().segment || 'New';
            const displaySegment = segment === 'AtRisk' ? 'At Risk' : segment;
            if (segments[displaySegment] !== undefined) {
                segments[displaySegment]++;
            }
        });

        if (window.Chart) {
            const ctx = chartElement.getContext('2d');
            new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: Object.keys(segments),
                    datasets: [{
                        data: Object.values(segments),
                        backgroundColor: [
                            '#9b59b6',  // VIP - Purple
                            '#3498db',  // Frequent - Blue
                            '#2ecc71',  // Regular - Green
                            '#95a5a6',  // New - Gray
                            '#e74c3c'   // At Risk - Red
                        ]
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        legend: { position: 'bottom' },
                        title: { display: true, text: 'Customer Distribution by Segment' }
                    }
                }
            });
        }
    }).catch(error => {
        console.error('Error rendering segmentation chart:', error);
    });
}

// Load Top Customers by CLV
export async function loadTopCustomers() {
    const containerElement = document.getElementById('top-customers-list');
    if (!containerElement) return;

    try {
        const q = query(collection(db, 'customerAnalytics'), orderBy('totalSpent', 'desc'), limit(10));
        const topCustomersSnapshot = await getDocs(q);

        if (topCustomersSnapshot.empty) {
            containerElement.innerHTML = '<p style="color:#666; padding:20px; text-align:center;">No customer data yet</p>';
            return;
        }

        let html = '<div class="top-customers-list" style="display:flex; flex-direction:column; gap:10px;">';

        let index = 0;
        topCustomersSnapshot.forEach((doc) => {
            index++;
            const customer = doc.data();
            const segmentColor = {
                'VIP': '#9b59b6',
                'Frequent': '#3498db',
                'Regular': '#2ecc71',
                'New': '#95a5a6',
                'AtRisk': '#e74c3c'
            }[customer.segment] || '#95a5a6';

            html += `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:10px; background:#f8f9fa; border-radius:6px; border-left:4px solid ${segmentColor};">
                    <div>
                        <div style="font-weight:600;">${index}. ${customer.name || customer.phone}</div>
                        <div style="font-size:0.85rem; color:#666;">${customer.totalOrders || 0} orders • ${customer.segment || 'New'}</div>
                    </div>
                    <div style="font-weight:700; color:#2ecc71;">₹${(customer.totalSpent || 0).toLocaleString('en-IN')}</div>
                </div>
            `;
        });

        html += '</div>';
        containerElement.innerHTML = html;

    } catch (error) {
        console.error('Error loading top customers:', error);
        containerElement.innerHTML = '<p style="color:#e74c3c;">Error loading data</p>';
    }
}

// Load Product Performance Table
export async function loadProductPerformance() {
    const tbodyElement = document.getElementById('product-performance-body');
    if (!tbodyElement) return;

    try {
        const q = query(collection(db, 'productAnalytics'), orderBy('last30DaysRevenue', 'desc'), limit(20));
        const productsSnapshot = await getDocs(q);

        if (productsSnapshot.empty) {
            tbodyElement.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#666;">No product data yet. Data will be available after first daily analytics run.</td></tr>';
            return;
        }

        let html = '';
        productsSnapshot.forEach(doc => {
            const product = doc.data();
            const growthClass = (product.growthRate || 0) >= 0 ? 'positive' : 'negative';
            const growthColor = (product.growthRate || 0) >= 0 ? '#2ecc71' : '#e74c3c';

            const revenue = product.last30DaysRevenue || 0;
            const units = product.totalUnitsSold || 0;
            const avgPrice = units > 0 ? Math.round(revenue / units) : 0;

            html += `
                <tr>
                    <td><strong>${product.productName}</strong></td>
                    <td>₹${revenue.toLocaleString('en-IN')}</td>
                    <td>${units}</td>
                    <td>₹${avgPrice.toLocaleString('en-IN')}</td>
                    <td>${product.profitMargin ? product.profitMargin.toFixed(1) + '%' : 'N/A'}</td>
                    <td style="color:${growthColor}; font-weight:600;">
                        ${(product.growthRate || 0) > 0 ? '+' : ''}${(product.growthRate || 0).toFixed(1)}%
                    </td>
                </tr>
            `;
        });

        tbodyElement.innerHTML = html;

    } catch (error) {
        console.error('Error loading product performance:', error);
        tbodyElement.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#e74c3c;">Error loading data</td></tr>';
    }
}

// Render Revenue by Product Chart
export async function renderRevenueByProductChart() {
    const chartElement = document.getElementById('revenueByProductChart');
    if (!chartElement) return;

    try {
        const q = query(collection(db, 'productAnalytics'), orderBy('last30DaysRevenue', 'desc'), limit(10));
        const productsSnapshot = await getDocs(q);

        const labels = [];
        const data = [];

        productsSnapshot.forEach(doc => {
            const product = doc.data();
            labels.push(product.productName);
            data.push(product.last30DaysRevenue || 0);
        });

        if (window.Chart) {
            const ctx = chartElement.getContext('2d');
            new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Revenue (Last 30 Days)',
                        data: data,
                        backgroundColor: '#3498db',
                    }]
                },
                options: {
                    responsive: true,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                callback: function (value) { return '₹' + value.toLocaleString('en-IN'); }
                            }
                        }
                    }
                }
            });
        }

    } catch (error) {
        console.error('Error rendering revenue chart:', error);
    }
}
