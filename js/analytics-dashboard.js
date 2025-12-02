// ===========================
// ENHANCED ANALYTICS DASHBOARD
// ===========================

// Load Enhanced Dashboard Metrics
async function loadEnhancedDashboard() {
    try {
        // Calculate Average Customer Lifetime Value (CLV)
        const customersSnapshot = await db.collection('customerAnalytics').get();
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

        console.log(`📊 Analytics: ${customerCount} customers, Avg CLV: ₹${avgCLV}`);
        console.log('Segments:', segmentCounts);

    } catch (error) {
        console.error('Error loading enhanced dashboard:', error);
    }
}

// Load Customer Segmentation Chart
function renderCustomerSegmentationChart() {
    const chartElement = document.getElementById('segmentationChart');
    if (!chartElement) return;

    db.collection('customerAnalytics').get().then(snapshot => {
        const segments = { VIP: 0, Frequent: 0, Regular: 0, New: 0, 'At Risk': 0 };

        snapshot.forEach(doc => {
            const segment = doc.data().segment || 'New';
            const displaySegment = segment === 'AtRisk' ? 'At Risk' : segment;
            if (segments[displaySegment] !== undefined) {
                segments[displaySegment]++;
            }
        });

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
                    legend: {
                        position: 'bottom'
                    },
                    title: {
                        display: true,
                        text: 'Customer Distribution by Segment'
                    }
                }
            }
        });
    }).catch(error => {
        console.error('Error rendering segmentation chart:', error);
    });
}

// Load Top Customers by CLV
async function loadTopCustomers() {
    const containerElement = document.getElementById('top-customers-list');
    if (!containerElement) return;

    try {
        const topCustomersSnapshot = await db.collection('customerAnalytics')
            .orderBy('totalSpent', 'desc')
            .limit(10)
            .get();

        if (topCustomersSnapshot.empty) {
            containerElement.innerHTML = '<p style="color:#666; padding:20px; text-align:center;">No customer data yet</p>';
            return;
        }

        let html = '<div class="top-customers-list" style="display:flex; flex-direction:column; gap:10px;">';

        topCustomersSnapshot.forEach((doc, index) => {
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
                        <div style="font-weight:600;">${index + 1}. ${customer.name || customer.phone}</div>
                        <div style="font-size:0.85rem; color:#666;">${customer.totalOrders} orders • ${customer.segment}</div>
                    </div>
                    <div style="font-weight:700; color:#2ecc71;">₹${customer.totalSpent.toLocaleString('en-IN')}</div>
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
async function loadProductPerformance() {
    const tbodyElement = document.getElementById('product-performance-body');
    if (!tbodyElement) return;

    try {
        const productsSnapshot = await db.collection('productAnalytics')
            .orderBy('last30DaysRevenue', 'desc')
            .limit(20)
            .get();

        if (productsSnapshot.empty) {
            tbodyElement.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#666;">No product data yet. Data will be available after first daily analytics run.</td></tr>';
            return;
        }

        let html = '';
        productsSnapshot.forEach(doc => {
            const product = doc.data();
            const growthClass = (product.growthRate || 0) >= 0 ? 'positive' : 'negative';
            const growthColor = (product.growthRate || 0) >= 0 ? '#2ecc71' : '#e74c3c';

            html += `
                <tr>
                    <td><strong>${product.productName}</strong></td>
                    <td>₹${(product.last30DaysRevenue || 0).toLocaleString('en-IN')}</td>
                    <td>${product.totalUnitsSold || 0}</td>
                    <td>₹${(product.averagePrice || 0).toLocaleString('en-IN')}</td>
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
async function renderRevenueByProductChart() {
    const chartElement = document.getElementById('revenueByProductChart');
    if (!chartElement) return;

    try {
        const productsSnapshot = await db.collection('productAnalytics')
            .orderBy('last30DaysRevenue', 'desc')
            .limit(10)
            .get();

        const labels = [];
        const data = [];

        productsSnapshot.forEach(doc => {
            const product = doc.data();
            labels.push(product.productName);
            data.push(product.last30DaysRevenue || 0);
        });

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
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function (value) {
                                return '₹' + value.toLocaleString('en-IN');
                            }
                        }
                    }
                }
            }
        });

    } catch (error) {
        console.error('Error rendering revenue chart:', error);
    }
}

// Initialize Analytics on Dashboard Load
if (typeof auth !== 'undefined') {
    auth.onAuthStateChanged(user => {
        if (user && ADMIN_EMAILS.includes(user.email)) {
            // Load analytics when admin is authenticated
            setTimeout(() => {
                loadEnhancedDashboard();
            }, 1000);
        }
    });
}

// Export functions for manual calling
window.loadEnhancedDashboard = loadEnhancedDashboard;
window.renderCustomerSegmentationChart = renderCustomerSegmentationChart;
window.loadTopCustomers = loadTopCustomers;
window.loadProductPerformance = loadProductPerformance;
window.renderRevenueByProductChart = renderRevenueByProductChart;
