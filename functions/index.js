const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");
const Razorpay = require("razorpay");
const { defineString } = require("firebase-functions/params");

admin.initializeApp();

// --- CONFIGURATION (Environment Parameters) ---
const emailSender = defineString("EMAIL_SENDER", { default: "namonamkeens@gmail.com" });
const emailPassword = defineString("EMAIL_PASSWORD");
const emailAdmin = defineString("EMAIL_ADMIN", { default: "parul19.accenture@gmail.com, namonamkeens@gmail.com" });

// Twilio Credentials
const twilioSid = defineString("TWILIO_ACCOUNT_SID");
const twilioToken = defineString("TWILIO_AUTH_TOKEN");
const twilioNumber = defineString("TWILIO_WHATSAPP_NUMBER");

// Razorpay Credentials
const razorpayKeyId = defineString("RAZORPAY_KEY_ID", { default: "" });
const razorpayKeySecret = defineString("RAZORPAY_KEY_SECRET", { default: "" });

// Feature Flag
const enableNotifications = defineString("ENABLE_NOTIFICATIONS", { default: "false" });

// Initialize Transporter
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: emailSender.value(),
        pass: emailPassword.value()
    },
});

// --- FUNCTION 1: Unified Order Notification (Email + WhatsApp) ---
exports.sendOrderConfirmation = functions.firestore
    .document("orders/{orderId}")
    .onCreate(async (snap, context) => {
        const order = snap.data();
        const orderId = context.params.orderId;

        if (enableNotifications.value() !== "true") {
            console.log(`[TEST MODE] Notifications suppressed for Order ${orderId}`);
            return null;
        }

        console.log(`Processing notifications for Order ${orderId}`);

        const userEmail = order.userEmail || "";
        const userPhone = order.userPhone || "";
        const customerName = order.customerName || "Customer";
        const totalAmount = order.totalAmount || 0;
        const address = order.deliveryAddress || "N/A";
        const paymentInfo = order.paymentMethod === "COD" ? "Cash on Delivery" : `Online (${order.razorpayPaymentId || "N/A"})`;

        let itemsHtml = "";
        if (order.items && Array.isArray(order.items)) {
            order.items.forEach(item => {
                itemsHtml += `
                <tr>
                    <td style="padding: 8px; border-bottom: 1px solid #eee;">${item.name}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${item.qty}</td>
                </tr>
            `;
            });
        }

        // --- A. CUSTOMER EMAIL TEMPLATE ---
        const customerEmailHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 10px; overflow: hidden;">
                <div style="background: linear-gradient(135deg, #e85d04 0%, #dc2f02 100%); padding: 30px; text-align: center; color: white;">
                    <h1 style="margin: 0; font-size: 28px;">🎉 Order Confirmed!</h1>
                    <p style="margin: 10px 0 0; font-size: 16px; opacity: 0.9;">Thank you for choosing Namo Namkeen</p>
                </div>
                <div style="padding: 30px; background: white;">
                    <p style="font-size: 16px; color: #333;">Hi <strong>${customerName}</strong>,</p>
                    <p style="color: #666; line-height: 1.6;">Your order has been confirmed and is being prepared with care. We'll notify you once it's on the way!</p>
                    
                    <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                        <h3 style="margin: 0 0 15px 0; color: #e85d04; font-size: 18px;">Order Summary</h3>
                        <p style="margin: 5px 0; color: #555;"><strong>Order ID:</strong> #${orderId}</p>
                        <p style="margin: 5px 0; color: #555;"><strong>Total Amount:</strong> ₹${totalAmount}</p>
                        <p style="margin: 5px 0; color: #555;"><strong>Payment:</strong> ${paymentInfo}</p>
                    </div>

                    <h4 style="color: #333; margin: 25px 0 10px;">Items Ordered:</h4>
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr style="background: #e85d04; color: white;">
                            <th style="padding: 10px; text-align: left;">Item</th>
                            <th style="padding: 10px; text-align: center;">Quantity</th>
                        </tr>
                        ${itemsHtml}
                    </table>

                    <div style="margin-top: 25px; padding: 15px; background: #fff3cd; border-left: 4px solid #ffc107; border-radius: 4px;">
                        <p style="margin: 0; color: #856404; font-size: 14px;">
                            <strong>📍 Delivery Address:</strong><br>${address}
                        </p>
                    </div>
                </div>
                <div style="background-color: #f8f9fa; padding: 20px; text-align: center; font-size: 12px; color: #999;">
                    &copy; Namo Namkeen | Indore's Favorite Snacks
                </div>
            </div>`;

        // --- B. ADMIN EMAIL TEMPLATE ---
        const adminEmailHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #333;">
                <div style="background-color: #333; padding: 15px; color: white; display: flex; justify-content: space-between; align-items: center;">
                    <h2 style="margin: 0;">🚀 New Order Received</h2>
                    <span style="background: #2ecc71; padding: 5px 10px; border-radius: 4px; font-size: 14px; color: white;">#${orderId}</span>
                </div>
                <div style="padding: 20px;">
                    <h3 style="border-bottom: 2px solid #e85d04; padding-bottom: 5px; color: #333;">Customer Details</h3>
                    <p><strong>Name:</strong> ${customerName}</p>
                    <p><strong>Phone:</strong> <a href="tel:${userPhone}" style="color: #e85d04; text-decoration: none;">${userPhone}</a></p>
                    <p><strong>Email:</strong> ${userEmail || 'N/A'}</p>
                    <p><strong>Address:</strong><br>${address}</p>
                    ${order.deliveryNote ? `<p style="background: #ffeb3b; padding: 5px;"><strong>Note:</strong> ${order.deliveryNote}</p>` : ''}

                    <h3 style="border-bottom: 2px solid #e85d04; padding-bottom: 5px; color: #333; margin-top: 20px;">Order Summary</h3>
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr style="background: #eee;">
                            <th style="padding: 8px; text-align: left;">Item</th>
                            <th style="padding: 8px; text-align: center;">Qty</th>
                        </tr>
                        ${itemsHtml}
                    </table>

                    <div style="margin-top: 20px; font-size: 16px;">
                        <p><strong>Payment:</strong> ${paymentInfo}</p>
                        <p><strong>Total Amount:</strong> ₹${totalAmount}</p>
                    </div>
                    
                    <a href="https://wa.me/91${userPhone}" style="display: block; width: 100%; text-align: center; background: #25D366; color: white; padding: 12px; text-decoration: none; border-radius: 5px; margin-top: 20px; font-weight: bold;">
                        Chat on WhatsApp
                    </a>
                </div>
            </div>`;

        const promises = [];

        // A. Send Email to Customer
        if (userEmail && userEmail.includes('@')) {
            promises.push(transporter.sendMail({
                from: `"Namo Namkeen" <${emailSender.value()}>`,
                to: userEmail,
                subject: `Order Confirmed: #${orderId} - Namo Namkeen`,
                html: customerEmailHtml
            }).catch(e => console.error("❌ Customer Email Failed:", e)));
        }

        // B. Send Email to Admin
        promises.push(transporter.sendMail({
            from: `"Namo Bot" <${emailSender.value()}>`,
            to: emailAdmin.value(),
            subject: `🔔 NEW ORDER: #${orderId} (₹${totalAmount})`,
            html: adminEmailHtml
        }).catch(e => console.error("❌ Admin Email Failed:", e)));

        // C. Send WhatsApp to Customer
        if (userPhone && userPhone.length >= 10) {
            try {
                const client = require('twilio')(twilioSid.value(), twilioToken.value());
                const fromNumber = `whatsapp:${twilioNumber.value()}`;
                const toNumber = `whatsapp:+91${userPhone.slice(-10)}`;

                const whatsappBody = `Hi ${customerName}, thanks for ordering from Namo Namkeen! Your Order #${orderId} for ₹${totalAmount} is confirmed. We will notify you when it ships.`;

                promises.push(client.messages.create({
                    from: fromNumber,
                    to: toNumber,
                    body: whatsappBody
                }).catch(e => console.error("❌ WhatsApp Failed:", e)));

            } catch (err) {
                console.error("Twilio Init Error:", err);
            }
        }

        await Promise.all(promises);
        console.log("✅ All notifications processed");
        return { success: true };
    });

// --- FUNCTION 2: Create Secure Payment Order (Razorpay) ---
exports.createPaymentOrder = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Login required.");

    const clientCart = data.cart;
    const discountInfo = data.discount;
    const uid = context.auth.uid;

    // 1. RE-CALCULATE TOTAL (Security)
    let calculatedSubtotal = 0;
    const productPromises = clientCart.map(item =>
        admin.firestore().collection('products').doc(String(item.productId)).get()
    );
    const productSnapshots = await Promise.all(productPromises);

    for (let i = 0; i < clientCart.length; i++) {
        const cartItem = clientCart[i];
        const productDoc = productSnapshots[i];
        if (!productDoc.exists) throw new functions.https.HttpsError("invalid-argument", "Product not found");

        const productData = productDoc.data();
        let realPrice = productData.price;
        if (productData.variants) {
            const variant = productData.variants.find(v => v.weight === cartItem.weight);
            if (variant) realPrice = variant.price;
        }
        calculatedSubtotal += (realPrice * cartItem.qty);
    }

    // 2. Discounts & Shipping
    let discountAmount = 0;
    if (discountInfo && discountInfo.value > 0) {
        if (discountInfo.type === 'percent') discountAmount = Math.round(calculatedSubtotal * (discountInfo.value / 100));
        else discountAmount = discountInfo.value;
    }
    const finalSubtotal = Math.max(0, calculatedSubtotal - discountAmount);

    const configDoc = await admin.firestore().collection('settings').doc('config').get();
    const config = configDoc.data() || {};
    const shipping = (calculatedSubtotal >= (config.freeShippingThreshold || 250)) ? 0 : (config.deliveryCharge || 50);
    const finalTotal = finalSubtotal + shipping;

    // 3. RAZORPAY INIT
    // Fallback to process.env for emulator/local testing
    const rzpKeyId = razorpayKeyId.value() || process.env.RAZORPAY_KEY_ID;
    const rzpKeySecret = razorpayKeySecret.value() || process.env.RAZORPAY_KEY_SECRET;

    const Razorpay = require('razorpay');
    const razorpay = new Razorpay({ key_id: rzpKeyId, key_secret: rzpKeySecret });

    // 4. CUSTOMER MANAGEMENT (For Saved Cards)
    let customerId = null;
    const userRef = admin.firestore().collection('users').doc(uid);
    const userDoc = await userRef.get();
    const userData = userDoc.data();

    if (userData.razorpayCustomerId) {
        customerId = userData.razorpayCustomerId;
    } else {
        try {
            const customer = await razorpay.customers.create({
                name: userData.name || 'Namo Customer',
                contact: userData.phone ? userData.phone.replace('+91', '') : '',
                email: userData.email || 'guest@namo.com'
            });
            customerId = customer.id;
            await userRef.update({ razorpayCustomerId: customerId });
        } catch (e) {
            console.error("Razorpay Customer Creation Failed", e);
        }
    }

    // 5. CREATE ORDER
    try {
        const order = await razorpay.orders.create({
            amount: Math.round(finalTotal * 100),
            currency: "INR",
            receipt: "ord_" + Date.now(),
            payment_capture: 1
        });

        return {
            id: order.id,
            amount: order.amount,
            key: rzpKeyId,
            customerId: customerId,
            userContact: userData.phone || '',
            userEmail: userData.email || ''
        };
    } catch (error) {
        throw new functions.https.HttpsError("internal", error.message);
    }
});

// --- FUNCTION 3: Send WhatsApp OTP ---
exports.sendWhatsAppOTP = functions.https.onCall(async (data, context) => {
    const { phoneNumber } = data;
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    try {
        const client = require('twilio')(twilioSid.value(), twilioToken.value());
        const fromNumber = `whatsapp:${twilioNumber.value()}`;
        const toNumber = `whatsapp:+91${phoneNumber}`;

        const messageBody = `${otp} is your verification code. For your security, do not share this code.`;

        await client.messages.create({
            from: fromNumber,
            to: toNumber,
            body: messageBody
        });

        await admin.firestore().collection('otps').doc(phoneNumber).set({
            otp: otp,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            expiresAt: new Date(Date.now() + 5 * 60 * 1000)
        });

        return { success: true };
    } catch (error) {
        console.error("Twilio OTP Error:", error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

// --- FUNCTION 4: Verify WhatsApp OTP ---
exports.verifyWhatsAppOTP = functions.https.onCall(async (data, context) => {
    const { phoneNumber, otp } = data;

    try {
        const otpDoc = await admin.firestore().collection('otps').doc(phoneNumber).get();

        if (!otpDoc.exists) throw new functions.https.HttpsError('not-found', 'OTP not found');

        const otpData = otpDoc.data();
        if (new Date() > otpData.expiresAt.toDate()) {
            await otpDoc.ref.delete();
            throw new functions.https.HttpsError('deadline-exceeded', 'OTP expired');
        }

        if (otpData.otp !== otp) throw new functions.https.HttpsError('invalid-argument', 'Invalid OTP');

        const customToken = await admin.auth().createCustomToken(phoneNumber);
        await otpDoc.ref.delete();

        return { token: customToken, phoneNumber };
    } catch (error) {
        console.error("Verify Error:", error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

// =====================================================
// INVENTORY MANAGEMENT FUNCTIONS
// =====================================================

// --- FUNCTION 5: Monitor Low Stock ---
exports.monitorLowStock = functions.firestore
    .document('inventory/{productId}')
    .onUpdate(async (change, context) => {
        const newData = change.after.data();
        const oldData = change.before.data();

        if (newData.stock === oldData.stock) return null;

        const productId = context.params.productId;
        const lowThreshold = newData.lowStockThreshold || 5;
        const restockThreshold = newData.restockThreshold || 3;

        if (newData.stock <= lowThreshold && oldData.stock > lowThreshold) {
            await admin.firestore().collection('restockAlerts').add({
                productId: productId,
                productName: newData.name,
                currentStock: newData.stock,
                threshold: lowThreshold,
                alertType: newData.stock <= restockThreshold ? 'criticalStock' : 'lowStock',
                emailSent: true,
                sentAt: admin.firestore.FieldValue.serverTimestamp(),
                acknowledged: false,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
            await sendLowStockEmail(newData, productId);
        }
        await logStockChange({
            productId: productId,
            productName: newData.name,
            previousStock: oldData.stock,
            newStock: newData.stock,
            quantity: newData.stock - oldData.stock,
            changeType: newData.stock < oldData.stock ? 'sale' : 'restock',
            reason: 'Stock updated in admin',
            performedBy: 'admin'
        });

        return null;
    });

async function sendLowStockEmail(product, productId) {
    const isCritical = product.stock <= (product.restockThreshold || 3);
    const emailHtml = `
        <div>
            <h2>${isCritical ? '🚨 CRITICAL' : '⚡'} Low Stock Alert</h2>
            <p>Product: ${product.name}</p>
            <p>Current Stock: ${product.stock}</p>
        </div>
    `;
    try {
        await transporter.sendMail({
            from: `"Namo Inventory" <${emailSender.value()}>`,
            to: emailAdmin.value(),
            subject: `Low Stock: ${product.name}`,
            html: emailHtml
        });
    } catch (error) {
        console.error('Failed to send low stock email:', error);
    }
}

async function logStockChange(data) {
    try {
        await admin.firestore().collection('stockHistory').add({
            ...data,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
    } catch (error) {
        console.error('Failed to log stock history:', error);
    }
}

// --- FUNCTION 6: Track Stock Impact on Orders ---
exports.trackOrderStockImpact = functions.firestore
    .document('orders/{orderId}')
    .onCreate(async (snap, context) => {
        const order = snap.data();
        const orderId = context.params.orderId;
        const batch = admin.firestore().batch();
        const stockUpdates = [];

        if (order.items) {
            for (const item of order.items) {
                if (!item.productId || item.isHamper) continue;
                const productRef = admin.firestore().collection('inventory').doc(item.productId);
                const productSnap = await productRef.get();

                if (productSnap.exists) {
                    const currentStock = productSnap.data().stock || 0;
                    const newStock = Math.max(0, currentStock - item.qty);
                    batch.update(productRef, {
                        stock: newStock,
                        lastSoldAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                    stockUpdates.push({
                        productId: item.productId,
                        productName: item.name,
                        changeType: 'sale',
                        previousStock: currentStock,
                        newStock: newStock,
                        quantity: -item.qty,
                        reason: `Order #${orderId}`,
                        performedBy: order.userId || 'guest'
                    });
                }
            }
        }
        await batch.commit();
        for (const update of stockUpdates) await logStockChange(update);
        return null;
    });

// =====================================================
// ANALYTICS FUNCTIONS
// =====================================================

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
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const ordersSnapshot = await admin.firestore().collection('orders')
            .where('timestamp', '>=', thirtyDaysAgo)
            .get();

        const productStats = {};
        ordersSnapshot.forEach(doc => {
            const order = doc.data();
            if (order.items) {
                order.items.forEach(item => {
                    if (!item.productId) return;
                    if (!productStats[item.productId]) {
                        productStats[item.productId] = {
                            productId: item.productId,
                            productName: item.name,
                            totalRevenue: 0,
                            totalUnitsSold: 0
                        };
                    }
                    productStats[item.productId].totalRevenue += (item.price * item.qty);
                    productStats[item.productId].totalUnitsSold += item.qty;
                });
            }
        });

        const batch = admin.firestore().batch();
        Object.values(productStats).forEach(stats => {
            const docRef = admin.firestore().collection('productAnalytics').doc(String(stats.productId));
            batch.set(docRef, {
                ...stats,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                last30DaysRevenue: stats.totalRevenue
            }, { merge: true });
        });
        await batch.commit();
        return null;
    });

// =====================================================
// 🔔 NOTIFICATION SYSTEM (Unified)
// =====================================================

// Helper: Send Push & Save to DB
async function sendNotification(target, payload, dbData) {
    try {
        // 1. Send Push if token exists (Mobile App)
        if (target.tokens && target.tokens.length > 0) {
            await admin.messaging().sendMulticast({
                tokens: target.tokens,
                notification: payload.notification,
                data: payload.data || {}
            });
        }

        // 2. Save to Firestore for Notification Center (In-App / Bell Icon)
        if (dbData.collection) {
            await admin.firestore().collection(dbData.collection).add({
                ...dbData.content,
                read: false,
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });
        }
    } catch (error) {
        console.error("Notification Error:", error);
    }
}

// 9. Notify Admin on New Order
exports.notifyAdminNewOrder = functions.firestore
    .document('orders/{orderId}')
    .onCreate(async (snap, context) => {
        const order = snap.data();

        // Fetch all admin tokens
        const tokensSnap = await admin.firestore().collection('admin_tokens').get();
        const tokens = tokensSnap.docs.map(doc => doc.data().token).filter(t => t);

        // Payload for Push Notification
        const payload = {
            notification: {
                title: "🚀 New Order Received!",
                body: `Order #${order.id} for ₹${order.total} by ${order.userName}`
            },
            data: { url: '/admin.html#orders' }
        };

        // Use helper to send Push AND save to DB
        const target = tokens.length > 0 ? { tokens } : {};

        await sendNotification(target, payload, {
            collection: 'admin_notifications',
            content: {
                title: payload.notification.title,
                message: payload.notification.body,
                type: 'order',
                link: '#nav-orders'
            }
        });
    });

// 10. Notify User on Status Change
// In functions/index.js

exports.notifyUserStatusChange = functions.firestore
    .document('orders/{orderId}')
    .onUpdate(async (change, context) => {
        const newData = change.after.data();
        const oldData = change.before.data();

        if (newData.status === oldData.status) return;

        const userId = newData.userId;
        if (!userId || userId.startsWith('guest')) return;

        // Get User Token
        const userDoc = await admin.firestore().collection('users').doc(userId).get();
        const fcmToken = userDoc.data()?.fcmToken;

        // --- REMOVED THE BLOCKING LINE BELOW ---
        // if (!fcmToken) return; 

        const messages = {
            'Packed': '📦 Your order has been packed and is ready for dispatch!',
            'Shipped': '🚚 Your order is on the way!',
            'Delivered': '🎉 Your order has been delivered. Enjoy!',
            'Cancelled': '❌ Your order has been cancelled.'
        };

        const message = messages[newData.status] || `Your order status is now ${newData.status}`;

        const payload = {
            notification: {
                title: `Order Update #${newData.id}`,
                body: message
            },
            data: { url: '/index.html#history-modal' }
        };

        // Only add token if it exists
        const target = {};
        if (fcmToken) target.tokens = [fcmToken];

        // Send Notification (This helper handles DB saving even if tokens are empty)
        await sendNotification(target, payload, {
            collection: `users/${userId}/notifications`,
            content: {
                title: payload.notification.title,
                message: payload.notification.body,
                type: 'status',
                orderId: newData.id
            }
        });
    });

// =====================================================
// REPORTING SYSTEM
// =====================================================

// 11. Daily Report
exports.dailyReport = functions.pubsub
    .schedule('every day 09:00')
    .timeZone('Asia/Kolkata')
    .onRun(async (context) => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        yesterday.setHours(0, 0, 0, 0);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const ordersSnap = await admin.firestore().collection('orders')
            .where('timestamp', '>=', yesterday)
            .where('timestamp', '<', today)
            .get();

        let revenue = 0;
        ordersSnap.forEach(doc => {
            const o = doc.data();
            if (o.status !== 'Cancelled') revenue += o.total || 0;
        });

        const html = `<h3>Daily Report</h3><p>Revenue: ₹${revenue}</p>`;
        await transporter.sendMail({
            from: `"Namo Analytics" <${emailSender.value()}>`,
            to: emailAdmin.value(),
            subject: `📊 Daily Report: ₹${revenue}`,
            html: html
        });
        return null;
    });

// 12. Generate Custom Report
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