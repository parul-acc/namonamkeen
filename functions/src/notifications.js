const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");
const { emailSender, emailPassword, emailAdmin, enableNotifications, twilioSid, twilioToken, twilioNumber } = require("./config");

// Initialize Transporter
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: emailSender.value(),
        pass: emailPassword.value()
    },
});

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

// 9. Notify Admin on New Order (Push)
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

// 11. Scheduled: Abandoned Cart Recovery
exports.checkAbandonedCarts = functions.pubsub.schedule('every 60 minutes').onRun(async (context) => {
    const now = admin.firestore.Timestamp.now();
    const oneHourAgo = new Date(now.toDate().getTime() - 60 * 60 * 1000);
    const twentyFourHoursAgo = new Date(now.toDate().getTime() - 24 * 60 * 60 * 1000);

    // Query users who updated cart between 1hr and 24hr ago
    // Note: Requires Composite Index likely. Or just simple query.
    // Let's do simple: cartLastUpdated <= oneHourAgo
    // We'll filter 24hr in code to avoid old carts

    const usersRef = admin.firestore().collection('users');
    const snapshot = await usersRef
        .where('cartLastUpdated', '<=', admin.firestore.Timestamp.fromDate(oneHourAgo))
        .where('cartLastUpdated', '>=', admin.firestore.Timestamp.fromDate(twentyFourHoursAgo))
        .get();

    if (snapshot.empty) {
        console.log('No abandoned carts found.');
        return null;
    }

    const batch = admin.firestore().batch();
    let count = 0;

    for (const doc of snapshot.docs) {
        const user = doc.data();

        // Skip if cart empty or already notified (we need a flag)
        if (!user.cart || user.cart.length === 0) continue;
        if (user.cartAbandonedNotified) continue; // Prevent spam

        // Send Notification
        const payload = {
            notification: {
                title: "Don't forget your snacks! 🛒",
                body: "Your Namo Namkeen cart is waiting. Complete your order before items run out!"
            },
            data: { url: '/index.html#cart' }
        };

        // We assume token exists
        const target = {};
        if (user.fcmToken) target.tokens = [user.fcmToken];

        // Send
        await sendNotification(target, payload, {
            collection: `users/${doc.id}/notifications`,
            content: {
                title: payload.notification.title,
                message: payload.notification.body,
                type: 'reminder',
                link: '#cart'
            }
        });

        // Mark as notified
        batch.update(doc.ref, { cartAbandonedNotified: true });
        count++;
    }

    if (count > 0) await batch.commit();
    console.log(`Notified ${count} abandoned carts.`);
    return null;
});
