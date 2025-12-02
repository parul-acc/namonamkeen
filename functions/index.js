const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");
const Razorpay = require("razorpay");
const { defineString } = require("firebase-functions/params");

admin.initializeApp();

// --- CONFIGURATION (Environment Parameters) ---
// Define these in your functions/.env file
const emailSender = defineString("EMAIL_SENDER", { default: "namonamkeens@gmail.com" });
const emailPassword = defineString("EMAIL_PASSWORD");
const emailAdmin = defineString("EMAIL_ADMIN", { default: "parul19.accenture@gmail.com, namonamkeens@gmail.com" });

// Twilio Credentials
const twilioSid = defineString("TWILIO_ACCOUNT_SID");
const twilioToken = defineString("TWILIO_AUTH_TOKEN");
const twilioNumber = defineString("TWILIO_WHATSAPP_NUMBER"); // Format: +1415... (No whatsapp: prefix in .env)

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

        // 1. CHECK TESTING FLAG
        if (enableNotifications.value() !== "true") {
            console.log(`[TEST MODE] Notifications suppressed for Order ${orderId}`);
            return null;
        }

        console.log(`Processing notifications for Order ${orderId}`);

        // 2. PREPARE DATA
        const userEmail = order.userEmail || "";
        const userPhone = order.userPhone || "";
        const customerName = order.customerName || "Customer";
        const totalAmount = order.totalAmount || 0;
        const address = order.deliveryAddress || "N/A";
        const paymentInfo = order.paymentMethod === "COD" ? "Cash on Delivery" : `Online (${order.razorpayPaymentId || "N/A"})`;

        let itemsHtml = "";
        order.items.forEach(item => {
            itemsHtml += `
                <tr>
                    <td style="padding: 8px; border-bottom: 1px solid #eee;">${item.name}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${item.qty}</td>
                </tr>
            `;
        });

        // 3. EMAIL TEMPLATES

        // --- A. CUSTOMER EMAIL TEMPLATE (Clean & Friendly) ---
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

        // --- B. ADMIN EMAIL TEMPLATE (Detailed) ---
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

        // 4. QUEUE NOTIFICATIONS

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
                const toNumber = `whatsapp:+91${userPhone.slice(-10)}`; // Ensure +91 format

                // IMPORTANT: This text MUST match your approved Twilio Template exactly
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

        // 5. EXECUTE ALL
        await Promise.all(promises);
        console.log("✅ All notifications processed");
        return { success: true };
    });

// --- FUNCTION 2: Create Secure Payment Order (Razorpay) ---
exports.createPaymentOrder = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Login required.");

    // Use keys from params or fallback to process.env if needed
    const rzpKeyId = razorpayKeyId.value() || process.env.RAZORPAY_KEY_ID;
    const rzpKeySecret = razorpayKeySecret.value() || process.env.RAZORPAY_KEY_SECRET;

    if (!rzpKeyId || !rzpKeySecret) {
        throw new functions.https.HttpsError("internal", "Razorpay keys not configured.");
    }

    const razorpay = new Razorpay({ key_id: rzpKeyId, key_secret: rzpKeySecret });

    const cart = data.cart;
    const discountInfo = data.discount;

    // Server-side calculation
    const subtotal = cart.reduce((sum, i) => sum + (i.price * i.qty), 0);
    let discountAmount = 0;

    if (discountInfo && discountInfo.value > 0) {
        if (discountInfo.type === 'percent') {
            discountAmount = Math.round(subtotal * (discountInfo.value / 100));
        } else if (discountInfo.type === 'flat' || discountInfo.type === 'loyalty') {
            discountAmount = discountInfo.value;
        }
    }

    // Prevent negative total
    const finalSubtotal = Math.max(0, subtotal - discountAmount);

    // Delivery Logic
    const freeShipLimit = 250;
    const deliveryFee = 50;
    const shipping = (subtotal >= freeShipLimit) ? 0 : deliveryFee;

    const finalTotal = finalSubtotal + shipping;
    const amountPaise = Math.round(finalTotal * 100);

    try {
        const order = await razorpay.orders.create({
            amount: amountPaise,
            currency: "INR",
            receipt: "order_" + Date.now(),
            payment_capture: 1
        });

        return {
            id: order.id,
            amount: order.amount,
            key: rzpKeyId
        };
    } catch (error) {
        console.error("Razorpay Error:", error);
        throw new functions.https.HttpsError("internal", "Payment creation failed.");
    }
});

// --- FUNCTION 3: Send WhatsApp OTP (Authentication) ---
exports.sendWhatsAppOTP = functions.https.onCall(async (data, context) => {
    const { phoneNumber } = data;
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    try {
        const client = require('twilio')(twilioSid.value(), twilioToken.value());
        const fromNumber = `whatsapp:${twilioNumber.value()}`;
        const toNumber = `whatsapp:+91${phoneNumber}`;

        // MUST match approved OTP Template
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

// --- FUNCTION 5: Monitor Low Stock (Triggered on Inventory Update) ---
exports.monitorLowStock = functions.firestore
    .document('inventory/{productId}')
    .onUpdate(async (change, context) => {
        const newData = change.after.data();
        const oldData = change.before.data();

        // Only proceed if stock actually changed
        if (newData.stock === oldData.stock) return null;

        const productId = context.params.productId;
        const lowThreshold = newData.lowStockThreshold || 5; // Default 5 units
        const restockThreshold = newData.restockThreshold || 3; // Critical level

        console.log(`Stock changed for ${newData.name}: ${oldData.stock} → ${newData.stock}`);

        // Check if stock fell below threshold
        if (newData.stock <= lowThreshold && oldData.stock > lowThreshold) {
            console.log(`⚠️ Low stock alert triggered for ${newData.name}`);

            // Create alert document
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

            // Send email alert
            await sendLowStockEmail(newData, productId);
        }

        // Log stock change to history
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

// --- HELPER: Send Low Stock Email ---
async function sendLowStockEmail(product, productId) {
    const isCritical = product.stock <= (product.restockThreshold || 3);

    const emailHtml = `
        <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 10px; overflow: hidden;">
            <div style="background: ${isCritical ? '#e74c3c' : '#f39c12'}; padding: 25px; text-align: center; color: white;">
                <h1 style="margin: 0; font-size: 24px;">${isCritical ? '🚨 CRITICAL STOCK ALERT' : '⚡ Low Stock Alert'}</h1>
                <p style="margin: 8px 0 0; opacity: 0.95; font-size: 14px;">Immediate attention required</p>
            </div>
            
            <div style="padding: 30px; background: white;">
                <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                    <h2 style="margin: 0 0 15px 0; color: #333; font-size: 20px;">${product.name}</h2>
                    
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 10px 0; color: #666; font-size: 14px;">Current Stock:</td>
                            <td style="padding: 10px 0; text-align: right; font-weight: bold; font-size: 18px; color: ${isCritical ? '#e74c3c' : '#f39c12'};">
                                ${product.stock} ${product.unit || 'kg'}
                            </td>
                        </tr>
                        <tr style="border-top: 1px solid #eee;">
                            <td style="padding: 10px 0; color: #666; font-size: 14px;">Alert Threshold:</td>
                            <td style="padding: 10px 0; text-align: right; font-weight: 600; color: #555;">
                                ${product.lowStockThreshold || 5} ${product.unit || 'kg'}
                            </td>
                        </tr>
                        <tr style="border-top: 1px solid #eee;">
                            <td style="padding: 10px 0; color: #666; font-size: 14px;">Status:</td>
                            <td style="padding: 10px 0; text-align: right;">
                                <span style="background: ${isCritical ? '#ffebee' : '#fff8e1'}; color: ${isCritical ? '#e74c3c' : '#f39c12'}; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 700; text-transform: uppercase;">
                                    ${isCritical ? 'Critical - Restock Urgently' : 'Low Stock'}
                                </span>
                            </td>
                        </tr>
                        ${product.supplier ? `
                        <tr style="border-top: 1px solid #eee;">
                            <td style="padding: 10px 0; color: #666; font-size: 14px;">Supplier:</td>
                            <td style="padding: 10px 0; text-align: right; font-weight: 600; color: #555;">${product.supplier}</td>
                        </tr>` : ''}
                        ${product.leadTime ? `
                        <tr style="border-top: 1px solid #eee;">
                            <td style="padding: 10px 0; color: #666; font-size: 14px;">Lead Time:</td>
                            <td style="padding: 10px 0; text-align: right; font-weight: 600; color: #555;">${product.leadTime} days</td>
                        </tr>` : ''}
                    </table>
                </div>
                
                ${isCritical ? `
               <div style="background: #ffebee; border-left: 4px solid #e74c3c; padding: 15px; margin-bottom: 20px; border-radius: 4px;">
                    <strong style="color: #c62828; font-size: 14px;">⚠️ Critical Action Required:</strong>
                    <p style="margin: 8px 0 0; color: #666; font-size: 13px; line-height: 1.5;">
                        Stock has reached critical levels. Immediate restocking is recommended to avoid stockout situation.
                    </p>
                </div>` : ''}
                
                <div style="text-align: center; margin-top: 25px;">
                    <a href="https://namo-namkeen.web.app/admin.html#inventory" 
                       style="display: inline-block; padding: 14px 30px; background: #3498db; color: white; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px; box-shadow: 0 2px 5px rgba(52, 152, 219, 0.3);">
                        📦 View Inventory Dashboard
                    </a>
                </div>
            </div>
            
            <div style="background: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #eee;">
                <p style="margin: 0; color: #999; font-size: 12px;">
                    This is an automated alert from Namo Namkeen Inventory System<br>
                    <span style="color: #666;">Generated on ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</span>
                </p>
            </div>
        </div>
    `;

    try {
        await transporter.sendMail({
            from: `"Namo Inventory Bot 🤖" <${emailSender.value()}>`,
            to: emailAdmin.value(),
            subject: `${isCritical ? '🚨 CRITICAL' : '⚡'} Low Stock: ${product.name} (${product.stock} ${product.unit || 'kg'} remaining)`,
            html: emailHtml
        });
        console.log(`✅ Low stock email sent for ${product.name}`);
    } catch (error) {
        console.error('❌ Failed to send low stock email:', error);
    }
}

// --- HELPER: Log Stock Changes to History ---
async function logStockChange(data) {
    try {
        await admin.firestore().collection('stockHistory').add({
            ...data,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
        console.log(`📝 Stock history logged: ${data.productName} (${data.quantity > 0 ? '+' : ''}${data.quantity})`);
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

        console.log(`📦 Tracking stock impact for Order #${orderId}`);

        const batch = admin.firestore().batch();
        const stockUpdates = [];

        for (const item of order.items) {
            // Skip hamper items or items without productId
            if (!item.productId || item.isHamper) continue;

            const productRef = admin.firestore().collection('inventory').doc(item.productId);
            const productSnap = await productRef.get();

            if (productSnap.exists) {
                const currentStock = productSnap.data().stock || 0;
                const newStock = Math.max(0, currentStock - item.qty); // Prevent negative stock

                // Update stock
                batch.update(productRef, {
                    stock: newStock,
                    lastSoldAt: admin.firestore.FieldValue.serverTimestamp()
                });

                // Prepare history log
                stockUpdates.push({
                    productId: item.productId,
                    productName: item.name,
                    changeType: 'sale',
                    previousStock: currentStock,
                    newStock: newStock,
                    quantity: -item.qty,
                    reason: `Order #${orderId}`,
                    performedBy: order.userId || order.userEmail || 'guest'
                });

                console.log(`  ✓ ${item.name}: ${currentStock} → ${newStock} (-${item.qty})`);
            } else {
                console.warn(`  ⚠️ Product not found in inventory: ${item.productId}`);
            }
        }

        // Commit stock updates
        await batch.commit();

        // Log to stock history (separate from batch for reliability)
        for (const update of stockUpdates) {
            await logStockChange(update);
        }

        console.log(`✅ Stock tracking complete for Order #${orderId} (${stockUpdates.length} items updated)`);
        return null;
    });

// =====================================================
// ANALYTICS FUNCTIONS
// =====================================================

// --- FUNCTION 7: Update Customer Analytics (Triggered on Order) ---
exports.updateCustomerAnalytics = functions.firestore
    .document('orders/{orderId}')
    .onCreate(async (snap, context) => {
        const order = snap.data();
        const orderId = context.params.orderId;

        // Use phone as customer ID (most reliable identifier)
        const customerId = order.userPhone || order.userId;

        if (!customerId) {
            console.log(`No customer ID for order ${orderId}, skipping analytics`);
            return null;
        }

        console.log(`📊 Updating customer analytics for ${customerId}`);

        const customerRef = admin.firestore().collection('customerAnalytics').doc(customerId);
        const customerSnap = await customerRef.get();

        if (!customerSnap.exists) {
            // Create new customer analytics record
            await customerRef.set({
                userId: customerId,
                phone: order.userPhone,
                email: order.userEmail || null,
                name: order.customerName || null,
                totalOrders: 1,
                totalSpent: order.totalAmount,
                averageOrderValue: order.totalAmount,
                firstOrderDate: order.timestamp,
                lastOrderDate: order.timestamp,
                daysSinceLastOrder: 0,
                segment: 'New',
                favoriteCategories: extractCategories(order.items),
                topProducts: extractTopProducts(order.items),
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            console.log(`✅ Created new customer analytics for ${customerId}`);
        } else {
            // Update existing customer analytics
            const data = customerSnap.data();
            const newTotalOrders = data.totalOrders + 1;
            const newTotalSpent = data.totalSpent + order.totalAmount;
            const newAvgOrderValue = newTotalSpent / newTotalOrders;

            // Calculate days since last order
            const daysSinceLast = data.lastOrderDate
                ? Math.floor((order.timestamp.toMillis() - data.lastOrderDate.toMillis()) / (1000 * 60 * 60 * 24))
                : 0;

            // Update favorite categories and top products
            const updatedCategories = mergeCategories(data.favoriteCategories || [], extractCategories(order.items));
            const updatedProducts = mergeProducts(data.topProducts || [], extractTopProducts(order.items));

            await customerRef.update({
                totalOrders: newTotalOrders,
                totalSpent: newTotalSpent,
                averageOrderValue: newAvgOrderValue,
                lastOrderDate: order.timestamp,
                daysSinceLastOrder: 0,
                segment: calculateCustomerSegment(newTotalOrders, newTotalSpent, data.firstOrderDate, order.timestamp),
                favoriteCategories: updatedCategories.slice(0, 5),
                topProducts: updatedProducts.slice(0, 5),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            console.log(`✅ Updated customer analytics for ${customerId} (${newTotalOrders} orders, ₹${newTotalSpent})`);
        }

        return null;
    });

// Helper: Extract categories from order items
function extractCategories(items) {
    const categories = items
        .map(item => item.category)
        .filter(cat => cat);
    return [...new Set(categories)];
}

// Helper: Extract top products from order
function extractTopProducts(items) {
    return items
        .map(item => item.name)
        .filter(name => name)
        .slice(0, 3);
}

// Helper: Merge categories with existing
function mergeCategories(existing, newCats) {
    const merged = [...existing, ...newCats];
    const counts = {};
    merged.forEach(cat => counts[cat] = (counts[cat] || 0) + 1);
    return Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
}

// Helper: Merge products with existing
function mergeProducts(existing, newProds) {
    const merged = [...existing, ...newProds];
    const counts = {};
    merged.forEach(prod => counts[prod] = (counts[prod] || 0) + 1);
    return Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
}

// Helper: Calculate customer segment based on RFM
function calculateCustomerSegment(totalOrders, totalSpent, firstOrderDate, lastOrderDate) {
    const avgOrderValue = totalSpent / totalOrders;
    const daysSinceFirst = (lastOrderDate.toMillis() - firstOrderDate.toMillis()) / (1000 * 60 * 60 * 24);

    // VIP: High value customers (>10 orders OR >₹10,000 spent)
    if (totalOrders > 10 || totalSpent > 10000) {
        return 'VIP';
    }

    // Frequent: 5+ orders in last 90 days
    if (totalOrders >= 5 && daysSinceFirst <= 90) {
        return 'Frequent';
    }

    // Regular: 2-4 orders
    if (totalOrders >= 2 && totalOrders <= 4) {
        return 'Regular';
    }

    // New: First order
    if (totalOrders === 1) {
        return 'New';
    }

    // At Risk: Haven't ordered in 60+ days
    const daysSinceLast = (Date.now() - lastOrderDate.toMillis()) / (1000 * 60 * 60 * 24);
    if (daysSinceLast > 60) {
        return 'AtRisk';
    }

    return 'Regular';
}

// --- FUNCTION 8: Daily Product Analytics Computation ---
exports.dailyProductAnalytics = functions.pubsub
    .schedule('every day 02:00')
    .timeZone('Asia/Kolkata')
    .onRun(async (context) => {
        console.log('🔄 Running daily product analytics computation...');

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const sixtyDaysAgo = new Date();
        sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

        // Fetch orders from last 30 days
        const recentOrdersSnapshot = await admin.firestore().collection('orders')
            .where('timestamp', '>=', thirtyDaysAgo)
            .get();

        // Fetch orders from 30-60 days ago for growth comparison
        const previousOrdersSnapshot = await admin.firestore().collection('orders')
            .where('timestamp', '>=', sixtyDaysAgo)
            .where('timestamp', '<', thirtyDaysAgo)
            .get();

        const productStats = {};
        const previousProductStats = {};

        // Process recent orders (last 30 days)
        recentOrdersSnapshot.forEach(doc => {
            const order = doc.data();
            order.items.forEach(item => {
                if (!item.productId) return;

                if (!productStats[item.productId]) {
                    productStats[item.productId] = {
                        productId: item.productId,
                        productName: item.name,
                        totalRevenue: 0,
                        totalUnitsSold: 0,
                        orderCount: 0,
                        prices: []
                    };
                }

                productStats[item.productId].totalRevenue += (item.price * item.qty);
                productStats[item.productId].totalUnitsSold += item.qty;
                productStats[item.productId].orderCount += 1;
                productStats[item.productId].prices.push(item.price);
            });
        });

        // Process previous period orders (for growth calculation)
        previousOrdersSnapshot.forEach(doc => {
            const order = doc.data();
            order.items.forEach(item => {
                if (!item.productId) return;

                if (!previousProductStats[item.productId]) {
                    previousProductStats[item.productId] = { totalRevenue: 0 };
                }

                previousProductStats[item.productId].totalRevenue += (item.price * item.qty);
            });
        });

        // Calculate analytics and save
        const batch = admin.firestore().batch();
        let processedCount = 0;

        Object.values(productStats).forEach(stats => {
            const docRef = admin.firestore().collection('productAnalytics').doc(stats.productId);

            // Calculate average price
            const averagePrice = stats.prices.reduce((a, b) => a + b, 0) / stats.prices.length;

            // Calculate growth rate
            const previousRevenue = previousProductStats[stats.productId]?.totalRevenue || 0;
            const growthRate = previousRevenue > 0
                ? ((stats.totalRevenue - previousRevenue) / previousRevenue) * 100
                : 0;

            batch.set(docRef, {
                productId: stats.productId,
                productName: stats.productName,
                totalRevenue: stats.totalRevenue,
                totalUnitsSold: stats.totalUnitsSold,
                orderCount: stats.orderCount,
                averagePrice: Math.round(averagePrice),
                last30DaysRevenue: stats.totalRevenue,
                growthRate: Math.round(growthRate * 10) / 10,  // Round to 1 decimal
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            processedCount++;
        });

        await batch.commit();
        console.log(`✅ Product analytics updated for ${processedCount} products`);

        return null;
    });