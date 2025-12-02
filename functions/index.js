const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");
const Razorpay = require("razorpay");
const { defineString } = require("firebase-functions/params");

admin.initializeApp();

// --- CONFIGURATION (Firebase Functions v7 Environment Parameters) ---
// Define environment parameters - set these in functions/.env file
const emailSender = defineString("EMAIL_SENDER", { default: "namonamkeens@gmail.com" });
const emailPassword = defineString("EMAIL_PASSWORD"); // Required - must be set  
const emailAdmin = defineString("EMAIL_ADMIN", { default: "parul19.accenture@gmail.com, namonamkeens@gmail.com" });

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: emailSender.value(),
        pass: emailPassword.value()
    },
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
            from: `"Namo Namkeen" <${emailSender.value()}>`,
            to: (order.userEmail && order.userEmail.includes('@')) ? order.userEmail : emailAdmin.value(),
            bcc: emailAdmin.value(),
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

// Twillo

exports.sendWhatsAppOTP = functions.https.onCall(async (data, context) => {
    const { phoneNumber } = data;

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Send via Twilio WhatsApp
    const twilioClient = require('twilio')(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
    );

    await twilioClient.messages.create({
        from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
        to: `whatsapp:+91${phoneNumber}`,
        body: `Your Namo Namkeen verification code is: ${otp}\n\nValid for 5 minutes.`
    });

    // Store OTP in Firestore with expiry
    await admin.firestore().collection('otps').doc(phoneNumber).set({
        otp: otp,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: new Date(Date.now() + 5 * 60 * 1000)
    });

    return { success: true };
});

exports.verifyWhatsAppOTP = functions.https.onCall(async (data, context) => {
    const { phoneNumber, otp } = data;

    const otpDoc = await admin.firestore().collection('otps').doc(phoneNumber).get();

    if (!otpDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'OTP not found');
    }

    const otpData = otpDoc.data();

    // Check expiry
    if (new Date() > otpData.expiresAt.toDate()) {
        await otpDoc.ref.delete();
        throw new functions.https.HttpsError('deadline-exceeded', 'OTP expired');
    }

    // Verify OTP
    if (otpData.otp !== otp) {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid OTP');
    }

    // Create custom token for Firebase Auth
    const customToken = await admin.auth().createCustomToken(phoneNumber);

    // Clean up OTP
    await otpDoc.ref.delete();

    return { token: customToken, phoneNumber };
});