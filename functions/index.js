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

// Twilio Params
const twilioSid = defineString("TWILIO_ACCOUNT_SID");
const twilioToken = defineString("TWILIO_AUTH_TOKEN");
const twilioNumber = defineString("TWILIO_WHATSAPP_NUMBER");

// Razorpay Params (Use defineString here too for consistency)
// You must add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to your .env file as well
// If you prefer keeping process.env for Razorpay for now, that's fine, 
// but defineString is recommended for v2 functions.

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
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "User must be logged in.");
    }

    // Using process.env here since you likely haven't defined these strings yet
    // Ensure RAZORPAY_KEY_ID is in your .env file
    const razorpay = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    const cart = data.cart;
    const discountInfo = data.discount;
    const subtotal = cart.reduce((sum, i) => sum + (i.price * i.qty), 0);

    let discountAmount = 0;
    if (discountInfo && discountInfo.value > 0) {
        if (discountInfo.type === 'percent') {
            discountAmount = Math.round(subtotal * (discountInfo.value / 100));
        } else if (discountInfo.type === 'flat' || discountInfo.type === 'loyalty') {
            discountAmount = discountInfo.value;
        }
    }
    if (discountAmount > subtotal) discountAmount = subtotal;

    const freeShipLimit = 250;
    const deliveryFee = 50;
    const shipping = (subtotal >= freeShipLimit) ? 0 : deliveryFee;

    const finalTotal = subtotal - discountAmount + shipping;
    const amountPaise = Math.round(finalTotal * 100);

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

// --- FUNCTION 3: Send WhatsApp OTP (UPDATED) ---
exports.sendWhatsAppOTP = functions.https.onCall(async (data, context) => {
    const { phoneNumber } = data;

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    try {
        // Initialize with params
        const client = require('twilio')(twilioSid.value(), twilioToken.value());

        // Ensure "whatsapp:" prefix is added here, NOT in the .env variable
        const fromNumber = `whatsapp:${twilioNumber.value()}`;
        const toNumber = `whatsapp:+91${phoneNumber}`;

        console.log(`Sending OTP to ${toNumber} from ${fromNumber}`); // Debug log

        await client.messages.create({
            from: fromNumber,
            to: toNumber,
            body: `Your Namo Namkeen verification code is: ${otp}\n\nValid for 5 minutes.`
        });

        // Store OTP
        await admin.firestore().collection('otps').doc(phoneNumber).set({
            otp: otp,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            expiresAt: new Date(Date.now() + 5 * 60 * 1000)
        });

        return { success: true };

    } catch (error) {
        console.error("Twilio Error:", error);
        throw new functions.https.HttpsError('internal', 'Failed to send OTP: ' + error.message);
    }
});

exports.verifyWhatsAppOTP = functions.https.onCall(async (data, context) => {
    const { phoneNumber, otp } = data;

    try {
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
        // This is the line that usually fails without IAM permissions
        const customToken = await admin.auth().createCustomToken(phoneNumber);

        // Clean up OTP
        await otpDoc.ref.delete();

        return { token: customToken, phoneNumber };

    } catch (error) {
        console.error("Verify OTP Error:", error);

        // If it's already an HttpsError, re-throw it
        if (error.code && error.details) {
            throw error;
        }

        // Otherwise, throw an internal error with the message
        throw new functions.https.HttpsError('internal', 'Verification failed: ' + error.message);
    }
});