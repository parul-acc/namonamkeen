const { defineString } = require("firebase-functions/params");

// --- CONFIGURATION (Environment Parameters) ---
exports.emailSender = defineString("EMAIL_SENDER", { default: "namonamkeens@gmail.com" });
exports.emailPassword = defineString("EMAIL_PASSWORD");
exports.emailAdmin = defineString("EMAIL_ADMIN", { default: "parul19.accenture@gmail.com, namonamkeens@gmail.com" });

// Twilio Credentials
exports.twilioSid = defineString("TWILIO_ACCOUNT_SID");
exports.twilioToken = defineString("TWILIO_AUTH_TOKEN");
exports.twilioNumber = defineString("TWILIO_WHATSAPP_NUMBER");

// Razorpay Credentials
exports.razorpayKeyId = defineString("RAZORPAY_KEY_ID", { default: "" });
exports.razorpayKeySecret = defineString("RAZORPAY_KEY_SECRET", { default: "" });

// Feature Flag
exports.enableNotifications = defineString("ENABLE_NOTIFICATIONS", { default: "false" });
