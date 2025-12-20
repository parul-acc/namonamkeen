const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");
const { emailSender, emailPassword, emailAdmin } = require("./config");

// Initialize Transporter (Recreated here as it depends on config params)
// Note: In a larger app, this might be a shared utility.
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: emailSender.value(),
        pass: emailPassword.value()
    },
});

async function sendLowStockEmail(product, productId) {
    const isCritical = product.stock <= (product.restockThreshold || 3);
    const emailHtml = `
        <div>
            <h2>${isCritical ? '🚨 CRITICAL' : '⚡'} Low Stock Alert</h2>
            <p>Product: ${product.name}</p>
            <p>Current Stock: ${product.stock}</p>
        </div>
    `;
    try {
        await transporter.sendMail({
            from: `"Namo Inventory" <${emailSender.value()}>`,
            to: emailAdmin.value(),
            subject: `Low Stock: ${product.name}`,
            html: emailHtml
        });
    } catch (error) {
        console.error('Failed to send low stock email:', error);
    }
}

async function logStockChange(data) {
    try {
        await admin.firestore().collection('stockHistory').add({
            ...data,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
    } catch (error) {
        console.error('Failed to log stock history:', error);
    }
}

// --- FUNCTION 5: Monitor Low Stock ---
exports.monitorLowStock = functions.firestore
    .document('inventory/{productId}')
    .onUpdate(async (change, context) => {
        const newData = change.after.data();
        const oldData = change.before.data();

        if (newData.stock === oldData.stock) return null;

        const productId = context.params.productId;
        const lowThreshold = newData.lowStockThreshold || 5;
        const restockThreshold = newData.restockThreshold || 3;

        if (newData.stock <= lowThreshold && oldData.stock > lowThreshold) {
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
            await sendLowStockEmail(newData, productId);
        }
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

// --- FUNCTION 6: Track Stock Impact on Orders ---
exports.trackOrderStockImpact = functions.firestore
    .document('orders/{orderId}')
    .onCreate(async (snap, context) => {
        const order = snap.data();
        const orderId = context.params.orderId;
        const batch = admin.firestore().batch();
        const stockUpdates = [];

        if (order.items) {
            for (const item of order.items) {
                if (!item.productId || item.isHamper) continue;
                const productRef = admin.firestore().collection('inventory').doc(item.productId);
                const productSnap = await productRef.get();

                if (productSnap.exists) {
                    const currentStock = productSnap.data().stock || 0;
                    const newStock = Math.max(0, currentStock - item.qty);
                    batch.update(productRef, {
                        stock: newStock,
                        lastSoldAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                    stockUpdates.push({
                        productId: item.productId,
                        productName: item.name,
                        changeType: 'sale',
                        previousStock: currentStock,
                        newStock: newStock,
                        quantity: -item.qty,
                        reason: `Order #${orderId}`,
                        performedBy: order.userId || 'guest'
                    });
                }
            }
        }
        await batch.commit();
        for (const update of stockUpdates) await logStockChange(update);
        return null;
    });
