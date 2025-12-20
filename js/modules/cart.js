import { showToast, dbg } from './utils.js';
import { products, shopConfig } from './data.js';
import { db } from './firebase-init.js';
import { currentUser, userProfile } from './auth.js';
import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// --- STATE ---
export let cart = [];
export let appliedDiscount = { type: 'none', value: 0, code: null };

// --- CART FUNCTIONS ---

export function resetCartDiscount() {
    appliedDiscount = { type: 'none', value: 0, code: null };
}

export function toggleCart() {
    const sidebar = document.getElementById('cart-sidebar');
    const overlay = document.getElementById('cart-overlay');
    if (sidebar && overlay) {
        sidebar.classList.toggle('active');
        overlay.classList.toggle('active');
    }
}

export function getCartTotals() {
    const subtotal = cart.reduce((acc, item) => acc + (item.price * item.qty), 0);

    // Calculate Discount
    let discountAmount = 0;
    if (appliedDiscount.type === 'percent') {
        discountAmount = Math.floor((subtotal * appliedDiscount.value) / 100);
    } else if (appliedDiscount.type === 'flat') {
        discountAmount = appliedDiscount.value;
    } else if (appliedDiscount.type === 'loyalty') {
        discountAmount = appliedDiscount.value;
    }

    // Monthly Muncher Streak Discount (2%)
    let streakDiscount = 0;
    if (userProfile && userProfile.badges && userProfile.badges.includes('monthly_muncher')) {
        streakDiscount = Math.floor(subtotal * 0.02);
    }

    // Shipping (Example logic, can be from config)
    let shipping = subtotal > 1000 ? 0 : 50;
    if (subtotal === 0) shipping = 0;

    const finalTotal = Math.max(0, subtotal + shipping - discountAmount - streakDiscount);

    return { subtotal, discountAmount, streakDiscount, shipping, finalTotal };
}

export function loadCartLocal() {
    try {
        const stored = localStorage.getItem('namoCart');
        if (stored) {
            cart = JSON.parse(stored);
            updateCartUI(); // Update UI immediately
        }
    } catch (e) {
        console.error("Cart Load Error", e);
        cart = [];
    }
}

export function saveCartLocal() {
    localStorage.setItem('namoCart', JSON.stringify(cart));
    syncCartToFirestore();
}

// --- CLOUD SYNC (Debounced) ---
let syncTimeout = null;
function syncCartToFirestore() {
    if (!currentUser) return;

    if (syncTimeout) clearTimeout(syncTimeout);

    syncTimeout = setTimeout(async () => {
        try {
            const userRef = doc(db, 'users', currentUser.uid);
            await setDoc(userRef, {
                cart: cart,
                cartLastUpdated: serverTimestamp()
            }, { merge: true });
            dbg("Cart synced to cloud");
        } catch (e) {
            console.error("Cart Sync Error", e);
        }
    }, 2000); // 2 second debounce
}

export function addToCart(p, v, qtyToAdd = 1) {
    // If only ID passed, lookup
    if (typeof p === 'number' || typeof p === 'string') {
        p = products.find(x => x.id === parseInt(p));
    }

    // Default variant logic if v is missing
    if (!v && p.variants && p.variants.length > 0) {
        v = p.variants.find(vars => vars.inStock !== false) || p.variants[0];
    }
    // If still no variant (simple product)
    if (!v) {
        // Mock a variant for consistency
        v = { weight: 'Standard', price: p.price };
    }

    const safeWeight = v.weight.replace(/[^a-zA-Z0-9]/g, '');
    const cartId = `${p.id}-${safeWeight}`;

    const ex = cart.find(i => i.cartId === cartId);

    if (ex) {
        ex.qty += qtyToAdd;
        showToast(`Updated ${p.name} (+${qtyToAdd})`, "success");
    } else {
        cart.push({
            cartId: cartId,
            productId: p.id,
            name: p.name,
            image: p.image,
            weight: v.weight,
            price: v.price,
            qty: qtyToAdd
        });
        showToast(`${p.name} added!`, "success");
    }

    updateCartUI();
    saveCartLocal();
}

export function updateCartUI() {
    const cartCount = document.getElementById('cart-count');
    if (cartCount) {
        const totalQty = cart.reduce((acc, item) => acc + item.qty, 0);
        cartCount.innerText = totalQty;
        cartCount.style.display = totalQty > 0 ? 'flex' : 'none';
        cartCount.classList.add('bump');
        setTimeout(() => cartCount.classList.remove('bump'), 300);
    }

    const cartContainer = document.getElementById('cart-items');
    if (!cartContainer) return;

    cartContainer.innerHTML = '';

    if (cart.length === 0) {
        cartContainer.innerHTML = `
            <div class="empty-cart">
                <i class="fas fa-shopping-basket"></i>
                <p>Your cart is empty</p>
                <button onclick="window.app.toggleCart()" style="margin-top:10px; padding:8px 20px; background:var(--primary); color:white; border:none; border-radius:5px;">Check Menu</button>
            </div>`;
        document.getElementById('cart-total').innerText = "₹0";
        // Hide clearer
        const clearBtn = document.getElementById('clear-cart-btn');
        if (clearBtn) clearBtn.style.display = 'none';
        return;
    }

    // Show clearer
    const clearBtn = document.getElementById('clear-cart-btn');
    if (clearBtn) clearBtn.style.display = 'block';

    cart.forEach((item, index) => {

        cartContainer.innerHTML += `
        <div class="cart-item">
            <img src="${item.image}" onerror="this.src='logo.jpg'">
            <div class="cart-item-info">
                <h4>${item.name}</h4>
                <small>${item.weight}</small>
                <div class="price">@ ₹${item.price}</div>
            </div>
            <div class="cart-controls">
                <button onclick="window.app.adjustQty(${index}, -1)">-</button>
                <span>${item.qty}</span>
                <button onclick="window.app.adjustQty(${index}, 1)">+</button>
            </div>
        </div>`;
    });

    // Discount/Shipping logic
    const { subtotal, discountAmount, shipping, finalTotal } = getCartTotals();

    // Optional: Render Discount Row if exists
    // (For now just updating total tag as per original simple UI)

    document.getElementById('cart-total').innerText = `₹${finalTotal}`;

    // --- STICKY SUMMARY LOGIC ---
    const stickySummary = document.getElementById('sticky-summary');
    if (stickySummary) {
        if (cart.length > 0) {
            stickySummary.innerHTML = `
                <div class="ss-info">
                    <span class="ss-count">${cart.reduce((a, b) => a + b.qty, 0)} Items</span>
                    <span class="ss-total">₹${finalTotal}</span>
                </div>
                <button onclick="window.app.toggleCart()">View Cart <i class="fas fa-chevron-up"></i></button>
            `;
            // Add class for animation
            requestAnimationFrame(() => stickySummary.classList.add('visible'));
        } else {
            stickySummary.classList.remove('visible');
        }
    }
}

export function adjustQty(index, change) {
    if (cart[index]) {
        cart[index].qty += change;
        if (cart[index].qty <= 0) {
            cart.splice(index, 1);
        }
        updateCartUI();
        saveCartLocal();
    }
}

export function clearCart() {
    if (confirm("Clear your cart?")) {
        cart = [];
        updateCartUI();
        saveCartLocal();
    }
}
