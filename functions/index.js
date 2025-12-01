const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

admin.initializeApp();

// --- CONFIGURATION ---
// Ideally, use: firebase functions:config:set email.user="you@gmail.com" email.pass="your-app-password"
// For now, hardcoding for testing (Replace these!)
const SENDER_EMAIL = "namonamkeens@gmail.com"; 
const SENDER_PASS = "mqkr qkbi ribx dgvr"; 
const ADMIN_EMAIL = "parul19.accenture@gmail.com, namonamkeens@gmail.com"; // Copy to owner

// Configure Transporter (Gmail Example)
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: SENDER_EMAIL,
        pass: SENDER_PASS,
    },
});

exports.sendOrderConfirmation = functions.firestore
    .document("orders/{orderId}")
    .onCreate(async (snap, context) => {
        const order = snap.data();
        const orderId = context.params.orderId;

        // 1. Generate Invoice HTML Table
        let itemsHtml = "";
        order.items.forEach((item) => {
            itemsHtml += `
                <tr>
                    <td style="padding: 8px; border-bottom: 1px solid #ddd;">${item.name} (${item.weight})</td>
                    <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center;">${item.qty}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">₹${item.price}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">₹${item.price * item.qty}</td>
                </tr>`;
        });

        // 2. Build the Email Body
        const emailHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 10px; overflow: hidden;">
                <div style="background-color: #e85d04; padding: 20px; text-align: center; color: white;">
                    <h1 style="margin: 0;">Namo Namkeen</h1>
                    <p style="margin: 5px 0 0;">Order Confirmation</p>
                </div>
                
                <div style="padding: 20px;">
                    <p>Hi <strong>${order.userName}</strong>,</p>
                    <p>Thank you for your order! We have received it and are preparing it with love. 🧡</p>
                    
                    <div style="background: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0;">
                        <strong>Order ID:</strong> #${orderId}<br>
                        <strong>Date:</strong> ${new Date().toLocaleDateString()}<br>
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
                        <tbody>
                            ${itemsHtml}
                        </tbody>
                        <tfoot>
                            <tr>
                                <td colspan="3" style="padding: 10px; text-align: right; font-weight: bold;">Subtotal:</td>
                                <td style="padding: 10px; text-align: right;">₹${order.subtotal}</td>
                            </tr>
                            <tr>
                                <td colspan="3" style="padding: 5px 10px; text-align: right; color: #666;">Delivery:</td>
                                <td style="padding: 5px 10px; text-align: right;">₹${order.shippingCost}</td>
                            </tr>
                            <tr>
                                <td colspan="3" style="padding: 5px 10px; text-align: right; color: green;">Discount:</td>
                                <td style="padding: 5px 10px; text-align: right;">-₹${order.discountAmt}</td>
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
            to: order.userPhone.includes('@') ? order.userPhone : "guest@namonamkeen.com", // Fallback if no email
            bcc: ADMIN_EMAIL, // Send copy to you
            subject: `Order Confirmed: #${orderId}`,
            html: emailHtml,
        };

        // 4. Send
        try {
            // Check if user provided an email (if not, only send to Admin)
            if(!order.userEmail && !order.userId.includes('@')) {
                 mailOptions.to = ADMIN_EMAIL; // Just notify admin
                 mailOptions.subject = `[New Order] #${orderId} (No Customer Email)`;
            } else if (order.userEmail) {
                mailOptions.to = order.userEmail;
            }
            
            await transporter.sendMail(mailOptions);
            console.log("Email sent for order:", orderId);
            return { success: true };
        } catch (error) {
            console.error("Email error:", error);
            return { error: error.toString() };
        }
    });