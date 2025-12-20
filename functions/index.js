const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");

// Initialize Firebase Admin globally
admin.initializeApp();

// Export Environment Params from Config (for use in other modules if needed, or just to link them)
// Note: We use them directly in sub-modules, but exporting params is sometimes good practice.
const config = require("./src/config");

// --- IMPORT MODULES ---
const notifications = require("./src/notifications");
const auth = require("./src/auth");
const orders = require("./src/orders");
const inventory = require("./src/inventory");
const analytics = require("./src/analytics");

// --- EXPORT FUNCTIONS ---

// 1. Notifications
exports.sendOrderConfirmation = notifications.sendOrderConfirmation;
exports.notifyAdminNewOrder = notifications.notifyAdminNewOrder;
exports.notifyUserStatusChange = notifications.notifyUserStatusChange;
exports.checkAbandonedCarts = notifications.checkAbandonedCarts;

// 2. Auth & OTP
exports.sendWhatsAppOTP = auth.sendWhatsAppOTP;
exports.verifyWhatsAppOTP = auth.verifyWhatsAppOTP;

// 3. Orders & Payments
exports.createPaymentOrder = orders.createPaymentOrder;
exports.verifyRazorpayPayment = orders.verifyRazorpayPayment;

// 4. Inventory
exports.monitorLowStock = inventory.monitorLowStock;
exports.trackOrderStockImpact = inventory.trackOrderStockImpact;

// 5. Analytics
exports.updateCustomerAnalytics = analytics.updateCustomerAnalytics;
exports.dailyProductAnalytics = analytics.dailyProductAnalytics;
exports.dailyReport = analytics.dailyReport;
exports.generateReport = analytics.generateReport;
exports.sendCustomReportEmail = analytics.sendCustomReportEmail;

// Export Config Params to ensure they are available to the runtime
// (Though defining them in config.js is enough if they are imported)
Object.values(config).forEach(param => {
    // This looks odd but ensures parameters are "defined" in the entry point if needed.
    // Actually, `defineString` works at global scope. Just importing config is enough.
});