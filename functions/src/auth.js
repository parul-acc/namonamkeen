const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const { twilioSid, twilioToken, twilioNumber } = require("./config");

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
