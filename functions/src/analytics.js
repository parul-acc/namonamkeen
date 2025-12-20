const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");
const { emailSender, emailPassword, emailAdmin } = require("./config");

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: emailSender.value(),
        pass: emailPassword.value()
    },
});

// --- FUNCTION 7: Update Customer Analytics ---
exports.updateCustomerAnalytics = functions.firestore
    .document('orders/{orderId}')
    .onCreate(async (snap, context) => {
        const order = snap.data();
        const customerId = order.userPhone || order.userId;
        if (!customerId) return null;

        const customerRef = admin.firestore().collection('customerAnalytics').doc(customerId);
        const customerSnap = await customerRef.get();

        if (!customerSnap.exists) {
            await customerRef.set({
                userId: customerId,
                phone: order.userPhone,
                name: order.customerName || null,
                totalOrders: 1,
                totalSpent: order.total,
                averageOrderValue: order.total,
                firstOrderDate: order.timestamp,
                lastOrderDate: order.timestamp,
                segment: 'New',
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        } else {
            const data = customerSnap.data();
            const newTotalOrders = data.totalOrders + 1;
            const newTotalSpent = data.totalSpent + order.total;
            await customerRef.update({
                totalOrders: newTotalOrders,
                totalSpent: newTotalSpent,
                averageOrderValue: newTotalSpent / newTotalOrders,
                lastOrderDate: order.timestamp,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        }
        return null;
    });

// --- FUNCTION 8: Daily Product Analytics ---
exports.dailyProductAnalytics = functions.pubsub
    .schedule('every day 02:00')
    .timeZone('Asia/Kolkata')
    .onRun(async (context) => {
        const db = admin.firestore();
        const now = new Date();

        // Define Time Ranges
        const day30 = new Date(now); day30.setDate(day30.getDate() - 30);
        const day60 = new Date(now); day60.setDate(day60.getDate() - 60);

        // Fetch Orders from Last 60 Days (to calculate growth)
        const ordersSnapshot = await db.collection('orders')
            .where('timestamp', '>=', day60)
            .get();

        const productStats = {};

        ordersSnapshot.forEach(doc => {
            const order = doc.data();
            // Skip cancelled orders if necessary
            if (order.status === 'Cancelled') return;

            const orderDate = order.timestamp.toDate();

            // Determine Period
            const isCurrentPeriod = orderDate >= day30; // Last 30 days
            const isPreviousPeriod = orderDate < day30 && orderDate >= day60; // 30-60 days ago

            if (order.items && Array.isArray(order.items)) {
                order.items.forEach(item => {
                    if (!item.productId) return;

                    if (!productStats[item.productId]) {
                        productStats[item.productId] = {
                            productId: item.productId,
                            productName: item.name,
                            currentRevenue: 0,
                            prevRevenue: 0,
                            totalUnitsSold: 0
                        };
                    }

                    const amount = (item.price * item.qty);

                    if (isCurrentPeriod) {
                        productStats[item.productId].currentRevenue += amount;
                        productStats[item.productId].totalUnitsSold += item.qty;
                    } else if (isPreviousPeriod) {
                        productStats[item.productId].prevRevenue += amount;
                    }
                });
            }
        });

        const batch = db.batch();

        Object.values(productStats).forEach(stats => {
            const docRef = db.collection('productAnalytics').doc(String(stats.productId));

            // 1. Calculate Average Price
            const avgPrice = stats.totalUnitsSold > 0
                ? (stats.currentRevenue / stats.totalUnitsSold)
                : 0;

            // 2. Calculate Growth Rate
            let growthRate = 0;
            if (stats.prevRevenue > 0) {
                growthRate = ((stats.currentRevenue - stats.prevRevenue) / stats.prevRevenue) * 100;
            } else if (stats.currentRevenue > 0) {
                growthRate = 100; // 100% growth if no previous revenue
            }

            batch.set(docRef, {
                productId: stats.productId,
                productName: stats.productName,
                totalUnitsSold: stats.totalUnitsSold,
                last30DaysRevenue: stats.currentRevenue,
                averagePrice: avgPrice,
                growthRate: growthRate,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        });

        await batch.commit();
        return null;
    });

// --- FUNCTION 11: Daily Report ---
exports.dailyReport = functions.pubsub.schedule('every day 08:00')
    .timeZone('Asia/Kolkata') // Set your timezone
    .onRun(async (context) => {

        try {
            const db = admin.firestore();

            // 1. Calculate Date Range (Yesterday)
            const now = new Date();
            const yesterday = new Date(now);
            yesterday.setDate(yesterday.getDate() - 1);

            // Start of yesterday (00:00:00)
            const start = new Date(yesterday);
            start.setHours(0, 0, 0, 0);

            // End of yesterday (23:59:59)
            const end = new Date(yesterday);
            end.setHours(23, 59, 59, 999);

            // 2. Fetch Orders
            const snapshot = await db.collection('orders')
                .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(start))
                .where('createdAt', '<=', admin.firestore.Timestamp.fromDate(end))
                .get();

            // 3. Process Data
            let totalRevenue = 0;
            let totalOrders = 0;
            let deliveredCount = 0;
            let productSales = {}; // Map to track quantity per product

            snapshot.forEach(doc => {
                const order = doc.data();
                totalOrders++;
                totalRevenue += (parseFloat(order.total) || 0);

                if (order.status === 'Delivered') deliveredCount++;

                // Track Product Sales (assuming order.items is an array)
                if (order.items && Array.isArray(order.items)) {
                    order.items.forEach(item => {
                        const name = item.name || 'Unknown Item';
                        const qty = parseInt(item.qty || 1);
                        if (!productSales[name]) productSales[name] = 0;
                        productSales[name] += qty;
                    });
                }
            });

            // Sort Top Products
            const sortedProducts = Object.entries(productSales)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 5); // Get top 5 items

            // 4. Generate HTML Template
            const dateStr = yesterday.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

            const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
            <div style="background-color: #2c3e50; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0;">
                <h1 style="margin: 0; font-size: 24px;">Daily Sales Report</h1>
                <p style="margin: 5px 0 0 0; opacity: 0.8;">${dateStr}</p>
            </div>
            
            <div style="background-color: white; padding: 20px; border: 1px solid #ddd; border-top: none;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 20px;">
                    <div style="text-align: center; flex: 1; border-right: 1px solid #eee;">
                        <div style="font-size: 12px; color: #7f8c8d;">TOTAL REVENUE</div>
                        <div style="font-size: 20px; font-weight: bold; color: #27ae60;">₹${totalRevenue.toLocaleString('en-IN')}</div>
                    </div>
                    <div style="text-align: center; flex: 1; border-right: 1px solid #eee;">
                        <div style="font-size: 12px; color: #7f8c8d;">TOTAL ORDERS</div>
                        <div style="font-size: 20px; font-weight: bold; color: #2980b9;">${totalOrders}</div>
                    </div>
                    <div style="text-align: center; flex: 1;">
                        <div style="font-size: 12px; color: #7f8c8d;">AVG VALUE</div>
                        <div style="font-size: 20px; font-weight: bold; color: #8e44ad;">₹${totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0}</div>
                    </div>
                </div>

                <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">

                <h3 style="margin-top: 0; color: #34495e;">Top Selling Items</h3>
                <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                    <thead>
                        <tr style="background-color: #f2f2f2; text-align: left;">
                            <th style="padding: 10px; border-bottom: 2px solid #ddd;">Product Name</th>
                            <th style="padding: 10px; border-bottom: 2px solid #ddd; text-align: right;">Qty Sold</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${sortedProducts.map(([name, qty]) => `
                        <tr>
                            <td style="padding: 10px; border-bottom: 1px solid #eee;">${name}</td>
                            <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">${qty}</td>
                        </tr>
                        `).join('')}
                        ${sortedProducts.length === 0 ? '<tr><td colspan="2" style="padding:10px; text-align:center; color:#999;">No items sold yesterday</td></tr>' : ''}
                    </tbody>
                </table>
            </div>
            
            <div style="text-align: center; font-size: 11px; color: #999; margin-top: 10px;">
                Generated automatically by Namo Namkeen Admin Panel
            </div>
        </div>
        `;

            // 5. Send Email
            const mailOptions = {
                from: `"Namo Admin" <${emailSender.value()}>`, // Match the auth user
                to: emailAdmin.value(),
                subject: `Daily Report: ₹${totalRevenue} - ${dateStr}`,
                html: htmlContent
            };

            await transporter.sendMail(mailOptions);
            console.log('Daily report sent successfully');
            return null;

        } catch (error) {
            console.error('Error sending daily report:', error);
            return null;
        }
    });

// --- FUNCTION 12: Generate Custom Report ---
exports.generateReport = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Auth required');
    const { startDate, endDate, type } = data;
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const ordersSnap = await admin.firestore().collection('orders')
        .where('timestamp', '>=', start)
        .where('timestamp', '<', end)
        .get();

    let revenue = 0;
    ordersSnap.forEach(doc => {
        const o = doc.data();
        if (o.status !== 'Cancelled') revenue += o.total || 0;
    });

    return {
        financials: { revenue, totalExpenses: 0, netProfit: revenue, expenses: {} },
        marketing: { newCustomers: 0, marketingSpend: 0, cac: 0 },
        inventory: { topProducts: [] },
        chartData: {}
    };
});

// --- FUNCTION 14: Email Custom Report ---
exports.sendCustomReportEmail = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Auth required');

    const { reportData } = data;
    const { startDate, endDate, type } = reportData.meta;

    const startStr = new Date(startDate).toLocaleDateString('en-IN');
    const endStr = new Date(endDate).toLocaleDateString('en-IN');

    // Build Email HTML based on Report Type
    let detailsHtml = '';

    if (type === 'inventory') {
        detailsHtml = `
            <h3>Top Selling Products</h3>
            <table style="width:100%; border-collapse:collapse; text-align:left;">
                <tr style="background:#eee;">
                    <th style="padding:8px;">Product</th>
                    <th style="padding:8px;">Units Sold</th>
                </tr>
                ${reportData.inventory.topProducts.map(p => `
                    <tr>
                        <td style="padding:8px; border-bottom:1px solid #ddd;">${p[0]}</td>
                        <td style="padding:8px; border-bottom:1px solid #ddd;">${p[1]}</td>
                    </tr>
                `).join('')}
            </table>`;
    } else {
        // Financials Table
        detailsHtml = `
            <h3>Expense Breakdown</h3>
            <table style="width:100%; border-collapse:collapse; text-align:left;">
                <tr style="background:#eee;">
                    <th style="padding:8px;">Category</th>
                    <th style="padding:8px;">Amount</th>
                </tr>
                ${Object.entries(reportData.financials.expenses).map(([cat, amt]) => `
                    <tr>
                        <td style="padding:8px; border-bottom:1px solid #ddd;">${cat}</td>
                        <td style="padding:8px; border-bottom:1px solid #ddd;">₹${amt.toLocaleString()}</td>
                    </tr>
                `).join('')}
            </table>`;
    }

    const htmlContent = `
        <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; padding: 20px;">
            <div style="text-align: center; border-bottom: 2px solid #e85d04; padding-bottom: 10px; margin-bottom: 20px;">
                <h2 style="color: #e85d04; margin: 0;">Namo Admin Report</h2>
                <p style="color: #666; margin: 5px 0;">${type.toUpperCase()}</p>
                <p style="font-size: 0.9em; color: #888;">${startStr} to ${endStr}</p>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px;">
                <div style="background: #f9f9f9; padding: 10px; border-radius: 5px;">
                    <strong style="display:block; color:#666; font-size:0.8em;">REVENUE</strong>
                    <span style="font-size: 1.2em; color: #27ae60;">₹${reportData.financials.revenue.toLocaleString()}</span>
                </div>
                <div style="background: #f9f9f9; padding: 10px; border-radius: 5px;">
                    <strong style="display:block; color:#666; font-size:0.8em;">NET PROFIT</strong>
                    <span style="font-size: 1.2em; color: #2c3e50;">₹${reportData.financials.netProfit.toLocaleString()}</span>
                </div>
            </div>

            ${detailsHtml}

            <div style="margin-top: 30px; font-size: 0.8em; color: #999; text-align: center;">
                Generated by Admin Panel on ${new Date().toLocaleString('en-IN')}
            </div>
        </div>
    `;

    try {
        await transporter.sendMail({
            from: `"Namo Reporting" <${emailSender.value()}>`,
            to: emailAdmin.value(),
            subject: `📊 ${type} Report (${startStr} - ${endStr})`,
            html: htmlContent
        });
        return { success: true };
    } catch (error) {
        console.error("Email Error:", error);
        throw new functions.https.HttpsError('internal', 'Failed to send email');
    }
});
