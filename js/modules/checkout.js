
import { db, auth, firebase } from './firebase-init.js';
import { cart, updateCartUI, saveCartLocal, getCartTotals, appliedDiscount, resetCartDiscount } from './cart.js';
import * as utils from './utils.js';
import { currentUser, userProfile } from './auth.js';
import * as productsData from './data.js';

// Helper to get address structure
function getAddressFromInputs(prefix) {
    const street = document.getElementById(`${prefix}-addr-street`).value.trim();
    const city = document.getElementById(`${prefix}-addr-city`).value.trim();
    const pin = document.getElementById(`${prefix}-addr-pin`).value.trim();
    if (!street || !city || !pin) return null;

    return {
        street,
        city,
        pin,
        full: `${street}, ${city} - ${pin}`
    };
}

// Toggle Button Loading
function toggleBtnLoading(btnId, isLoading) {
    const btn = document.getElementById(btnId);
    if (!btn) return;

    if (isLoading) {
        if (!btn.disabled) {
            btn.dataset.originalText = btn.innerHTML;
        }
        btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Processing...';
        btn.disabled = true;
        btn.style.opacity = "0.7";
    } else {
        if (btn.dataset.originalText) btn.innerHTML = btn.dataset.originalText;
        btn.disabled = false;
        btn.style.opacity = "1";
    }
}

export async function validateCartIntegrity() {
    // Basic verification logic
    // In a real app, you might re-fetch every product from DB to ensure price/stock didn't change.
    // For now, we'll do a simple local check or re-check stock if we have data.

    // Check local data first for speed (productsData.products is the global list)
    if (!productsData.products || productsData.products.length === 0) return true;

    for (const item of cart) {
        const liveP = productsData.products.find(p => p.id === item.productId);
        if (!liveP) throw new Error(`Item ${item.name} is no longer available.`);

        if (!liveP.in_stock) throw new Error(`${item.name} is out of stock.`);

        // Variant check
        if (liveP.variants) {
            const v = liveP.variants.find(va => va.weight === item.weight);
            if (v && v.inStock === false) throw new Error(`${item.name} (${item.weight}) is out of stock.`);
        }
    }
    return true;
}

export async function initiateRazorpayPayment() {
    if (cart.length === 0) return utils.showToast("Your cart is empty!", "error");

    const phoneInput = document.getElementById('cust-phone');
    const phone = phoneInput ? phoneInput.value.trim() : '';

    // --- FIX: Get Address from Inputs ---
    const addrObj = getAddressFromInputs('cust');
    if (!addrObj) return utils.showToast("Enter complete address", "error");

    if (!/^[0-9]{10}$/.test(phone)) return utils.showToast("Enter valid 10-digit phone", "error");

    // Check Payment Method
    const methodElem = document.querySelector('input[name="paymentMethod"]:checked');
    const paymentMethod = methodElem ? methodElem.value : 'Online';

    const { finalTotal } = getCartTotals();

    // Validate Cart Integrity Before Proceeding
    try {
        await validateCartIntegrity();
    } catch (e) {
        return utils.showToast(e.message, "error");
    }

    if (paymentMethod === 'COD') {
        const confirm = window.confirm(`Place order for ₹${finalTotal} via Cash on Delivery?`);
        if (confirm) {
            saveOrderToFirebase('COD', 'Pending', null);
        }
    } else {
        // --- SECURE ONLINE FLOW ---
        toggleBtnLoading('btn-main-checkout', true);
        utils.showToast("Initializing Secure Payment...", "neutral");

        try {
            // 1. Call Cloud Function
            const createPaymentOrder = firebase.functions().httpsCallable('createPaymentOrder');
            const result = await createPaymentOrder({
                cart: cart,
                discount: appliedDiscount
            });

            const { id: order_id, key: key_id, amount } = result.data;

            // 2. Open Razorpay with Server Order ID
            openSecureRazorpay(order_id, key_id, amount, phone);

        } catch (error) {
            console.error(error);
            utils.showToast("Payment Init Failed: " + error.message, "error");
            toggleBtnLoading('btn-main-checkout', false);
        }
    }
}

function openSecureRazorpay(orderId, keyId, amount, userPhone) {
    const userName = currentUser ? currentUser.displayName : "Guest User";
    const userEmail = currentUser ? currentUser.email : "guest@namonamkeen.com";

    var options = {
        "key": keyId,
        "amount": amount,
        "currency": "INR",
        "name": "Namo Namkeen",
        "description": "Secure Payment",
        "image": "logo.jpg",
        "order_id": orderId,
        "handler": function (response) {
            console.log("Payment Success:", response);
            saveOrderToFirebase('Online', 'Paid', response.razorpay_payment_id);
        },
        "prefill": {
            "name": userName,
            "email": userEmail,
            "contact": userPhone
        },
        "theme": { "color": "#e85d04" },
        "modal": {
            "ondismiss": function () {
                utils.showToast("Payment cancelled.", "error");
                toggleBtnLoading('btn-main-checkout', false);
            }
        }
    };

    var rzp1 = new Razorpay(options);
    rzp1.on('payment.failed', function (response) {
        utils.showToast("Payment Failed: " + response.error.description, "error");
        toggleBtnLoading('btn-main-checkout', false);
    });
    rzp1.open();
}

export async function saveOrderToFirebase(method, paymentStatus, txnId) {
    toggleBtnLoading('btn-main-checkout', true);

    const phone = document.getElementById('cust-phone').value.trim();
    let email = document.getElementById('cust-email').value.trim();
    if (!email && currentUser && currentUser.email) email = currentUser.email;

    const addrObj = getAddressFromInputs('cust');
    if (!addrObj) {
        toggleBtnLoading('btn-main-checkout', false);
        return utils.showToast("Please complete delivery address", "error");
    }

    const { subtotal, discountAmount, shipping, finalTotal } = getCartTotals();

    // Generate Robust ID (ORD-XXXX-XXXX)
    const generateOrderID = () => {
        const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
        const array = new Uint8Array(8);
        window.crypto.getRandomValues(array);
        let result = '';
        for (let i = 0; i < array.length; i++) {
            result += chars.charAt(array[i] % chars.length);
        }
        return result.slice(0, 4) + '-' + result.slice(4);
    };
    const orderId = 'ORD-' + generateOrderID();

    let uid = currentUser ? currentUser.uid : `guest_${phone}`;
    let uName = "Guest";
    const nameInput = document.getElementById('cust-name');
    if (nameInput && nameInput.value.trim()) {
        uName = nameInput.value.trim();
    } else if (currentUser && currentUser.displayName) {
        uName = currentUser.displayName;
    }
    const deliveryNote = document.getElementById('delivery-note') ? document.getElementById('delivery-note').value.trim() : '';

    try {
        const batch = db.batch();
        const orderRef = db.collection("orders").doc(String(orderId));

        batch.set(orderRef, {
            id: orderId,
            userId: uid,
            userName: uName,
            userPhone: phone,
            userEmail: email,
            userAddress: addrObj.full,
            addressDetails: addrObj,
            deliveryNote: deliveryNote,
            items: cart,
            subtotal: subtotal,
            shippingCost: shipping,
            discount: appliedDiscount,
            discountAmt: discountAmount,
            total: finalTotal,
            paymentMethod: method,
            status: 'Pending',
            paymentStatus: paymentStatus,
            transactionId: txnId || '',
            timestamp: new Date()
        });

        // Update User Profile
        const userRef = db.collection("users").doc(String(uid));

        let userUpdateData = {
            name: uName,
            phone: phone,
            address: addrObj.full,
            addressDetails: addrObj,
            lastOrder: new Date(),
            type: currentUser ? 'Registered' : 'Guest'
        };
        if (email) userUpdateData.email = email;

        // Loyalty Logic if registered
        if (currentUser) {
            // --- MONTHLY STREAK LOGIC ---
            const now = new Date();
            const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

            let streak = userProfile && userProfile.monthlyStreak ? userProfile.monthlyStreak : 0;
            const lastMonth = userProfile && userProfile.lastOrderMonth ? userProfile.lastOrderMonth : null;

            if (lastMonth !== currentMonth) {
                const d1 = new Date(currentMonth + '-01');
                const d2 = lastMonth ? new Date(lastMonth + '-01') : new Date('2000-01-01');
                const diffMonths = (d1.getFullYear() - d2.getFullYear()) * 12 + (d1.getMonth() - d2.getMonth());

                if (diffMonths === 1) {
                    streak++;
                } else if (diffMonths > 1) {
                    streak = 1;
                } else if (streak === 0) {
                    streak = 1;
                }
            }

            // Unlock Badge
            let newBadges = userProfile && userProfile.badges ? [...userProfile.badges] : [];
            if (streak >= 1 && !newBadges.includes('monthly_muncher')) {
                newBadges.push('monthly_muncher');
                utils.showToast("🏆 You unlocked 'Monthly Muncher' Badge!", "success");
            }

            // Update user data object directly
            userUpdateData.monthlyStreak = streak;
            userUpdateData.lastOrderMonth = currentMonth;
            userUpdateData.badges = newBadges;


            let netWalletChange = 0;
            const coinsEarned = Math.floor(finalTotal / 100);

            if (coinsEarned > 0) {
                netWalletChange += coinsEarned;
                const histRef = userRef.collection("wallet_history").doc();
                batch.set(histRef, {
                    amount: coinsEarned,
                    type: 'credit',
                    description: `Earned from Order #${orderId}`,
                    timestamp: new Date()
                });
            }

            if (appliedDiscount.type === 'loyalty') {
                netWalletChange -= appliedDiscount.value;
                const debitRef = userRef.collection("wallet_history").doc();
                batch.set(debitRef, {
                    amount: appliedDiscount.value,
                    type: 'debit',
                    description: `Redeemed on Order #${orderId}`,
                    timestamp: new Date()
                });
            }

            if (netWalletChange !== 0) {
                batch.update(userRef, {
                    walletBalance: firebase.firestore.FieldValue.increment(netWalletChange)
                });
            }
        }

        batch.set(userRef, userUpdateData, { merge: true });
        await batch.commit();

        showSuccessModal(orderId, finalTotal, method);

        // CLEAR CART
        while (cart.length > 0) cart.pop(); // Empty the array in place if possible, or reset logic
        // Better:
        // Main cart reference is mutated by array methods? 'cart' is a const import, array mutation works.
        // We'll trust cart.length = 0 works or splice.
        cart.splice(0, cart.length);

        resetCartDiscount();
        saveCartLocal();
        updateCartUI();

        // Close sidebar
        const sidebar = document.getElementById('cart-sidebar');
        if (sidebar && sidebar.classList.contains('active')) utils.toggleCart();

    } catch (error) {
        console.error("Order Error:", error);
        utils.showToast("Error placing order. Please try again.", "error");
    } finally {
        toggleBtnLoading('btn-main-checkout', false);
    }
}

export function showSuccessModal(orderId, amount, method) {
    const custName = currentUser ? currentUser.displayName : "Guest";
    const addrObj = getAddressFromInputs('cust');
    const address = addrObj ? addrObj.full : "Address not captured";

    const noteElem = document.getElementById('delivery-note');
    const noteText = (noteElem && noteElem.value.trim()) ? `\n📝 *Note:* ${noteElem.value.trim()}` : '';

    const msg = `🎉 *New Order Received!* 🎉\n\n🆔 *Order ID:* ${orderId}\n👤 *Customer:* ${custName}\n📍 *Address:* ${address}${noteText}\n\n💰 *Amount:* ₹${amount}\n💳 *Payment:* ${method === 'Online' ? 'PAID ✅' : 'Cash on Delivery 🚚'}\n\nPlease confirm dispatch! 🚀`;

    const orderIdElem = document.getElementById('success-order-id');
    if (orderIdElem) orderIdElem.innerText = orderId;

    // WA Messaging logic can go here (using window.open)
    const adminPhone = "919372776019"; // Or load from config
    const waUrl = `https://wa.me/${adminPhone}?text=${encodeURIComponent(msg)}`;
    window.open(waUrl, '_blank');

    const modal = document.getElementById('success-modal');
    if (modal) {
        modal.style.display = 'flex';

        // GUEST CONVERSION OFFER
        const existingBtn = document.getElementById('guest-convert-btn');
        if (existingBtn) existingBtn.remove(); // Clean up previous

        if (!currentUser) {
            const phone = document.getElementById('cust-phone').value.trim();
            const content = modal.querySelector('.modal-content') || modal.querySelector('div');

            const btn = document.createElement('button');
            btn.id = 'guest-convert-btn';
            btn.className = 'btn-primary';
            btn.style.marginTop = '15px';
            btn.style.width = '100%';
            btn.style.background = '#2ecc71'; // Green for distinct action
            btn.innerHTML = `<i class="fas fa-magic"></i> Save details for 5% OFF next time!`;
            btn.onclick = () => window.app.convertGuestToUser(orderId, phone);

            if (content) content.appendChild(btn);
        }
    }
}

export function closeSuccessModal() {
    document.getElementById('success-modal').style.display = 'none';
}

// Global expose for close button
window.closeSuccessModal = closeSuccessModal;
