const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");
const Razorpay = require("razorpay");
const crypto = require('crypto');
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
                from: '"Namo Admin" <your-email@gmail.com>', // Match the auth user
                to: "admin-email@example.com",               // REPLACE WITH RECEIVER EMAIL
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

// --- FUNCTION 13: Verify Razorpay Payment (Secure Webhook/Callback) ---
exports.verifyRazorpayPayment = functions.https.onCall(async (data, context) => {
    const { orderId, paymentId, signature, razorpayOrderId } = data;

    // 1. Get Secret
    const secret = razorpayKeySecret.value() || process.env.RAZORPAY_KEY_SECRET;

    // 2. Generate Signature
    const generated_signature = crypto
        .createHmac("sha256", secret)
        .update(razorpayOrderId + "|" + paymentId)
        .digest("hex");

    // 3. Verify
    if (generated_signature === signature) {
        // Signature matched - Update Firestore
        // Note: orderId here is the Firestore Document ID (ORD-XXX)
        try {
            await admin.firestore().collection("orders").doc(orderId).update({
                paymentStatus: 'Paid',
                transactionId: paymentId,
                paymentVerified: true,
                paidAt: admin.firestore.FieldValue.serverTimestamp()
            });
            return { success: true, message: "Payment Verified" };
        } catch (e) {
            console.error("DB Update Failed:", e);
            throw new functions.https.HttpsError('internal', 'Database update failed');
        }
    } else {
        // Invalid Signature
        console.error("Signature Mismatch for Order:", orderId);
        throw new functions.https.HttpsError('invalid-argument', 'Invalid Signature');
    }
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