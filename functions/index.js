const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");
const Razorpay = require("razorpay");

admin.initializeApp();

// --- CONFIGURATION ---
const SENDER_EMAIL = "namonamkeens@gmail.com"; 
const SENDER_PASS = "mqkr qkbi ribx dgvr"; 
const ADMIN_EMAIL = "parul19.accenture@gmail.com, namonamkeens@gmail.com"; // Copy to owner


const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: SENDER_EMAIL, pass: SENDER_PASS },
});

// --- FUNCTION 1: Send Invoice Email ---
exports.sendOrderConfirmation = functions.firestore
    .document("orders/{orderId}")
    .onCreate(async (snap, context) => {
        const order = snap.data();
        const orderId = context.params.orderId;

        // 1. Generate Items Table
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

        // 2. Email Body
        const emailHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 10px;">
                <div style="background-color: #e85d04; padding: 20px; text-align: center; color: white;">
                    <h1 style="margin: 0;">Namo Namkeen</h1>
                    <p>Order Confirmation</p>
                </div>
                <div style="padding: 20px;">
                    <p>Hi <strong>${order.userName || "Customer"}</strong>,</p>
                    <p>Thank you for your order! We are preparing it now.</p>
                    <table style="width: 100%; border-collapse: collapse; margin-top:20px;">
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
                                <td colspan="3" style="padding: 10px; text-align: right;">Subtotal:</td>
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
                </div>
            </div>`;

        const mailOptions = {
            from: `"Namo Namkeen" <${SENDER_EMAIL}>`,
            to: (order.userEmail && order.userEmail.includes('@')) ? order.userEmail : ADMIN_EMAIL, 
            bcc: ADMIN_EMAIL, 
            subject: `Order Confirmed: #${orderId}`,
            html: emailHtml,
        };

        try {
            await transporter.sendMail(mailOptions);
            return { success: true };
        } catch (error) {
            console.error("Email error:", error);
            return { error: error.toString() };
        }
    });

// --- FUNCTION 2: Create Secure Payment Order ---
exports.createPaymentOrder = functions.https.onCall(async (data, context) => {
    // 1. Security Check
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "User must be logged in.");
    }

    // 2. Initialize Razorpay (Inside function to load env vars)
    const razorpay = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    const cart = data.cart;
    const discountInfo = data.discount;
    
    // 3. Recalculate Total on Server (Prevents Tampering)
    const subtotal = cart.reduce((sum, i) => sum + (i.price * i.qty), 0);
    
    // Discount Logic
    let discountAmount = 0;
    if (discountInfo && discountInfo.value > 0) {
        if (discountInfo.type === 'percent') {
            discountAmount = Math.round(subtotal * (discountInfo.value / 100));
        } else if (discountInfo.type === 'flat' || discountInfo.type === 'loyalty') {
            discountAmount = discountInfo.value;
        }
    }
    // Prevent negative total if discount > subtotal
    if (discountAmount > subtotal) discountAmount = subtotal;

    // --- FIX: Delivery Logic ---
    const freeShipLimit = 250; 
    const deliveryFee = 50; // <--- UPDATED to 50
    const shipping = (subtotal >= freeShipLimit) ? 0 : deliveryFee;

    const finalTotal = subtotal - discountAmount + shipping;
    const amountPaise = Math.round(finalTotal * 100);

    // 4. Create Order
    try {
        const order = await razorpay.orders.create({
            amount: amountPaise,
            currency: "INR",
            receipt: "order_rcptid_" + Date.now(),
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

// --- FUNCTION 3: Log Sales (Optional) ---
exports.logSalesData = functions.firestore
    .document("orders/{orderId}")
    .onCreate(async (snap, context) => {
        // ... (Keep existing logSalesData logic if you added it) ...
        return null;
    });