const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");
const Razorpay = require("razorpay");

admin.initializeApp();

// --- CONFIGURATION ---
// 1. Email Credentials (Hardcoded for now as per previous setup)
const SENDER_EMAIL = "namonamkeens@gmail.com";
const SENDER_PASS = "mqkr qkbi ribx dgvr";
const ADMIN_EMAIL = "parul19.accenture@gmail.com, namonamkeens@gmail.com"; // Copy to owner


// 2. Razorpay Initialization (Using .env variables)
// Note: We initialize this inside the function to avoid global scope errors
// if the environment variables aren't loaded yet.

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: SENDER_EMAIL,
        pass: SENDER_PASS,
    },
});

// --- FUNCTION 1: Send Invoice Email ---
exports.sendOrderConfirmation = functions.firestore
    .document("orders/{orderId}")
    .onCreate(async (snap, context) => {
        const order = snap.data();
        const orderId = context.params.orderId;

        // 1. Generate Invoice HTML Table
        let itemsHtml = "";
        if (order.items && Array.isArray(order.items)) {
            order.items.forEach((item) => {
                itemsHtml += `
                    <tr>
                        <td style="padding: 8px; border-bottom: 1px solid #ddd;">${item.name} (${item.weight})</td>
                        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center;">${item.qty}</td>
                        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">₹${item.price}</td>
                        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">₹${item.price * item.qty}</td>
                    </tr>`;
            });
        }

        // 2. Build the Email Body
        const emailHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 10px; overflow: hidden;">
                <div style="background-color: #e85d04; padding: 20px; text-align: center; color: white;">
                    <h1 style="margin: 0;">Namo Namkeen</h1>
                    <p style="margin: 5px 0 0;">Order Confirmation</p>
                </div>
                
                <div style="padding: 20px;">
                    <p>Hi <strong>${order.userName || "Customer"}</strong>,</p>
                    <p>Thank you for your order! We have received it and are preparing it with love. 🧡</p>
                    
                    <div style="background: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0;">
                        <strong>Order ID:</strong> #${orderId}<br>
                        <strong>Date:</strong> ${new Date().toLocaleDateString('en-IN')}<br>
                        <strong>Payment:</strong> ${order.paymentMethod}
                    </div>

                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="background: #eee;">
                                <th style="padding: 8px; text-align: left;">Item</th>
                                <th style="padding: 8px; text-align: center;">Qty</th>
                                <th style="padding: 8px; text-align: right;">Price</th>
                                <th style="padding: 8px; text-align: right;">Total</th>
                            </tr>
                        </thead>
                        <tbody>${itemsHtml}</tbody>
                        <tfoot>
                            <tr>
                                <td colspan="3" style="padding: 10px; text-align: right; font-weight: bold;">Subtotal:</td>
                                <td style="padding: 10px; text-align: right;">₹${order.subtotal || 0}</td>
                            </tr>
                            <tr>
                                <td colspan="3" style="padding: 5px 10px; text-align: right; color: #666;">Delivery:</td>
                                <td style="padding: 5px 10px; text-align: right;">₹${order.shippingCost || 0}</td>
                            </tr>
                            <tr>
                                <td colspan="3" style="padding: 5px 10px; text-align: right; color: green;">Discount:</td>
                                <td style="padding: 5px 10px; text-align: right;">-₹${order.discountAmt || 0}</td>
                            </tr>
                            <tr style="font-size: 1.2rem;">
                                <td colspan="3" style="padding: 15px 10px; text-align: right; font-weight: bold; color: #e85d04;">Grand Total:</td>
                                <td style="padding: 15px 10px; text-align: right; font-weight: bold;">₹${order.total}</td>
                            </tr>
                        </tfoot>
                    </table>

                    <div style="margin-top: 30px; text-align: center; color: #888; font-size: 0.8rem;">
                        <p>Delivery Address:<br>${order.userAddress}</p>
                        <p>Need help? Call us at +91 98266 98822</p>
                    </div>
                </div>
            </div>
        `;

        // 3. Email Options
        const mailOptions = {
            from: `"Namo Namkeen" <${SENDER_EMAIL}>`,
            to: (order.userEmail && order.userEmail.includes('@')) ? order.userEmail : ADMIN_EMAIL,
            bcc: ADMIN_EMAIL,
            subject: `Order Confirmed: #${orderId}`,
            html: emailHtml,
        };

        // 4. Send
        try {
            if (!order.userEmail && !order.userId.includes("@")) {
                mailOptions.to = ADMIN_EMAIL;
                mailOptions.subject = `[New Order] #${orderId} (No Customer Email)`;
            }
            await transporter.sendMail(mailOptions);
            return { success: true };
        } catch (error) {
            console.error("Email error:", error);
            return { error: error.toString() };
        }
    });

// --- FUNCTION 2: Create Secure Payment Order ---
// --- FUNCTION 2: Create Secure Payment Order (Server-Side Price Check) ---
exports.createPaymentOrder = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "User must be logged in.");

    const clientCart = data.cart;
    const discountInfo = data.discount;
    const db = admin.firestore();

    // 1. Fetch Real Prices from Firestore
    let serverSubtotal = 0;

    // We use Promise.all to fetch all products in parallel
    const productPromises = clientCart.map(item => db.collection("products").doc(String(item.productId)).get());
    const snapshots = await Promise.all(productPromises);

    snapshots.forEach((doc, index) => {
        if (!doc.exists) throw new functions.https.HttpsError("invalid-argument", `Product not found: ${clientCart[index].name}`);

        const product = doc.data();
        const item = clientCart[index];

        // Find the correct variant price
        let realPrice = product.price; // Default
        if (product.variants) {
            const variant = product.variants.find(v => v.weight === item.weight);
            if (variant) realPrice = variant.price;
        }

        // Calculate using REAL price
        serverSubtotal += realPrice * item.qty;
    });

    // 2. Calculate Discount & Delivery (Server Side)
    let discountAmount = 0;
    if (discountInfo && discountInfo.value > 0) {
        if (discountInfo.type === 'percent') {
            discountAmount = Math.round(serverSubtotal * (discountInfo.value / 100));
        } else if (discountInfo.type === 'flat') {
            discountAmount = discountInfo.value;
        }
    }
    const freeShipLimit = 250;
    const deliveryFee = 0; // Or fetch from 'settings/config' if you want dynamic
    const shipping = (serverSubtotal >= freeShipLimit) ? 0 : deliveryFee;

    const finalTotal = Math.max(0, serverSubtotal - discountAmount + shipping);
    const amountPaise = Math.round(finalTotal * 100);

    // 3. Create Order
    const razorpay = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

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
            key: process.env.RAZORPAY_KEY_ID
        };
    } catch (error) {
        console.error("Razorpay Error:", error);
        throw new functions.https.HttpsError("internal", "Payment creation failed.");
    }
});

// --- FUNCTION 3: Auto-Update Loyalty Wallet ---
exports.updateLoyaltyWallet = functions.firestore
    .document("orders/{orderId}")
    .onCreate(async (snap, context) => {
        const order = snap.data();
        const userId = order.userId;
        const db = admin.firestore();

        // Skip Guest Orders or if no User ID
        if (!userId || userId.startsWith('guest')) return null;

        const userRef = db.collection("users").doc(userId);
        const batch = db.batch();
        let netChange = 0;

        // 1. Credit Points (Earned)
        // Logic: 1 Coin per ₹100 spent
        const earned = Math.floor(order.total / 100);
        if (earned > 0) {
            netChange += earned;
            const credRef = userRef.collection("wallet_history").doc();
            batch.set(credRef, {
                amount: earned,
                type: 'credit',
                description: `Earned from Order #${order.id}`,
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });
        }

        // 2. Debit Points (Used)
        if (order.discount && order.discount.type === 'loyalty') {
            netChange -= order.discount.value;
            const debRef = userRef.collection("wallet_history").doc();
            batch.set(debRef, {
                amount: order.discount.value,
                type: 'debit',
                description: `Used on Order #${order.id}`,
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });
        }

        // 3. Update Wallet Balance
        if (netChange !== 0) {
            batch.update(userRef, {
                walletBalance: admin.firestore.FieldValue.increment(netChange)
            });
            await batch.commit();
            console.log(`Wallet updated for ${userId}: ${netChange}`);
        }

        return null;
    });

// --- FUNCTION 3: Log Sales for Inventory Tracking ---
exports.logSalesData = functions.firestore
    .document("orders/{orderId}")
    .onCreate(async (snap, context) => {
        const order = snap.data();
        const db = admin.firestore();
        const batch = db.batch();

        // Create a daily sales report document
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const reportRef = db.collection("daily_sales").doc(today);

        // We use 'set' with merge to ensure the doc exists
        batch.set(reportRef, {
            date: today,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        // Increment counts for each product sold
        order.items.forEach(item => {
            // Field key: "ProductId_VariantName" -> replace spaces with underscores
            const key = `${item.productId}_${item.weight.replace(/\s+/g, '_')}`;

            // Increment the count for this specific item in today's report
            batch.update(reportRef, {
                [key]: admin.firestore.FieldValue.increment(item.qty),
                totalRevenue: admin.firestore.FieldValue.increment(item.price * item.qty)
            });
        });

        return batch.commit();
    });