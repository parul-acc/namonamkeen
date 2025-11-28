// --- 1. CONFIGURATION ---
const firebaseConfig = {
    apiKey: "AIzaSyB-Ep3yEAzFBlqOVGOxhjbmjwlSH0Xx5qU",
    authDomain: "namo-namkeen-app.firebaseapp.com",
    projectId: "namo-namkeen-app",
    storageBucket: "namo-namkeen-app.firebasestorage.app",
    messagingSenderId: "154786466552",
    appId: "1:154786466552:web:9be55b7b599806f536490d",
    measurementId: "G-8HJJ8YW1YH"
};

if (typeof firebase !== 'undefined' && !firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();
const auth = firebase.auth();

// --- 2. STATE VARIABLES ---
let products = [];
let cart = [];
let currentUser = null;
let currentCategory = 'all';
let searchQuery = '';
let currentLang = 'en';
let selectedHamperItems = [];
let historyOrders = [];

// NEW: Add this Shop Config
const razorpayKeyId = "YOUR_RAZORPAY_KEY_ID_HERE"; // <--- PASTE YOUR KEY ID HERE
let shopConfig = {
    upiId: "8103276050@ybl", // Default fallback if DB fails
    adminPhone: "919826698822",
    deliveryCharge: 0
};

// Coupon State
let activeCoupons = [];
let appliedDiscount = { type: 'none', value: 0, code: null };

// --- 3. INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    fetchData();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');

    auth.onAuthStateChanged(user => {
        currentUser = user;
        updateUserUI(!!user);
    });
});

window.onscroll = function () {
    const btn = document.getElementById("scrollTopBtn");
    if (btn) btn.style.display = (document.body.scrollTop > 300 || document.documentElement.scrollTop > 300) ? "flex" : "none";
};

// --- 4. DATA FETCHING ---
function fetchData() {
    // Products
    db.collection("products").get().then(snap => {
        products = [];
        snap.forEach(doc => products.push(doc.data()));
        products = products.filter(p => p.id !== 999);
        renderMenu();
        renderHamperOptions();
    }).catch(err => console.error("Products Error:", err));

    // NEW: Fetch Shop Configuration from Firestore
    db.collection("settings").doc("config").onSnapshot(doc => {
        if (doc.exists) {
            const data = doc.data();
            if (data.upiId) shopConfig.upiId = data.upiId;
            if (data.adminPhone) shopConfig.adminPhone = data.adminPhone;
            console.log("Shop Config Loaded:", shopConfig);
        }
    });

    // Announcement
    db.collection("settings").doc("announcement").get().then(doc => {
        if (doc.exists) {
            const data = doc.data();
            if (data.active === true && data.text) {
                const bar = document.getElementById('announcement-bar');
                const txt = document.getElementById('announcement-text');
                if (bar && txt) {
                    txt.innerText = data.text;
                    bar.style.display = 'block';
                }
            } else {
                const bar = document.getElementById('announcement-bar');
                if (bar) bar.style.display = 'none';
            }
        }
    }).catch(err => console.error("Settings Error:", err));

    // Coupons
    const now = new Date();
    db.collection("coupons").where("isActive", "==", true).onSnapshot(snap => {
        activeCoupons = [];
        snap.forEach(doc => {
            const c = doc.data();
            if (c.expiryDate.toDate() > now) {
                activeCoupons.push(c);
            }
        });
        // This call was failing because the function was missing
        renderCouponList();
    });
}

// --- 5. RENDER MENU ---
function renderMenu() {
    const grid = document.getElementById('menu-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const filtered = products.filter(p => {
        const name = (p.name + (p.nameHi || '')).toLowerCase();
        const matchesCat = currentCategory === 'all' || p.category === currentCategory;
        const matchesSearch = name.includes(searchQuery.toLowerCase());
        return matchesCat && matchesSearch;
    });

    if (filtered.length === 0) {
        grid.innerHTML = '<p style="text-align:center; grid-column:1/-1;">No products found.</p>';
        return;
    }

    filtered.forEach(p => {
        const name = currentLang === 'en' ? p.name : (p.nameHi || p.name);
        const desc = currentLang === 'en' ? p.desc : (p.descHi || p.desc);
        const ribbonHTML = p.bestseller ? `<div class="ribbon">Bestseller</div>` : '';

        let variantHtml = '';
        let displayPrice = p.price;
        let isAvailable = p.in_stock;

        if (p.variants && p.variants.length > 0) {
            const firstActive = p.variants.find(v => v.inStock !== false);
            displayPrice = firstActive ? firstActive.price : p.variants[0].price;
            if (!firstActive) isAvailable = false;

            variantHtml = `<select class="variant-select" id="variant-select-${p.id}" onclick="event.stopPropagation()" onchange="updateCardPrice(${p.id}, this.value)">`;
            p.variants.forEach((v, index) => {
                const stockStatus = (v.inStock !== false);
                const disabledAttr = stockStatus ? '' : 'disabled';
                const label = v.weight + (stockStatus ? '' : ' (Out of Stock)');
                const selectedAttr = (v.price === displayPrice && stockStatus) ? 'selected' : '';
                variantHtml += `<option value="${index}" ${disabledAttr} ${selectedAttr}>${label}</option>`;
            });
            variantHtml += `</select>`;
        }

        let btnAction = isAvailable ? `addToCartFromGrid(${p.id})` : '';
        let btnText = isAvailable ? (currentLang === 'en' ? 'Add' : 'जोड़ें') : 'Sold Out';
        let cardClass = isAvailable ? '' : 'sold-out';

        // NEW: Calculate Rating
        const avgRating = p.ratingCount ? (p.ratingSum / p.ratingCount).toFixed(1) : 0;
        const reviewCount = p.ratingCount || 0;

        // Generate Star HTML
        let starHTML = '';
        if (reviewCount > 0) {
            starHTML = `<div class="star-display">`;
            for (let i = 1; i <= 5; i++) {
                if (i <= Math.round(avgRating)) starHTML += '★';
                else starHTML += '<span style="color:#ddd">★</span>';
            }
            starHTML += `<span class="rating-count">(${reviewCount})</span></div>`;
        } else {
            starHTML = `<div class="star-display" style="opacity:0.5; filter:grayscale(1)"><small>No reviews yet</small></div>`;
        }

        grid.innerHTML += `
        <div class="product-card ${cardClass}" onclick="openProductDetail(${p.id})">
            ${ribbonHTML}
            <img src="${p.image}" class="product-img" loading="lazy" onerror="this.src='logo.jpg'">
            <div class="product-info">
                <h3>${name}</h3>
                ${starHTML} <p class="product-desc">${desc}</p>
                <div style="margin-bottom:10px; min-height:30px;">${variantHtml}</div>
                <div class="price-row">
                    <span class="price" id="price-${p.id}">₹${displayPrice}</span>
                    <button class="add-btn" 
                        onclick="event.stopPropagation(); ${btnAction}" 
                        ${!isAvailable ? 'disabled style="background:#ccc; cursor:not-allowed;"' : ''}>
                        ${btnText}
                    </button>
                </div>
            </div>
        </div>`;
    });
}

function updateCardPrice(id, index) {
    const p = products.find(x => x.id === id);
    if (p && p.variants && p.variants[index]) {
        document.getElementById(`price-${id}`).innerText = `₹${p.variants[index].price}`;
    }
}

function addToCartFromGrid(id) {
    const p = products.find(x => x.id === id);
    const select = document.getElementById(`variant-select-${id}`);
    let v = { weight: 'Standard', price: p.price };
    if (select) v = p.variants[select.value];
    else if (p.variants && p.variants.length > 0) v = p.variants[0];
    addToCart(p, v);
}

// --- 6. HAMPER LOGIC ---
function renderHamperOptions() {
    if (!products || products.length === 0) return;
    const container = document.getElementById('hamper-options');
    if (!container) return;
    // In renderHamperOptions()
    const limit = shopConfig.hamperMaxItemPrice || 105;
    const eligible = products.filter(p => p.price <= limit && p.in_stock);

    container.innerHTML = '';
    eligible.forEach(p => {
        const div = document.createElement('div');
        div.className = 'hamper-option';
        div.onclick = () => toggleHamperItem(p, div);
        div.innerHTML = `<img src="${p.image}" onerror="this.src='logo.jpg'"><h4>${p.name}</h4>`;
        container.appendChild(div);
    });
}

function toggleHamperItem(p, el) {
    const exists = selectedHamperItems.find(i => i.id === p.id);
    if (exists) {
        selectedHamperItems = selectedHamperItems.filter(i => i.id !== p.id);
        el.classList.remove('selected');
    } else {
        if (selectedHamperItems.length < 3) {
            const currentTotal = selectedHamperItems.reduce((sum, item) => sum + item.price, 0);
            if (currentTotal + p.price > shopConfig.hamperPrice) {
                alert(`Total value too high! Try a cheaper item.`);
                return;
            }
            selectedHamperItems.push(p);
            el.classList.add('selected');
        } else {
            alert("Select only 3 items!");
        }
    }
    updateHamperUI();
}

function updateHamperUI() {
    const countElem = document.getElementById('hamper-count');
    if (countElem) countElem.innerText = selectedHamperItems.length;
    const btn = document.getElementById('add-hamper-btn');
    if (btn) {
        if (selectedHamperItems.length === 3) {
            btn.classList.remove('disabled');
            btn.innerHTML = "Add Hamper to Cart - ₹250";
            btn.style.background = "var(--primary)";
        } else {
            btn.classList.add('disabled');
            btn.innerHTML = `Select ${3 - selectedHamperItems.length} more`;
            btn.style.background = "#ccc";
        }
    }
}

function addHamperToCart() {
    if (selectedHamperItems.length !== 3) return;
    const price = shopConfig.hamperPrice || 250;
    const names = selectedHamperItems.map(p => p.name).join(' + ');
    cart.push({
        cartId: 'hamper-' + Date.now(),
        productId: 'HAMPER',
        name: 'Gift Box (3 Packs)',
        weight: names,
        price: price,
        image: 'assets/images/product/mini-samosa.jpg',
        qty: 1
    });
    selectedHamperItems = [];
    document.querySelectorAll('.hamper-option').forEach(el => el.classList.remove('selected'));
    updateHamperUI();
    toggleCart();
    updateCartUI();
}

// --- 7. SNACK FINDER ---
function openQuiz() {
    if (!products || products.length === 0) { alert("Loading..."); return; }
    document.getElementById('quiz-modal').style.display = 'flex';
    startQuiz();
}
function closeQuiz() { document.getElementById('quiz-modal').style.display = 'none'; }

function startQuiz() {
    document.getElementById('quiz-content').innerHTML = `
        <div class="quiz-question">
            <h3 style="color:var(--text-dark); margin-bottom:10px;">What are you craving? 😋</h3>
            <div class="quiz-options">
                <button class="quiz-btn" onclick="quizStep2('spicy')"><i class="fas fa-pepper-hot"></i> Spicy</button>
                <button class="quiz-btn" onclick="quizStep2('sweet')"><i class="fas fa-cookie-bite"></i> Sweet / Mild</button>
            </div>
        </div>`;
}

function quizStep2(pref) {
    const content = document.getElementById('quiz-content');
    if (pref === 'spicy') {
        content.innerHTML = `<div class="quiz-question"><h3>Something Crunchy?</h3><div class="quiz-options"><button class="quiz-btn" onclick="findResult('sev')">Sev</button><button class="quiz-btn" onclick="findResult('mixture')">Mixture</button></div></div>`;
    } else {
        content.innerHTML = `<div class="quiz-question"><h3>Fried or Sweet?</h3><div class="quiz-options"><button class="quiz-btn" onclick="findResult('samosa')">Fried Snack</button><button class="quiz-btn" onclick="findResult('sweet')">Sweet</button></div></div>`;
    }
}

function findResult(keyword) {
    const p = products.find(x => (x.name || '').toLowerCase().includes(keyword)) || products[0];
    document.getElementById('quiz-content').innerHTML = `<div class="quiz-result"><h3 style="color:green">Try This!</h3><img src="${p.image}" class="result-img" onerror="this.src='logo.jpg'"><h2>${p.name}</h2><button class="btn-primary" style="padding:10px;" onclick="openProductDetail(${p.id}); closeQuiz();">View</button></div>`;
}

// --- 8. PRODUCT MODAL ---
function openProductDetail(id) {
    const p = products.find(x => x.id === id);
    if (!p) return;

    const name = currentLang === 'en' ? p.name : (p.nameHi || p.name);
    const desc = currentLang === 'en' ? p.desc : (p.descHi || p.desc);

    const ingredients = p.ingredients || "Gram Flour, Spices, Oil";
    const shelfLife = p.shelfLife || "3 Months";
    const category = p.category ? p.category.charAt(0).toUpperCase() + p.category.slice(1) : "Snacks";

    let variantHtml = '';
    let initialPrice = p.price;
    let isAvailable = p.in_stock;

    // Variant Logic
    if (p.variants && p.variants.length > 0) {
        const firstActive = p.variants.find(v => v.inStock !== false);
        initialPrice = firstActive ? firstActive.price : p.variants[0].price;
        if (!firstActive) isAvailable = false;

        variantHtml = `<select id="modal-variant-select" class="pm-select" onchange="updateModalPrice(this)">`;
        p.variants.forEach((v, idx) => {
            const stockStatus = (v.inStock !== false);
            const disabledAttr = stockStatus ? '' : 'disabled';
            const label = v.weight + (stockStatus ? '' : '');
            const selectedAttr = (v.price === initialPrice && stockStatus) ? 'selected' : '';
            variantHtml += `<option value="${idx}" data-price="${v.price}" ${disabledAttr} ${selectedAttr}>${label}</option>`;
        });
        variantHtml += `</select>`;
    } else {
        variantHtml = `<div style="padding:8px; background:#f9f9f9; border-radius:5px; font-weight:600; font-size:0.85rem; text-align:center;">Standard</div>`;
    }

    // Button Logic - REMOVED INLINE STYLES, ADDED CLASS 'pm-btn'
    let btnHtml = `<button class="btn-primary pm-btn" onclick="addToCartFromModal(${p.id})">Add <i class="fas fa-shopping-bag"></i></button>`;
    if (!isAvailable) {
        btnHtml = `<button class="btn-primary pm-btn" style="background:#ccc; cursor:not-allowed;" disabled>Sold Out</button>`;
    }

    let html = `
        <div class="pm-grid">
            <div class="pm-image-container">
                <img src="${p.image}" class="pm-img" onerror="this.src='logo.jpg'">
            </div>

            <div class="pm-details">
                <span class="pm-category">${category}</span>
                <h2 class="pm-title">${name}</h2>
                <p class="pm-desc">${desc}</p>

                <div class="pm-meta-box">
                    <div class="pm-meta-item">
                        <i class="fas fa-utensils"></i> 
                        <span><strong>Ing:</strong> ${ingredients}</span>
                    </div>
                    <div class="pm-meta-item">
                        <i class="fas fa-clock"></i> 
                        <span><strong>Shelf:</strong> ${shelfLife}</span>
                    </div>
                </div>

                <div class="pm-controls">
                    <div class="pm-price-row">
                        <span class="pm-price" id="modal-price-display">₹${initialPrice}</span>
                    </div>
                    
                    <div class="pm-variant-wrapper">
                        ${variantHtml}
                    </div>
                    
                    ${btnHtml}
                </div>
            </div>
        </div>`;

    document.getElementById('p-modal-body').innerHTML = html;

    // Ensure modal isn't too tall on mobile
    const modalContent = document.querySelector('#product-modal .modal-content');
    if (modalContent) {
        modalContent.style.maxWidth = "800px";
        modalContent.style.width = "90%";
        // Remove fixed height if set previously to allow content to flow
    }

    document.getElementById('product-modal').style.display = 'flex';
}

function updateModalPrice(sel) {
    document.getElementById('modal-price-display').innerText = `₹${sel.options[sel.selectedIndex].getAttribute('data-price')}`;
}

function addToCartFromModal(id) {
    const p = products.find(x => x.id === id);
    const sel = document.getElementById('modal-variant-select');
    let v = { weight: 'Standard', price: p.price };
    if (sel) v = p.variants[sel.value];
    else if (p.variants && p.variants.length > 0) v = p.variants[0];

    addToCart(p, v);
    closeProductModal();
}

function closeProductModal() { document.getElementById('product-modal').style.display = 'none'; }

// --- 9. CART ---
function addToCart(p, v) {
    const cartId = `${p.id}-${v.weight.replace(/\s/g, '')}`;
    const ex = cart.find(i => i.cartId === cartId);
    if (ex) ex.qty++;
    else cart.push({ cartId: cartId, productId: p.id, name: p.name, image: p.image, weight: v.weight, price: v.price, qty: 1 });
    updateCartUI();
    toggleCart();
}

function updateCartUI() {
    const con = document.getElementById('cart-items');
    if (!con) return;
    con.innerHTML = '';
    let subtotal = 0, count = 0;

    if (cart.length === 0) {
        con.innerHTML = '<p style="text-align:center; padding:20px;">Cart is empty</p>';
        document.getElementById('clear-cart-btn').style.display = 'none';
        appliedDiscount = { type: 'none', value: 0, code: null };
        document.getElementById('promo-code').value = '';
    } else {
        document.getElementById('clear-cart-btn').style.display = 'flex';
        cart.forEach(i => {
            subtotal += i.price * i.qty;
            count += i.qty;

            con.innerHTML += `
            <div class="cart-item">
                <img src="${i.image}" onerror="this.src='logo.jpg'">
                <div class="item-details" style="flex-grow:1;">
                    <h4>${i.name}</h4>
                    <div style="font-size:0.85rem; color:#666;">${i.weight}</div>
                    <div style="font-weight:bold; color:var(--primary);">₹${i.price}</div>
                    <div class="item-controls">
                        <button class="qty-btn" onclick="changeQty('${i.cartId}', -1)">-</button>
                        <span style="margin:0 10px; font-weight:600;">${i.qty}</span>
                        <button class="qty-btn" onclick="changeQty('${i.cartId}', 1)">+</button>
                    </div>
                </div>
                <button onclick="removeFromCart('${i.cartId}')" style="background:none; border:none; color:#999; cursor:pointer;"><i class="fas fa-trash"></i></button>
            </div>`;
        });
    }

    // CALCULATE DISCOUNT
    let discountAmount = 0;
    if (appliedDiscount.type === 'percent') {
        discountAmount = Math.round(subtotal * (appliedDiscount.value / 100));
    } else if (appliedDiscount.type === 'flat') {
        discountAmount = appliedDiscount.value;
    }

    if (discountAmount > subtotal) discountAmount = subtotal;
    const final = subtotal - discountAmount;

    document.getElementById('cart-total').innerText = `₹${final}`;

    document.getElementById('cart-count').innerText = count;
}

function changeQty(id, d) {
    const i = cart.find(x => x.cartId === id);
    if (i) { i.qty += d; if (i.qty <= 0) removeFromCart(id); else updateCartUI(); }
}

function removeFromCart(id) { cart = cart.filter(x => x.cartId !== id); updateCartUI(); }
function clearCart() { if (confirm("Clear?")) { cart = []; updateCartUI(); } }
function toggleCart() { document.getElementById('cart-sidebar').classList.toggle('active'); document.querySelector('.cart-overlay').classList.toggle('active'); }

// --- 10. CHECKOUT FLOW (Split Logic) ---

// --- NEW CHECKOUT LOGIC ---

// 1. Called when user clicks "Proceed to Pay"
function initiateCheckout() {
    if (cart.length === 0) return alert("Your cart is empty!");

    const phone = document.getElementById('cust-phone').value.trim();
    const address = document.getElementById('cust-address').value.trim();

    // Validation
    if (!/^[0-9]{10}$/.test(phone)) return alert("Please enter a valid 10-digit phone number.");
    if (address.length < 3) return alert("Please enter a complete delivery address.");

    // Get Payment Method
    const paymentMethod = document.querySelector('input[name="paymentMethod"]:checked').value;

    // Calculate Final Amount
    let total = cart.reduce((sum, i) => sum + (i.price * i.qty), 0);
    let discount = 0;
    if (appliedDiscount.type === 'percent') discount = Math.round(total * (appliedDiscount.value / 100));
    else if (appliedDiscount.type === 'flat') discount = appliedDiscount.value;
    const finalAmount = Math.max(0, total - discount);

    if (paymentMethod === 'UPI') {
        // Show UPI QR Modal
        document.getElementById('pay-modal-total').innerText = '₹' + finalAmount;

        // Generate UPI Link
        const upiLink = `upi://pay?pa=${shopConfig.upiId}&pn=NamoNamkeen&am=${finalAmount}&cu=INR`;
        const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(upiLink)}`;

        document.getElementById('payment-qr-img').src = qrApiUrl;
        document.getElementById('payment-modal').style.display = 'flex';
        toggleCart(); // Close sidebar so they focus on payment
    } else {
        // COD - Directly Finalize
        if (confirm("Place order with Cash on Delivery?")) {
            finalizeOrder('COD');
        }
    }
}

// --- UNIFIED CHECKOUT HANDLER ---
function handleCheckout() {
    // 1. Get Elements safely
    const phoneInput = document.getElementById('cust-phone');
    const addressInput = document.getElementById('cust-address');

    // Safety Check to prevent the "null" error
    if (!phoneInput || !addressInput) {
        alert("Error: Checkout form not loaded correctly. Please refresh.");
        return;
    }

    const phone = phoneInput.value.trim();
    const address = addressInput.value.trim();

    // 2. Validate
    if (cart.length === 0) return alert("Your cart is empty!");
    if (!/^[0-9]{10}$/.test(phone)) return alert("Please enter a valid 10-digit mobile number.");
    if (address.length < 5) return alert("Please enter a complete delivery address.");

    // 3. PROCEED DIRECTLY (Do not force login)
    // We will handle "Guest" status inside the payment functions
    initiateRazorpayPayment();
}
// 2. Called when payment is confirmed (UPI) or immediately (COD)
async function finalizeOrder(paymentMode) {
    toggleBtnLoading('btn-final-checkout', true); // Show loading

    const phone = document.getElementById('cust-phone').value;
    const address = document.getElementById('cust-address').value;
    const orderId = 'ORD-' + Date.now().toString().slice(-6);

    // Calculate Totals again for security
    let total = cart.reduce((sum, i) => sum + (i.price * i.qty), 0);
    let discount = 0;
    if (appliedDiscount.type === 'percent') discount = Math.round(total * (appliedDiscount.value / 100));
    else if (appliedDiscount.type === 'flat') discount = appliedDiscount.value;
    const finalAmount = Math.max(0, total - discount);

    try {
        // SAVE TO FIRESTORE FIRST
        await db.collection("orders").add({
            id: orderId,
            userId: currentUser.uid,
            userName: currentUser.displayName,
            userPhone: phone,
            userAddress: address,
            items: cart,
            total: finalAmount,
            discount: appliedDiscount,
            paymentMethod: paymentMode,
            status: 'Pending',
            paymentStatus: paymentMode === 'UPI' ? 'Paid (User Confirmed)' : 'Pending',
            timestamp: new Date()
        });

        // SUCCESS!
        cart = []; // Clear cart
        updateCartUI();
        document.getElementById('payment-modal').style.display = 'none'; // Close payment modal if open
        if (document.getElementById('cart-sidebar').classList.contains('active')) toggleCart();

        // Prepare WhatsApp Message
        let msg = `*New Order: ${orderId}*\n*Payment:* ${paymentMode}\n*Name:* ${currentUser.displayName}\n*Phone:* ${phone}\n*Address:* ${address}\n\n*Items:*\n`;
        // Use a temp variable for cart items since we just cleared the main cart
        // (Note: In a real app, store a copy before clearing. For now, we assume success).
        // Actually, let's just use a generic message or pass items. 
        // Better: Don't clear cart immediately or use a temp variable. 
        // For simplicity, we will just link the WhatsApp button.

        msg += `(Check Admin Panel for Item Details)\n`;
        msg += `*Total Amount:* ₹${finalAmount}`;

        // Show Success Modal
        document.getElementById('success-order-id').innerText = orderId;
        const waBtn = document.getElementById('wa-link-btn');
        waBtn.onclick = () => {
            window.open(`https://wa.me/${shopConfig.adminPhone}?text=${encodeURIComponent(msg)}`, '_blank');
        };

        document.getElementById('success-modal').style.display = 'flex';

    } catch (error) {
        console.error("Order Error:", error);
        alert("Failed to place order. Please try again.");
    } finally {
        toggleBtnLoading('btn-final-checkout', false);
    }
}

// Add togglePaymentUI helper if you want to change button text dynamically
function togglePaymentUI() {
    const method = document.querySelector('input[name="paymentMethod"]:checked').value;
    const btn = document.getElementById('btn-final-checkout');
    if (method === 'UPI') btn.innerHTML = 'Proceed to Pay <i class="fas fa-qrcode"></i>';
    else btn.innerHTML = 'Place Order <i class="fas fa-check"></i>';
}

// --- 11. AUTH & HISTORY ---
function validateAndLogin() {
    if (document.getElementById('cust-phone').value.length < 10) { alert("Enter valid phone"); return; }
    googleLogin();
}

function googleLogin(isCheckoutFlow = false) {
    // Show loading on the main checkout button if in checkout flow
    if (isCheckoutFlow) toggleBtnLoading('btn-main-checkout', true);
    else toggleBtnLoading('login-btn', true);

    auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()).then(res => {
        // Save User Data
        db.collection("users").doc(res.user.uid).set({
            name: res.user.displayName,
            email: res.user.email,
            phone: document.getElementById('cust-phone').value, // Auto-save phone if entered
            address: document.getElementById('cust-address').value, // Auto-save address
            lastLogin: new Date()
        }, { merge: true });

        // If this was triggered from Checkout, auto-start payment after login
        if (isCheckoutFlow) {
            initiateRazorpayPayment();
        }

    }).catch(e => {
        alert(e.message);
        if (isCheckoutFlow) toggleBtnLoading('btn-main-checkout', false);
        else toggleBtnLoading('login-btn', false);
    });
}

function updateUserUI(loggedIn) {
    if (loggedIn) {
        document.getElementById('login-btn').style.display = 'none';
        document.getElementById('user-profile').style.display = 'block';
        document.getElementById('user-pic').src = currentUser.photoURL;
        document.getElementById('user-name').innerText = currentUser.displayName;
        // Hide the "Have an account?" link in cart since they are logged in
        if (guestLink) guestLink.style.display = 'none';
    } else {
        document.getElementById('login-btn').style.display = 'block';
        document.getElementById('user-profile').style.display = 'none';
        // Show the link
        if (guestLink) guestLink.style.display = 'block';
    }
}

function showOrderHistory() {
    const modal = document.getElementById('history-modal');
    const content = document.getElementById('history-content');
    modal.classList.add('active');

    if (!currentUser) {
        content.innerHTML = '<p style="padding:20px; text-align:center;">Please login to view your past orders.</p>';
        return;
    }

    content.innerHTML = '<p style="padding:20px; text-align:center;">Loading history...</p>';

    db.collection("orders")
        .where("userId", "==", currentUser.uid)
        .orderBy("timestamp", "desc")
        .limit(20)
        .get()
        .then(snap => {
            if (snap.empty) {
                content.innerHTML = '<p style="padding:20px; text-align:center;">No past orders found.</p>';
                return;
            }
            historyOrders = [];
            let html = '';
            snap.forEach(doc => {
                const o = doc.data();
                historyOrders.push(o);
                const date = o.timestamp ? o.timestamp.toDate().toLocaleDateString() : 'N/A';
                let statusColor = '#e67e22';
                if (o.status === 'Packed') statusColor = '#3498db';
                if (o.status === 'Delivered') statusColor = '#2ecc71';

                // NEW Code:
                const itemsList = o.items.map(i => {
                    // Check if this item allows rating (only standard products, not custom hampers if logic gets complex)
                    // We pass ID, Name, Image to the function
                    return `
    <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.9rem; color:#555; margin-bottom:8px; border-bottom:1px solid #f0f0f0; padding-bottom:5px;">
        <div style="display:flex; align-items:center;">
            <img src="${i.image}" style="width:30px; height:30px; border-radius:4px; margin-right:8px; object-fit:cover;">
            <div>
                <div>${i.name} (${i.weight})</div>
                <small>Qty: ${i.qty}</small>
            </div>
        </div>
        <div style="display:flex; align-items:center;">
            <span style="margin-right:5px;">₹${i.price * i.qty}</span>
            <button class="btn-rate" onclick="openReviewModal('${i.productId}', '${o.id}', '${encodeURIComponent(i.name)}', '${encodeURIComponent(i.image)}')">
                <i class="far fa-star"></i> Rate
            </button>
        </div>
    </div>`;
                }).join('');

                html += `
                    <div style="background:white; border:1px solid #eee; border-radius:10px; padding:15px; margin-bottom:15px; box-shadow:0 2px 5px rgba(0,0,0,0.05);">
                        <div style="display:flex; justify-content:space-between; border-bottom:1px dashed #ddd; padding-bottom:8px; margin-bottom:10px;">
                            <div><strong style="color:#333;">${date}</strong><div style="font-size:0.75rem; color:#999;">#${o.id}</div></div>
                            <span style="color:${statusColor}; font-weight:bold; font-size:0.85rem; text-transform:uppercase;">${o.status}</span>
                        </div>
                        <div style="margin-bottom:10px;">${itemsList}</div>
                        <div style="display:flex; justify-content:space-between; border-top:1px dashed #ddd; padding-top:10px; margin-bottom:10px; font-weight:bold; color:#333;">
                            <span>Total</span><span style="color:var(--primary);">₹${o.total}</span>
                        </div>
                        <div style="display:flex; gap:10px; border-top:1px solid #eee; padding-top:10px;">
                            <button onclick="openInvoice('${o.id}')" style="flex:1; padding:8px; background:white; border:1px solid #e85d04; color:#e85d04; border-radius:5px; cursor:pointer;"><i class="fas fa-file-invoice"></i> Invoice</button>
                            <button onclick="repeatOrder('${o.id}')" style="flex:1; padding:8px; background:#e85d04; color:white; border:none; border-radius:5px; cursor:pointer;"><i class="fas fa-redo"></i> Repeat</button>
                        </div>
                    </div>`;
            });
            content.innerHTML = html;
        })
        .catch(err => {
            console.error("History Error:", err);
            content.innerHTML = '<p style="padding:20px; color:red; text-align:center;">Failed to load history.</p>';
        });
}

function closeHistory() { document.getElementById('history-modal').classList.remove('active'); }

// Invoice & Repeat
function openInvoice(orderId) {
    const order = historyOrders.find(o => o.id === orderId);
    if (!order) return alert("Order details not found.");
    document.getElementById('inv-customer-name').innerText = order.userName;
    document.getElementById('inv-customer-email').innerText = currentUser.email || '-';
    document.getElementById('inv-order-id').innerText = `#${order.id}`;
    document.getElementById('inv-date').innerText = order.timestamp ? new Date(order.timestamp.seconds * 1000).toLocaleDateString() : '-';
    const tbody = document.getElementById('inv-items-body');
    tbody.innerHTML = '';
    order.items.forEach(i => {
        tbody.innerHTML += `<tr><td>${i.name} <br><small>${i.weight}</small></td><td class="text-center">${i.qty}</td><td class="text-right">₹${i.price}</td><td class="text-right">₹${i.price * i.qty}</td></tr>`;
    });
    document.getElementById('inv-grand-total').innerText = `₹${order.total}`;
    const upiLink = `upi://pay?pa=9826698822@paytm&pn=NamoNamkeen&am=${order.total}&cu=INR`;
    document.getElementById('inv-qr-img').src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(upiLink)}`;
    document.getElementById('invoice-modal').style.display = 'flex';
}
function closeInvoice() { document.getElementById('invoice-modal').style.display = 'none'; }
function printInvoice() { window.print(); }
function repeatOrder(orderId) {
    const order = historyOrders.find(o => o.id === orderId);
    if (!order) return;
    if (confirm("Add all items from this order to your cart?")) {
        order.items.forEach(item => {
            const cartId = item.cartId || `${item.productId}-${item.weight.replace(/\s/g, '')}`;
            const existing = cart.find(c => c.cartId === cartId);
            if (existing) existing.qty += item.qty; else cart.push({ ...item, cartId: cartId });
        });
        updateCartUI(); toggleCart(); closeHistory();
    }
}

// --- HELPER ---
function logout() { auth.signOut().then(() => location.reload()); }
function toggleProfileMenu() { document.getElementById('profile-menu').classList.toggle('active'); }
function closeSuccessModal() { document.getElementById('success-modal').style.display = 'none'; }
function toggleCouponList() { const l = document.getElementById('coupon-list'); l.style.display = l.style.display === 'none' ? 'block' : 'none'; }
function useCoupon(code) { document.getElementById('promo-code').value = code; applyPromo(); document.getElementById('coupon-list').style.display = 'none'; }
function applyPromo() {
    const input = document.getElementById('promo-code').value.toUpperCase().trim();
    if (!input) { appliedDiscount = { type: 'none', value: 0, code: null }; document.getElementById('promo-msg').innerText = ""; updateCartUI(); return; }
    const coupon = activeCoupons.find(c => c.code === input);
    if (coupon) { appliedDiscount = { code: coupon.code, type: coupon.type, value: coupon.value }; document.getElementById('promo-msg').innerText = "Code Applied!"; document.getElementById('promo-msg').style.color = "green"; }
    else { appliedDiscount = { type: 'none', value: 0, code: null }; document.getElementById('promo-msg').innerText = "Invalid Code"; document.getElementById('promo-msg').style.color = "red"; }
    updateCartUI();
}
function openProfileModal() { document.getElementById('profile-modal').style.display = 'flex'; document.getElementById('profile-menu').classList.remove('active'); }
function closeProfileModal() { document.getElementById('profile-modal').style.display = 'none'; }
function saveProfile() { db.collection("users").doc(currentUser.uid).set({ phone: document.getElementById('edit-phone').value, address: document.getElementById('edit-address').value }, { merge: true }).then(() => closeProfileModal()); }
function playVideo(w) { const v = w.querySelector('video'); document.querySelectorAll('.video-wrapper.playing video').forEach(o => { if (o !== v) { o.pause(); o.closest('.video-wrapper').classList.remove('playing'); } }); if (v.paused) { w.classList.add('playing'); v.play(); } else { w.classList.remove('playing'); v.pause(); } }
function closeAnnouncement() { document.getElementById('announcement-bar').style.display = 'none'; }
function filterMenu(c) { currentCategory = c; document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active')); event.target.classList.add('active'); renderMenu(); }
function searchMenu() { searchQuery = document.getElementById('menu-search').value; renderMenu(); }
function toggleLanguage() { currentLang = currentLang === 'en' ? 'hi' : 'en'; renderMenu(); updateCartUI(); }
function toggleMobileMenu() { document.getElementById('mobile-nav').classList.toggle('active'); }
function scrollToTop() { window.scrollTo({ top: 0, behavior: 'smooth' }); }

// --- COUPON LIST RENDERER (Missing Function) ---
function renderCouponList() {
    const listContainer = document.getElementById('coupon-list');
    if (!listContainer) return;
    listContainer.innerHTML = '';

    if (activeCoupons.length === 0) {
        listContainer.innerHTML = '<p style="font-size:0.8rem; color:#777;">No active coupons.</p>';
        return;
    }

    activeCoupons.forEach(c => {
        const desc = c.type === 'percent' ? `${c.value}% OFF` : `₹${c.value} OFF`;
        listContainer.innerHTML += `
            <div class="coupon-item" onclick="useCoupon('${c.code}')" style="padding:10px; border-bottom:1px solid #eee; cursor:pointer;">
                <strong style="color:var(--primary)">${c.code}</strong> - ${desc}
            </div>`;
    });
}

function registerServiceWorker() {
    // Only register if supported AND running on http/https (not file://)
    if ('serviceWorker' in navigator && (window.location.protocol === 'http:' || window.location.protocol === 'https:')) {
        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log("Service Worker Registered"))
            .catch(err => console.log("SW Registration Failed:", err));
    }
}

// NEW HELPER: Toggles button loading state
function toggleBtnLoading(btnId, isLoading) {
    const btn = document.getElementById(btnId);
    if (!btn) return;

    if (isLoading) {
        btn.dataset.originalText = btn.innerHTML; // Save original text/icon
        btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Processing...';
        btn.disabled = true;
        btn.style.opacity = "0.7";
    } else {
        if (btn.dataset.originalText) btn.innerHTML = btn.dataset.originalText; // Restore
        btn.disabled = false;
        btn.style.opacity = "1";
    }

    // --- NEW RAZORPAY PAYMENT LOGIC ---

    function initiateRazorpayPayment() {
        if (cart.length === 0) return alert("Your cart is empty!");

        const phone = document.getElementById('cust-phone').value.trim();
        const address = document.getElementById('cust-address').value.trim();

        // Basic Validation
        if (!/^[0-9]{10}$/.test(phone)) return alert("Please enter a valid 10-digit mobile number.");
        if (address.length < 5) return alert("Please enter a complete address.");

        // Check Payment Method (Assuming you added the radio buttons from previous step)
        // If you haven't added radio buttons, we default to Online Payment
        const methodElem = document.querySelector('input[name="paymentMethod"]:checked');
        const paymentMethod = methodElem ? methodElem.value : 'Online';

        // Calculate Amount
        let total = cart.reduce((sum, i) => sum + (i.price * i.qty), 0);
        let discount = 0;
        if (appliedDiscount.type === 'percent') discount = Math.round(total * (appliedDiscount.value / 100));
        else if (appliedDiscount.type === 'flat') discount = appliedDiscount.value;

        const finalAmountINR = Math.max(0, total - discount); // Amount in Rupees
        const amountPaise = finalAmountINR * 100; // Razorpay takes amount in Paise

        if (paymentMethod === 'COD') {
            // Cash on Delivery Flow
            if (confirm(`Place order for ₹${finalAmountINR} via Cash on Delivery?`)) {
                saveOrderToFirebase('COD', 'Pending', null);
            }
        } else {
            // Online Payment Flow (Razorpay)
            openRazorpayModal(amountPaise, finalAmountINR, phone);
        }
    }

    function openRazorpayModal(amountPaise, amountINR, userPhone) {
        // Determine User Details (Guest or Logged In)
        const userName = currentUser ? currentUser.displayName : "Guest User";
        const userEmail = currentUser ? currentUser.email : "guest@namonamkeen.com";

        var options = {
            "key": razorpayKeyId,
            "amount": amountPaise,
            "currency": "INR",
            "name": "Namo Namkeen",
            "description": "Order Payment",
            "image": "logo.jpg",
            "handler": function (response) {
                console.log("Payment ID: ", response.razorpay_payment_id);
                saveOrderToFirebase('Online', 'Paid', response.razorpay_payment_id);
            },
            "prefill": {
                "name": userName,
                "email": userEmail,
                "contact": userPhone
            },
            "theme": { "color": "#e85d04" },
            "modal": {
                "ondismiss": function () { alert('Payment cancelled.'); }
            }
        };

        var rzp1 = new Razorpay(options);
        rzp1.on('payment.failed', function (response) {
            alert("Payment Failed: " + response.error.description);
        });
        rzp1.open();
    }

    async function saveOrderToFirebase(method, paymentStatus, txnId) {
        toggleBtnLoading('btn-main-checkout', true);

        const phone = document.getElementById('cust-phone').value;
        const address = document.getElementById('cust-address').value;
        const orderId = 'ORD-' + Date.now().toString().slice(-6);

        // Determine User ID (Use Auth UID or generate a Guest ID based on phone)
        const uid = currentUser ? currentUser.uid : ("guest_" + phone);
        const uName = currentUser ? currentUser.displayName : "Guest";

        let total = cart.reduce((sum, i) => sum + (i.price * i.qty), 0);
        // ... (rest of discount calc logic remains same) ...
        let discount = 0;
        if (appliedDiscount.type === 'percent') discount = Math.round(total * (appliedDiscount.value / 100));
        else if (appliedDiscount.type === 'flat') discount = appliedDiscount.value;
        const finalAmount = Math.max(0, total - discount);

        try {
            await db.collection("orders").add({
                id: orderId,
                userId: uid,          // Save as Guest ID if not logged in
                userName: uName,
                userPhone: phone,
                userAddress: address,
                items: cart,
                total: finalAmount,
                discount: appliedDiscount,
                paymentMethod: method,
                status: 'Pending',
                paymentStatus: paymentStatus,
                transactionId: txnId || '',
                timestamp: new Date()
            });

            // Update UI
            showSuccessModal(orderId, finalAmount, method);
            cart = [];
            updateCartUI();
            if (document.getElementById('cart-sidebar').classList.contains('active')) toggleCart();

        } catch (error) {
            console.error("DB Error:", error);
            alert("Error saving order.");
        } finally {
            toggleBtnLoading('btn-main-checkout', false);
        }
    }

    function showSuccessModal(orderId, amount, method) {
        const msg = `*New Order: ${orderId}*\n*Method:* ${method}\n*Amount:* ₹${amount}\n*Customer:* ${currentUser.displayName}\n*Address:* ${document.getElementById('cust-address').value}\n\n*Payment:* ${method === 'Online' ? 'PAID ✅' : 'Cash on Delivery 🚚'}`;

        document.getElementById('success-order-id').innerText = orderId;

        // Update the WhatsApp Button
        const waBtn = document.getElementById('wa-link-btn'); // Ensure this ID exists in your success modal HTML
        if (waBtn) {
            waBtn.onclick = () => {
                window.open(`https://wa.me/${shopConfig.adminPhone}?text=${encodeURIComponent(msg)}`, '_blank');
            };
        }

        document.getElementById('success-modal').style.display = 'flex';
    }

    // --- USER REVIEW SYSTEM ---

    function openReviewModal(pid, oid, name, img) {
        document.getElementById('review-modal').style.display = 'flex';
        document.getElementById('review-pid').value = pid;
        document.getElementById('review-oid').value = oid;
        document.getElementById('review-p-name').innerText = decodeURIComponent(name);
        document.getElementById('review-p-img').src = decodeURIComponent(img);
        document.getElementById('review-comment').value = '';

        // Reset stars
        document.querySelectorAll('input[name="rating"]').forEach(r => r.checked = false);
    }

    async function submitReview() {
        const pid = parseInt(document.getElementById('review-pid').value); // ID is integer in your DB
        const oid = document.getElementById('review-oid').value;
        const comment = document.getElementById('review-comment').value.trim();
        const ratingElem = document.querySelector('input[name="rating"]:checked');

        if (!ratingElem) return alert("Please select a star rating!");
        const rating = parseInt(ratingElem.value);

        toggleBtnLoading('btn-submit-review', true);

        try {
            // 1. Check if user already reviewed this item in this order to prevent duplicates
            const check = await db.collection("reviews")
                .where("orderId", "==", oid)
                .where("productId", "==", pid)
                .get();

            if (!check.empty) {
                alert("You have already reviewed this item!");
                toggleBtnLoading('btn-submit-review', false);
                return;
            }

            // 2. Add Review to 'reviews' collection
            await db.collection("reviews").add({
                productId: pid,
                orderId: oid,
                userId: currentUser.uid,
                userName: currentUser.displayName,
                rating: rating,
                comment: comment,
                timestamp: new Date()
            });

            // 3. Update Product Stats (Rating Sum & Count) using Atomic Increment
            // Note: product IDs are numbers in your system, stored as document IDs (strings)
            const productRef = db.collection("products").doc(String(pid));

            await productRef.update({
                ratingSum: firebase.firestore.FieldValue.increment(rating),
                ratingCount: firebase.firestore.FieldValue.increment(1)
            });

            alert("Thanks for your feedback!");
            closeModal('review-modal');

            // Refresh data to show new stars on menu
            fetchData();

        } catch (error) {
            console.error("Review Error:", error);
            alert("Failed to submit review. Try again.");
        } finally {
            toggleBtnLoading('btn-submit-review', false);
        }
    }
}