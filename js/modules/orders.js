
import { db } from './firebase-init.js';
import { collection, query, where, orderBy, limit, getDocs, doc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { showToast, dbg, escapeHtml } from './utils.js';
import { currentUser } from './auth.js';
import { addToCart, updateCartUI, toggleCart, saveCartLocal } from './cart.js';
import { products } from './data.js';

let historyOrders = [];

// --- ORDER HISTORY UI ---

export function showOrderHistory() {
    const modal = document.getElementById('history-modal');
    if (!modal) return; // Should be in HTML or injected

    const content = document.getElementById('history-content');
    modal.classList.add('active');

    if (!currentUser) {
        content.innerHTML = '<p style="padding:20px; text-align:center;">Please login to view your past orders.</p>';
        return;
    }

    content.innerHTML = '<p style="padding:20px; text-align:center;">Loading history...</p>';

    // Query: db.collection("orders").where(...).orderBy(...).limit(20)
    const q = query(
        collection(db, "orders"),
        where("userId", "==", currentUser.uid),
        orderBy("timestamp", "desc"),
        limit(20)
    );

    getDocs(q)
        .then(snap => {
            if (snap.empty) {
                content.innerHTML = '<p style="padding:20px; text-align:center;">No past orders found.</p>';
                return;
            }

            let html = '';
            historyOrders = [];

            snap.forEach(docSnap => {
                const o = docSnap.data();
                o.docId = docSnap.id;
                historyOrders.push(o);

                const date = o.timestamp ? o.timestamp.toDate().toLocaleDateString() : 'N/A';

                // Timeline Logic
                let progress = '0%';
                let lineClass = '';
                let s1 = '', s2 = '', s3 = '';

                if (o.status === 'Pending') {
                    progress = '0%'; s1 = 'active';
                } else if (o.status === 'Packed') {
                    progress = '50%'; s1 = 'active'; s2 = 'active';
                } else if (o.status === 'Delivered') {
                    progress = '100%'; s1 = 'active'; s2 = 'active'; s3 = 'active';
                } else if (o.status === 'Cancelled') {
                    progress = '100%';
                    lineClass = 'cancelled';
                    s1 = 'cancelled'; s2 = 'cancelled'; s3 = 'cancelled';
                }

                const timelineHTML = `
                <div class="timeline-container">
                    <div class="timeline-line-bg"></div>
                    <div class="timeline-line-fill ${lineClass}" style="width: ${progress}"></div>
                    
                    <div class="timeline-step ${s1}">
                        <div class="step-dot"><i class="fas ${o.status === 'Cancelled' ? 'fa-times' : 'fa-clipboard-check'}"></i></div>
                        <div class="step-label">${o.status === 'Cancelled' ? 'Cancelled' : 'Placed'}</div>
                    </div>
                    <div class="timeline-step ${s2}">
                        <div class="step-dot"><i class="fas fa-box-open"></i></div>
                    </div>
                    <div class="timeline-step ${s3}">
                        <div class="step-dot"><i class="fas fa-truck"></i></div>
                    </div>
                </div>`;

                // Button Logic
                let actionButtons = '';
                if (o.status === 'Pending') {
                    actionButtons = `
                    <button onclick="window.app.cancelOrder('${o.docId}')" style="flex:1; padding:8px; background:#ffebee; color:#c62828; border:1px solid #ef9a9a; border-radius:5px; cursor:pointer;">Cancel Order</button>
                    <button onclick="window.app.openInvoice('${o.id}')" style="flex:1; padding:8px; border:1px solid #e85d04; background:white; color:#e85d04; border-radius:5px; cursor:pointer;">Invoice</button>
                `;
                } else if (o.status === 'Cancelled') {
                    actionButtons = `
                    <button disabled style="flex:1; padding:8px; background:#eee; color:#999; border:none; border-radius:5px; cursor:not-allowed;">Order Cancelled</button>
                    <button onclick="window.app.repeatOrder('${o.id}')" style="flex:1; padding:8px; background:#e85d04; color:white; border:none; border-radius:5px; cursor:pointer;">Re-Order</button>
                `;
                } else {
                    actionButtons = `
                    <button onclick="window.app.openInvoice('${o.id}')" style="flex:1; padding:8px; border:1px solid #e85d04; background:white; color:#e85d04; border-radius:5px; cursor:pointer;">Invoice</button>
                    <button onclick="window.app.repeatOrder('${o.id}')" style="flex:1; padding:8px; background:#e85d04; color:white; border:none; border-radius:5px; cursor:pointer;">Repeat</button>
                `;
                }

                // Items List
                const itemsList = o.items.map(i =>
                    `<div style="display:flex; justify-content:space-between; align-items:center; font-size:0.9rem; color:#555; margin-bottom:8px; border-bottom:1px solid #f0f0f0; padding-bottom:5px;">
                        <div style="display:flex; align-items:center;">
                            <img src="${i.image}" style="width:30px; height:30px; border-radius:4px; margin-right:8px; object-fit:cover;">
                            <div><div>${i.name}</div><small>x ${i.qty}</small></div>
                        </div>
                        <button class="btn-rate" onclick="window.app.openReviewModal('${i.productId}', '${o.id}', '${encodeURIComponent(i.name)}', '${encodeURIComponent(i.image)}')"><i class="far fa-star"></i> Rate</button>
                    </div>`
                ).join('');

                html += `
                    <div style="background:white; border:1px solid #eee; border-radius:10px; padding:15px; margin-bottom:15px; box-shadow:0 2px 5px rgba(0,0,0,0.05);">
                        <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                            <div><strong style="color:#333;">${date}</strong><div style="font-size:0.75rem; color:#999;">#${o.id}</div></div>
                            <span style="font-weight:bold; color:var(--primary); font-size:0.9rem;">${o.status === 'Cancelled' ? '<span style="color:red">Cancelled</span>' : '₹' + o.total}</span>
                        </div>
                        ${o.status !== 'Cancelled' ? timelineHTML : ''}
                        <div style="margin-top:25px; border-top:1px dashed #ddd; padding-top:10px;">${itemsList}</div>
                        <div style="display:flex; gap:10px; margin-top:15px;">${actionButtons}</div>
                    </div>`;
            });

            content.innerHTML = html;
        })
        .catch(err => {
            console.error("History Error:", err);
            content.innerHTML = '<p style="padding:20px; color:red; text-align:center;">Failed to load history.</p>';
        });
}

export function closeHistory() {
    const modal = document.getElementById('history-modal');
    if (modal) modal.classList.remove('active');
}

export function openInvoice(orderId) {
    const order = historyOrders.find(o => o.id === orderId);
    if (!order) return showToast("Order details not found.", "error");

    const modal = document.getElementById('invoice-modal');
    if (!modal) return;

    // Fill basic details
    const elName = document.getElementById('inv-customer-name');
    const elEmail = document.getElementById('inv-customer-email');
    if (elName) elName.innerText = order.userName || 'Guest';
    if (elEmail) elEmail.innerText = (currentUser && currentUser.email) ? currentUser.email : (order.userEmail || '-');

    document.getElementById('inv-order-id').innerText = `#${order.id}`;
    document.getElementById('inv-date').innerText = order.timestamp ? new Date(order.timestamp.seconds * 1000).toLocaleDateString() : '-';

    // Status Stamp
    let stamp = document.getElementById('inv-status-stamp');
    if (!stamp) {
        const container = document.querySelector('.invoice-container');
        if (container) {
            stamp = document.createElement('div');
            stamp.id = 'inv-status-stamp';
            stamp.className = 'inv-status-stamp';
            container.appendChild(stamp);
        }
    }

    const qrSec = document.getElementById('inv-qr-section');

    if (stamp) {
        stamp.className = 'inv-status-stamp';
        if (order.paymentStatus === 'Paid') {
            stamp.innerText = "PAID";
            stamp.classList.add('paid');
            stamp.style.display = 'block';
            if (qrSec) qrSec.style.display = 'none';
        } else {
            stamp.innerText = "PAYMENT DUE";
            stamp.classList.add('due');
            stamp.style.display = 'block';
            if (qrSec) qrSec.style.display = 'block';
        }
    }

    const tbody = document.getElementById('inv-items-body');
    if (tbody) {
        tbody.innerHTML = '';
        order.items.forEach(i => {
            tbody.innerHTML += `
                <tr>
                    <td style="padding:10px; border-bottom:1px solid #eee;">
                        ${escapeHtml(String(i.name))} <br>
                        <small style="color:#888;">${escapeHtml(String(i.weight))}</small>
                    </td>
                    <td class="text-center" style="padding:10px; border-bottom:1px solid #eee;">${i.qty}</td>
                    <td class="text-right" style="padding:10px; border-bottom:1px solid #eee;">₹${i.price}</td>
                    <td class="text-right" style="padding:10px; border-bottom:1px solid #eee;">₹${i.price * i.qty}</td>
                </tr>`;
        });
    }

    document.getElementById('inv-grand-total').innerText = `₹${order.total}`;
    modal.style.display = 'flex';
}

export function closeInvoice() {
    const modal = document.getElementById('invoice-modal');
    if (modal) modal.style.display = 'none';
}

export function printInvoice() {
    window.print();
}

export async function repeatOrder(orderId) {
    const order = historyOrders.find(o => o.id === orderId);
    if (!order) return;

    if (!window.confirm("Add available items from this order to your cart?")) return;

    let addedCount = 0;
    let outOfStockItems = [];

    order.items.forEach(item => {
        const liveProduct = products.find(p => p.id === item.productId);

        let isAvailable = false;
        let currentPrice = item.price;

        if (liveProduct && liveProduct.in_stock) {
            isAvailable = true;

            // Check variant if applicable
            // Wait - cart logic usually handles standard products too.
            // Simplified logic as per original script
            if (liveProduct.variants) {
                const variant = liveProduct.variants.find(v => v.weight === item.weight);
                if (variant) {
                    currentPrice = variant.price;
                    if (variant.inStock === false) isAvailable = false;
                }
            }
        }

        if (isAvailable) {
            const v = { weight: item.weight, price: currentPrice }; // Construct partial variant
            // addToCart signature: (p, v, qty)
            addToCart(liveProduct, v, item.qty);
            addedCount++;
        } else {
            outOfStockItems.push(item.name);
        }
    });

    updateCartUI();
    toggleCart(); // Open cart to show items
    closeHistory();

    if (outOfStockItems.length > 0) {
        const missingText = outOfStockItems.length <= 2 ? outOfStockItems.join(", ") : `${outOfStockItems.length} items`;
        showToast(`${addedCount} added. ${missingText} out of stock.`, "info");
    } else {
        showToast("All items added to cart!", "success");
    }
    saveCartLocal();
}

export function cancelOrder(docId) {
    if (!confirm("Are you sure you want to cancel this order?")) return;

    const orderRef = doc(db, "orders", docId);
    updateDoc(orderRef, {
        status: "Cancelled",
        cancelledAt: serverTimestamp()
    }).then(() => {
        showToast("Order cancelled successfully.", "success");
        showOrderHistory(); // Refresh list
    }).catch(err => {
        console.error(err);
        showToast("Failed to cancel order.", "error");
    });
}
