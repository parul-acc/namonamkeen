import { showToast, dbg } from './utils.js';
import { products, shopConfig } from './data.js';

// --- STATE ---
export let cart = [];

// --- CART FUNCTIONS ---

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

    let subtotal = 0;

    cart.forEach((item, index) => {
        subtotal += (item.price * item.qty);

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

    // Discount/Shipping logic (Simplified for module)
    // In full implementation, import appliedDiscount state or pass it in
    let finalTotal = subtotal; // Placeholder
    document.getElementById('cart-total').innerText = `₹${finalTotal}`;
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
