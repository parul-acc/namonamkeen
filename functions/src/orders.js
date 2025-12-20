const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const crypto = require('crypto');
const { razorpayKeyId, razorpayKeySecret } = require("./config");

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
