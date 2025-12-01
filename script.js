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
db.enablePersistence()
    .catch((err) => {
        if (err.code == 'failed-precondition') {
            console.log('Persistence failed: Multiple tabs open');
        } else if (err.code == 'unimplemented') {
            console.log('Persistence not supported by browser');
        }
    });
const auth = firebase.auth();

// --- 2. STATE VARIABLES ---
let products = [];
let cart = [];
let currentUser = null;
let userProfile = null;
let currentCategory = 'all';
let searchQuery = '';
let currentLang = 'en';
let selectedHamperItems = [];
let historyOrders = [];

// NEW: Add this Shop Config
// ⚠️ CRITICAL: razorpayKeyId must be configured before deployment
// Get from: https://dashboard.razorpay.com/app/keys
const razorpayKeyId = ""; // ⚠️ REQUIRED: Add your Razorpay Key ID
let shopConfig = {
    upiId: "8103276050@ybl", // Default fallback if DB fails
    adminPhone: "919826698822",
    deliveryCharge: 0
};

// --- STATE: Store unsubscribe functions to prevent memory leaks ---
let unsubscribeListeners = {
    coupons: null,
    config: null
};

// --- NEW HELPER: Clean up all Firestore listeners ---
function cleanupListeners() {
    if (unsubscribeListeners.coupons) unsubscribeListeners.coupons();
    if (unsubscribeListeners.config) unsubscribeListeners.config();
}

// --- 3. INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    loadCartLocal();
    fetchData();
    loadStorefront();
    // FIX: Call the robust function instead of using inline logic
    registerServiceWorker();

    auth.onAuthStateChanged(user => {
        currentUser = user;
        updateUserUI(!!user);
        if (user) {
            fetchUserProfile(user.uid); // NEW: Fetch extra details on login
        } else {
            userProfile = null;
        }
    });

    window.addEventListener('offline', () => {
        showToast("You are offline. Check your internet.", "error");
        document.body.style.filter = "grayscale(1)"; // Visual cue
    });

    window.addEventListener('online', () => {
        showToast("You are back online!", "success");
        document.body.style.filter = "none";
        fetchData(); // Refresh data to ensure it's current
    });

    // --- AUTO-FORMAT PHONE INPUT ---
    // Automatically removes spaces, dashes, and +91 when user types/pastes
    const phoneField = document.getElementById('cust-phone');
    if (phoneField) {
        phoneField.addEventListener('input', function (e) {
            // Remove everything that is NOT a number
            let clean = this.value.replace(/[^0-9]/g, '');

            // If they pasted a number starting with 91 (12 digits), strip the 91
            if (clean.length > 10 && clean.startsWith('91')) {
                clean = clean.substring(2);
            }

            // Limit to 10 digits
            if (clean.length > 10) clean = clean.slice(0, 10);

            this.value = clean;
        });

        // SECURITY: Add blur validation
        phoneField.addEventListener('blur', function () {
            const phone = this.value.trim();
            if (phone.length !== 0 && phone.length !== 10) {
                showToast("Phone must be exactly 10 digits", "error");
                this.focus();
            }
        });
    }
});

// --- NEW HELPER: Fetch User Profile from Firestore ---
function fetchUserProfile(uid) {
    db.collection("users").doc(uid).get().then(doc => {
        if (doc.exists) {
            const data = doc.data();
            // Merge Logic: Cloud cart takes precedence or merge? 
            // Simple approach: If local is empty, pull cloud. If both exist, merge.
            if (data.cart && data.cart.length > 0) {
                if (cart.length === 0) {
                    cart = data.cart;
                } else {
                    // Merge logic (avoid duplicates)
                    data.cart.forEach(cloudItem => {
                        const localItem = cart.find(c => c.cartId === cloudItem.cartId);
                        if (!localItem) cart.push(cloudItem);
                    });
                }
                updateCartUI();
                saveCartLocal(); // Sync merged back to cloud
            }
        }
    });
}

// --- HELPER: Sanitize user/product data to prevent XSS ---
function sanitizeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// --- HELPER: Safely set element text content ---
function safeSetText(element, text) {
    if (element) element.textContent = text;
}

// --- HELPER: Safely set element HTML (only trusted sources) ---
function safeSetHTML(element, html) {
    if (element) element.innerHTML = html;
}

// --- 4. DATA FETCHING ---
function fetchData() {
    // 1. Show Skeletons
    const grid = document.getElementById('menu-grid');
    if (grid) {
        let skeletonHtml = ''; // Build string first
        for (let i = 0; i < 6; i++) {
            skeletonHtml += `
            <div class="sk-card">
                <div class="skeleton sk-img"></div>
                <div class="skeleton sk-title"></div>
                <div class="skeleton sk-text"></div>
                <div class="skeleton sk-text" style="width:80%"></div>
                <div class="skeleton sk-btn"></div>
            </div>`;
        }
        grid.innerHTML = skeletonHtml;
    }
    // Products
    db.collection("products").get().then(snap => {
        products = [];
        snap.forEach(doc => products.push(doc.data()));
        products = products.filter(p => p.id !== 999);

        // --- NEW: SYNC CART PRICES ---
        if (cart.length > 0) {
            let cartUpdated = false;
            cart.forEach(item => {
                const freshProduct = products.find(p => p.id === item.productId);
                if (freshProduct) {
                    // Find matching variant to get correct price
                    let freshPrice = freshProduct.price; // Default base price
                    if (freshProduct.variants) {
                        const variant = freshProduct.variants.find(v => v.weight === item.weight);
                        if (variant) freshPrice = variant.price;
                    }

                    // Update if price changed
                    if (item.price !== freshPrice) {
                        item.price = freshPrice;
                        cartUpdated = true;
                    }
                }
            });

            if (cartUpdated) {
                saveCartLocal();
                updateCartUI();
                showToast("Cart prices updated", "neutral");
            }
        }

        initFuzzySearch();
        renderMenu();
        renderHamperOptions();
    }).catch(err => console.error("Products Error:", err));

    // NEW: Fetch Shop Configuration from Firestore
    unsubscribeListeners.config = db.collection("settings").doc("config").onSnapshot(doc => {
        if (doc.exists) {
            const data = doc.data();
            if (data.upiId) shopConfig.upiId = data.upiId;
            // FIX: Remove non-numeric characters immediately
            if (data.adminPhone) shopConfig.adminPhone = data.adminPhone.replace(/\D/g, '');
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
    unsubscribeListeners.coupons = db.collection("coupons").where("isActive", "==", true).onSnapshot(snap => {
        activeCoupons = [];
        snap.forEach(doc => {
            const c = doc.data();
            if (c.expiryDate.toDate() > now) {
                activeCoupons.push(c);
            }
        });
        renderCouponList();

        // NEW FIX: Re-validate applied coupon against fresh data
        validateAppliedCoupon();
    });
}

// Add this new function to script.js
function validateAppliedCoupon() {
    if (!appliedDiscount || !appliedDiscount.code) return;

    const validCoupon = activeCoupons.find(c => c.code === appliedDiscount.code);

    // 1. Check if coupon still exists and is active
    if (!validCoupon) {
        appliedDiscount = { type: 'none', value: 0, code: null };
        showToast("Saved coupon is no longer valid.", "error");
        updateCartUI();
        return;
    }

    // 2. Check Minimum Order Value again
    let currentTotal = cart.reduce((sum, i) => sum + (i.price * i.qty), 0);
    if (validCoupon.minOrder && currentTotal < validCoupon.minOrder) {
        appliedDiscount = { type: 'none', value: 0, code: null };
        showToast(`Coupon removed. Add items worth ₹${validCoupon.minOrder}`, "error");
        updateCartUI();
    }
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
           <img src="${p.image}" class="product-img" loading="lazy" onload="this.classList.add('loaded')" onerror="this.onerror=null; this.src='logo.jpg';">
            <div class="product-info">
                <h3>${sanitizeHTML(name)}</h3>
                ${starHTML} <p class="product-desc">${sanitizeHTML(desc)}</p>
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
        const img = document.createElement('img');
        img.src = p.image;
        img.onerror = () => { img.src = 'logo.jpg'; };

        const h4 = document.createElement('h4');
        h4.textContent = p.name; // Use textContent to prevent XSS

        div.appendChild(img);
        div.appendChild(h4);
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
                showToast("Total value too high! Try a cheaper item.", "success");
                return;
            }
            selectedHamperItems.push(p);
            el.classList.add('selected');
        } else {
            showToast("Select only 3 items!", "success");
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
    if (!products || products.length === 0) { showToast("Loading...", "success"); return; }
    document.getElementById('quiz-modal').style.display = 'flex';
    startQuiz();
}

function closeQuiz() {
    document.getElementById('quiz-modal').style.display = 'none';
}

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
    document.getElementById('quiz-content').innerHTML = `<div class="quiz-result"><h3 style="color:green">Try This!</h3><img src="${p.image}" class="result-img" onerror="this.onerror=null; this.src='logo.jpg';"><h2>${p.name}</h2><button class="btn-primary" style="padding:10px;" onclick="openProductDetail(${p.id}); closeQuiz();">View</button></div>`;
}

// --- 8. PRODUCT MODAL ---
function openProductDetail(id) {
    const p = products.find(x => x.id === id);
    updateSchema(p);
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

    // 1. Create the Share Link
    const shareText = encodeURIComponent(`Check out this ${name} from Namo Namkeen! It looks delicious. 😋 Order here: https://namonamkeen.shop`);
    const shareUrl = `https://wa.me/?text=${shareText}`;

    let html = `
        <div class="pm-grid">
            <div class="pm-image-container">
                <img src="${p.image}" class="pm-img" onerror="this.onerror=null; this.src='logo.jpg';">
            </div>

            <div class="pm-details">
                <div style="display:flex; justify-content:space-between; align-items:start;">
                <span class="pm-category">${category}</span>
                <a href="${shareUrl}" target="_blank" style="color:#25D366; font-size:1.2rem;" title="Share on WhatsApp">
                    <i class="fab fa-whatsapp"></i>
                </a>
            </div>
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

// 1. Add this function to script.js
async function cancelOrder(docId) {
    if (!docId) return showToast("Error: Invalid Order ID", "error");

    // FIX: Wait for confirmation
    if (!await showConfirm("Are you sure you want to cancel this order?")) return;

    try {
        await db.collection("orders").doc(docId).update({
            status: "Cancelled",
            cancelledBy: "User",
            cancelledAt: new Date()
        });

        showToast("Order Cancelled Successfully.", "success");
        showOrderHistory(); // Refresh UI
    } catch (e) {
        console.error("Cancel Error:", e);
        showToast("Could not cancel order.", "error");
    }
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
// --- 9. CART ---
function addToCart(p, v) {
    const cartId = `${p.id}-${v.weight.replace(/\s/g, '')}`;
    const ex = cart.find(i => i.cartId === cartId);

    if (ex) {
        ex.qty++;
        showToast(`Updated ${p.name} quantity (+1)`, "success");
    } else {
        cart.push({
            cartId: cartId,
            productId: p.id,
            name: p.name,
            image: p.image,
            weight: v.weight,
            price: v.price,
            qty: 1
        });
        showToast(`${p.name} added to cart! 🛒`, "success");
    }

    updateCartUI();
    // toggleCart(); <--- REMOVED: Don't open sidebar automatically
    saveCartLocal();
    vibrate(50); // Haptic feedback remains

    // Optional: Animate the cart icon to catch attention
    const cartIcon = document.querySelector('.cart-trigger i');
    if (cartIcon) {
        cartIcon.style.transform = "scale(1.4)";
        setTimeout(() => cartIcon.style.transform = "scale(1)", 200);
    }
}

function updateCartUI() {
    // --- FEATURE: Professional Shipping Meter ---
    const freeShipLimit = shopConfig.freeShippingThreshold || 250;
    const deliveryFee = shopConfig.deliveryCharge || 0;
    const con = document.getElementById('cart-items');
    if (!con) return;
    con.innerHTML = '';

    // 1. Initialize variables safely
    let subtotal = 0, count = 0;
    let finalDeliveryCost = 0;

    // Elements
    const clearBtn = document.getElementById('clear-cart-btn');
    const promoCodeInput = document.getElementById('promo-code');
    const promoMsg = document.getElementById('promo-msg');
    const detailsBlock = document.querySelector('.cart-details-block');
    const checkoutBtn = document.getElementById('btn-main-checkout');

    if (cart.length === 0) {
        con.innerHTML = `
            <div class="empty-cart-state">
                <i class="fas fa-shopping-basket"></i>
                <p>Your plate is empty!</p>
                <button class="btn-shop-now" onclick="toggleCart()">Start Ordering</button>
            </div>`;

        if (clearBtn) clearBtn.style.display = 'none';
        if (detailsBlock) detailsBlock.style.display = 'none';
        if (checkoutBtn) checkoutBtn.style.display = 'none';

        appliedDiscount = { type: 'none', value: 0, code: null };
        if (promoCodeInput) promoCodeInput.value = '';

        finalDeliveryCost = 0;

    } else {
        if (clearBtn) clearBtn.style.display = 'flex';
        if (detailsBlock) detailsBlock.style.display = 'block';
        if (checkoutBtn) checkoutBtn.style.display = 'flex';

        let loyaltyHtml = '';
        if (currentUser && userProfile && userProfile.walletBalance > 0) {
            const maxRedeemable = Math.min(userProfile.walletBalance, subtotal); // Can't redeem more than order value

            // Check if already applied
            const isChecked = (appliedDiscount.type === 'loyalty') ? 'checked' : '';

            loyaltyHtml = `
    <div style="background:#fff8e1; padding:10px; border-radius:8px; margin-bottom:15px; border:1px dashed #e85d04; display:flex; align-items:center; gap:10px;">
        <i class="fas fa-coins" style="color:#f1c40f;"></i>
        <div style="flex:1;">
            <div style="font-weight:600; font-size:0.9rem;">Use Namo Coins</div>
            <div style="font-size:0.8rem; color:#666;">Balance: ${userProfile.walletBalance} (Save ₹${maxRedeemable})</div>
        </div>
        <input type="checkbox" id="use-coins" ${isChecked} onchange="toggleLoyalty(${maxRedeemable})">
    </div>`;

            // Inject the loyalty HTML into the container we just created
            const loyaltyContainer = document.getElementById('loyalty-section');
            if (loyaltyContainer) {
                loyaltyContainer.innerHTML = loyaltyHtml;
            }
        }



        // Calculate total strictly for shipping logic
        let currentTotal = cart.reduce((sum, i) => sum + (i.price * i.qty), 0);

        if (currentTotal >= freeShipLimit) {
            // CASE A: Free Delivery Unlocked (Show Badge)
            finalDeliveryCost = 0;
            con.innerHTML += `
                <div class="shipping-bar-container" style="background: #ecfdf5; border: 1px solid #a7f3d0; padding: 12px;">
                    <div style="color: #059669; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 0.95rem;">
                        <i class="fas fa-check-circle"></i>
                        <span>Free Delivery Applied</span>
                        <i class="fas fa-shipping-fast"></i>
                    </div>
                </div>`;
        } else {
            // CASE B: Goal Not Met (Show Progress Bar)
            finalDeliveryCost = deliveryFee;
            let percent = Math.min(100, (currentTotal / freeShipLimit) * 100);

            con.innerHTML += `
                <div class="shipping-bar-container">
                    <div class="shipping-text">Add <strong>₹${freeShipLimit - currentTotal}</strong> for Free Delivery</div>
                    <div class="progress-track">
                        <div class="progress-fill" style="width: ${percent}%"></div>
                    </div>
                </div>`;
        }

        // Render Items
        cart.forEach(i => {
            subtotal += i.price * i.qty;
            count += i.qty;

            con.innerHTML += `
            <div class="cart-item">
                <img src="${i.image}" onerror="this.onerror=null; this.src='logo.jpg';">
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

    // Coupon Validation Logic
    if (appliedDiscount && appliedDiscount.code) {
        const couponRule = activeCoupons.find(c => c.code === appliedDiscount.code);
        if (couponRule && couponRule.minOrder && subtotal < couponRule.minOrder) {
            appliedDiscount = { type: 'none', value: 0, code: null };
            if (promoCodeInput) promoCodeInput.value = '';
            if (promoMsg) {
                promoMsg.innerText = `Coupon removed. Min order is ₹${couponRule.minOrder}`;
                promoMsg.style.color = "red";
            }
            showToast("Coupon removed: Minimum order not met", "error");
        }
    }

    // Calculate Final Totals
    let discountAmount = 0;
    if (appliedDiscount.type === 'percent') {
        discountAmount = Math.round(subtotal * (appliedDiscount.value / 100));
    } else if (appliedDiscount.type === 'flat') {
        discountAmount = appliedDiscount.value;
    }
    if (discountAmount > subtotal) discountAmount = subtotal;

    // Safe final calculation
    const final = (subtotal - discountAmount) + finalDeliveryCost;

    // Up-sell Logic (Only if not free shipping yet)
    const gap = freeShipLimit - final;
    if (gap > 0 && gap < 150 && cart.length > 0) {
        const upsellItem = products.find(p => p.price <= 60 && p.in_stock);
        if (upsellItem) {
            const alreadyInCart = cart.find(i => i.productId === upsellItem.id);
            if (!alreadyInCart) {
                con.innerHTML += `
                    <div style="background:#f0f9ff; border:1px dashed #0288d1; padding:10px; margin-bottom:15px; border-radius:8px; display:flex; align-items:center; justify-content:space-between;">
                        <div style="display:flex; align-items:center; gap:10px;">
                            <img src="${upsellItem.image}" style="width:40px; height:40px; border-radius:50%; object-fit:cover;">
                            <div style="font-size:0.85rem; color:#0277bd;">
                                <strong>Add ${upsellItem.name}?</strong><br>
                                Only ₹${upsellItem.price}
                            </div>
                        </div>
                        <button onclick="addToCartFromGrid(${upsellItem.id})" style="background:#0288d1; color:white; border:none; padding:5px 12px; border-radius:20px; font-size:0.75rem; cursor:pointer;">
                            + Add
                        </button>
                    </div>`;
            }
        }
    }

    // Update Footer Totals
    const totalEl = document.getElementById('cart-total');
    if (totalEl) totalEl.innerText = '₹' + final.toLocaleString('en-IN');

    const countEl = document.getElementById('cart-count');
    if (countEl) countEl.innerText = count;

    // Share Cart Button Logic
    const footer = document.querySelector('.cart-footer');
    const oldShare = document.getElementById('share-cart-btn');
    if (oldShare) oldShare.remove();

    if (cart.length > 0 && footer) {
        const shareBtn = document.createElement('button');
        shareBtn.id = 'share-cart-btn';
        shareBtn.className = 'share-cart-btn';
        shareBtn.innerHTML = '<i class="fas fa-share-alt"></i> Share Order with Family';
        shareBtn.onclick = shareCartOnWhatsApp;

        const mainBtn = document.getElementById('btn-main-checkout');
        if (mainBtn) footer.insertBefore(shareBtn, mainBtn);
    }
}

function toggleLoyalty(amount) {
    const chk = document.getElementById('use-coins');
    if (chk.checked) {
        // Cannot mix coupons and loyalty points? (Optional policy)
        document.getElementById('promo-code').value = '';
        appliedDiscount = { type: 'loyalty', value: amount, code: 'COINS' };
        showToast(`Redeemed ${amount} Coins!`, "success");
    } else {
        appliedDiscount = { type: 'none', value: 0, code: null };
    }
    updateCartUI();
}

// --- SHARE CART FEATURE ---
function shareCartOnWhatsApp() {
    if (cart.length === 0) return;

    let msg = "Hey! I'm ordering these snacks from Namo Namkeen:\n\n";
    cart.forEach(i => {
        msg += `• ${i.name} (${i.weight}) x ${i.qty}\n`;
    });

    let total = cart.reduce((sum, i) => sum + (i.price * i.qty), 0);
    msg += `\nTotal: ₹${total}\n\nDo you want to add anything?`;

    const url = `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
}

function highlightCat(el) {
    document.querySelectorAll('.cat-item').forEach(c => c.classList.remove('active'));
    el.classList.add('active');
}

function changeQty(id, d) {
    const i = cart.find(x => x.cartId === id);
    if (i) {
        i.qty += d;
        if (i.qty <= 0) {
            removeFromCart(id);
        } else {
            updateCartUI(); // <--- ADD THIS LINE
        }
    }
    saveCartLocal();
    vibrate(30);
}

function removeFromCart(id) {
    cart = cart.filter(x => x.cartId !== id); updateCartUI();
    saveCartLocal();
}

async function clearCart() {
    // FIX: Wait for confirmation
    if (await showConfirm("Clear your cart?")) {
        cart = [];
        appliedDiscount = { type: 'none', value: 0, code: null }; // Also clear coupons
        updateCartUI();
        saveCartLocal();
    }
}

function toggleCart() {
    document.getElementById('cart-sidebar').classList.toggle('active');
    document.querySelector('.cart-overlay').classList.toggle('active');
}

// --- UNIFIED CHECKOUT HANDLER ---
// --- UNIFIED CHECKOUT HANDLER ---
function handleCheckout() {
    // 1. Check Connectivity
    if (!navigator.onLine) {
        showToast("No Internet Connection", "error");
        return;
    }

    // --- NEW: Force Login for Guests ---
    // If the user is not logged in, stop here and ask them to login.
    if (!currentUser) {
        showToast("Please login to place an order", "neutral");
        openLoginChoiceModal(); // Opens the "Welcome Back" modal
        return;
    }
    // -----------------------------------

    // 2. Get Elements safely
    const phoneInput = document.getElementById('cust-phone');
    const addressInput = document.getElementById('cust-address');

    // Safety Check to prevent the "null" error
    if (!phoneInput || !addressInput) {
        showToast("Error: Checkout form not loaded correctly. Please refresh.", "error");
        return;
    }

    const phone = phoneInput.value.trim();
    const address = addressInput.value.trim();

    // 3. Validate
    if (cart.length === 0) return showToast("Your cart is empty!", "error");
    if (!/^[0-9]{10}$/.test(phone)) return showToast("Please enter a valid 10-digit mobile number.", "error");
    if (address.length < 5) return showToast("Please enter a complete delivery address.", "error");

    // 4. PROCEED 
    vibrate(50);
    initiateRazorpayPayment();
}

// 2. Called when payment is confirmed (UPI) or immediately (COD)
async function finalizeOrder(paymentMode) {
    toggleBtnLoading('btn-main-checkout', true);

    const phone = document.getElementById('cust-phone').value;
    const address = document.getElementById('cust-address').value;
    const orderId = 'ORD-' + Date.now().toString().slice(-6);

    // Calculate Totals again for security
    let total = cart.reduce((sum, i) => sum + (i.price * i.qty), 0);
    let discount = 0;

    // FIX: Handle Coupon Logic safely
    if (appliedDiscount && appliedDiscount.value > 0) {
        if (appliedDiscount.type === 'percent') discount = Math.round(total * (appliedDiscount.value / 100));
        else if (appliedDiscount.type === 'flat') discount = appliedDiscount.value;
    }
    const finalAmount = Math.max(0, total - discount);
    try {
        await db.collection("orders").add({
            id: orderId,
            userId: currentUser ? currentUser.uid : `guest_${phone}`, // FIX: Handle Guest User
            userName: currentUser ? currentUser.displayName : "Guest",
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
        cart = [];
        appliedDiscount = { type: 'none', value: 0, code: null }; // Reset Discount
        updateCartUI();
        document.getElementById('payment-modal').style.display = 'none';

        // FIX: Close sidebar properly
        document.getElementById('cart-sidebar').classList.remove('active');
        document.querySelector('.cart-overlay').classList.remove('active');

        // Show Success Modal
        document.getElementById('success-order-id').innerText = orderId;
        const waBtn = document.getElementById('wa-link-btn');
        let msg = `*New Order: ${orderId}* - ₹${finalAmount}\nPayment: ${paymentMode}`;
        waBtn.onclick = () => {
            window.open(`https://wa.me/${shopConfig.adminPhone}?text=${encodeURIComponent(msg)}`, '_blank');
        };

        document.getElementById('success-modal').style.display = 'flex';

    } catch (error) {
        console.error("Order Error:", error);
        showToast("Failed to place order. Please try again.", "error");
    } finally {
        // FIX: Ensure button is re-enabled even if error occurs
        toggleBtnLoading('btn-main-checkout', false);
    }
}

// Add togglePaymentUI helper if you want to change button text dynamically
function togglePaymentUI() {
    const methodElem = document.querySelector('input[name="paymentMethod"]:checked');
    if (!methodElem) return;

    const method = methodElem.value;
    const btn = document.getElementById('btn-main-checkout'); // Updated ID

    if (btn) {
        if (method === 'UPI') {
            btn.innerHTML = 'Proceed to Pay <i class="fas fa-arrow-right"></i>';
        } else {
            btn.innerHTML = 'Place Order <i class="fas fa-check"></i>';
        }
    }
}

// --- 11. AUTH & HISTORY ---
function validateAndLogin() {
    if (document.getElementById('cust-phone').value.length < 10) { showToast("Enter valid phone", "error"); return; }
    googleLogin();
}

function googleLogin(isCheckoutFlow = false) {
    if (isCheckoutFlow) toggleBtnLoading('btn-main-checkout', true);
    else toggleBtnLoading('login-btn', true);

    auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()).then(res => {
        const enteredPhone = document.getElementById('cust-phone').value;
        const enteredAddress = document.getElementById('cust-address').value;

        const updateData = {
            name: res.user.displayName,
            email: res.user.email,
            lastLogin: new Date()
        };

        if (enteredPhone) updateData.phone = enteredPhone;
        if (enteredAddress) updateData.address = enteredAddress;

        db.collection("users").doc(res.user.uid).set(updateData, { merge: true });

        if (isCheckoutFlow) {
            // FIX: Reset button before opening modal
            toggleBtnLoading('btn-main-checkout', false);
            initiateRazorpayPayment();
        }

    }).catch(e => {
        showToast(e.message, "error");
        if (isCheckoutFlow) toggleBtnLoading('btn-main-checkout', false);
        else toggleBtnLoading('login-btn', false);
    });
}

function updateUserUI(loggedIn) {
    // 1. Declare it here (Top Level of Function)
    const guestLink = document.getElementById('guest-login-option');
    if (loggedIn) {
        document.getElementById('login-btn').style.display = 'none';
        document.getElementById('user-profile').style.display = 'block';

        // Check if currentUser exists before accessing properties to prevent errors
        if (currentUser) {
            document.getElementById('user-pic').src = currentUser.photoURL || 'logo.jpg'; // Fallback image
            document.getElementById('user-name').innerText = currentUser.displayName || 'User';
        }

        loadUserAddresses();

        // Hide the guest login link if it exists
        if (guestLink) guestLink.style.display = 'none';

    } else {
        document.getElementById('login-btn').style.display = 'block';
        document.getElementById('user-profile').style.display = 'none';

        // Show the guest login link if it exists
        if (guestLink) guestLink.style.display = 'block';
    }
}

function showOrderHistory() {
    ensureModalExists('history-modal'); // <--- Inject if missing
    ensureModalExists('invoice-modal'); // <--- Needed for invoice button inside history

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

            let html = '';
            historyOrders = []; // 1. FIX: Reset the global array for Invoices

            snap.forEach(doc => {
                const o = doc.data();
                o.docId = doc.id; // 2. FIX: Save the REAL Document ID for Cancellation
                historyOrders.push(o); // 3. FIX: Store data so Invoice works

                const date = o.timestamp ? o.timestamp.toDate().toLocaleDateString() : 'N/A';

                // 1. Timeline Logic
                let progress = '0%';
                let lineClass = ''; // For red line
                let s1 = '', s2 = '', s3 = '';

                if (o.status === 'Pending') {
                    progress = '0%'; s1 = 'active';
                } else if (o.status === 'Packed') {
                    progress = '50%'; s1 = 'active'; s2 = 'active';
                } else if (o.status === 'Delivered') {
                    progress = '100%'; s1 = 'active'; s2 = 'active'; s3 = 'active';
                } else if (o.status === 'Cancelled') {
                    progress = '100%';
                    lineClass = 'cancelled'; // Triggers red CSS
                    s1 = 'cancelled'; s2 = 'cancelled'; s3 = 'cancelled'; // All red dots
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

                // 2. Button Logic (Hide controls if Cancelled)
                let actionButtons = '';
                if (o.status === 'Pending') {
                    actionButtons = `
        <button onclick="cancelOrder('${o.docId}')" style="flex:1; padding:8px; background:#ffebee; color:#c62828; border:1px solid #ef9a9a; border-radius:5px; cursor:pointer;">Cancel Order</button>
        <button onclick="openInvoice('${o.id}')" style="flex:1; padding:8px; border:1px solid #e85d04; background:white; color:#e85d04; border-radius:5px; cursor:pointer;">Invoice</button>
    `;
                } else if (o.status === 'Cancelled') {
                    actionButtons = `
        <button disabled style="flex:1; padding:8px; background:#eee; color:#999; border:none; border-radius:5px; cursor:not-allowed;">Order Cancelled</button>
        <button onclick="repeatOrder('${o.id}')" style="flex:1; padding:8px; background:#e85d04; color:white; border:none; border-radius:5px; cursor:pointer;">Re-Order</button>
    `;
                } else {
                    actionButtons = `
        <button onclick="openInvoice('${o.id}')" style="flex:1; padding:8px; border:1px solid #e85d04; background:white; color:#e85d04; border-radius:5px; cursor:pointer;">Invoice</button>
        <button onclick="repeatOrder('${o.id}')" style="flex:1; padding:8px; background:#e85d04; color:white; border:none; border-radius:5px; cursor:pointer;">Repeat</button>
    `;
                }

                // Items List
                const itemsList = o.items.map(i =>
                    `<div style="display:flex; justify-content:space-between; align-items:center; font-size:0.9rem; color:#555; margin-bottom:8px; border-bottom:1px solid #f0f0f0; padding-bottom:5px;">
                        <div style="display:flex; align-items:center;">
                            <img src="${i.image}" style="width:30px; height:30px; border-radius:4px; margin-right:8px; object-fit:cover;">
                            <div><div>${i.name}</div><small>x ${i.qty}</small></div>
                        </div>
                        <button class="btn-rate" onclick="openReviewModal('${i.productId}', '${o.id}', '${encodeURIComponent(i.name)}', '${encodeURIComponent(i.image)}')"><i class="far fa-star"></i> Rate</button>
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

function closeHistory() {
    document.getElementById('history-modal').classList.remove('active');
}

// Invoice & Repeat
function openInvoice(orderId) {
    const order = historyOrders.find(o => o.id === orderId);
    if (!order) return showToast("Order details not found.", "error");
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

    // FIX: Use Dynamic UPI ID from Config
    const upiLink = `upi://pay?pa=${shopConfig.upiId}&pn=NamoNamkeen&am=${order.total}&cu=INR`;
    document.getElementById('inv-qr-img').src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(upiLink)}`;
    document.getElementById('invoice-modal').style.display = 'flex';
}

function closeInvoice() {
    document.getElementById('invoice-modal').style.display = 'none';
}
function printInvoice() {
    window.print();
}
// In script.js

// --- SMART RE-ORDER FUNCTION ---
async function repeatOrder(orderId) {
    const order = historyOrders.find(o => o.id === orderId);
    if (!order) return;

    // FIX: Use await to actually wait for user click
    if (!await showConfirm("Add available items from this order to your cart?")) return;

    let addedCount = 0;
    let outOfStockItems = [];

    order.items.forEach(item => {
        // 1. Find the current live product info to check real-time stock/price
        const liveProduct = products.find(p => p.id === item.productId);

        let isAvailable = false;
        let currentPrice = item.price;

        // 2. Check if product exists and is globally in stock
        if (liveProduct && liveProduct.in_stock) {
            isAvailable = true;

            // 3. If it has variants, check if the specific size is in stock
            if (liveProduct.variants) {
                const variant = liveProduct.variants.find(v => v.weight === item.weight);
                if (variant) {
                    currentPrice = variant.price; // Update to current price
                    if (variant.inStock === false) {
                        isAvailable = false; // Variant specific out-of-stock
                    }
                }
            }
        }

        if (isAvailable) {
            const cartId = `${item.productId}-${item.weight.replace(/\s/g, '')}`;
            const existing = cart.find(c => c.cartId === cartId);

            if (existing) {
                existing.qty += item.qty;
            } else {
                cart.push({
                    ...item,
                    price: currentPrice, // Use updated price
                    image: liveProduct.image // Use updated image
                });
            }
            addedCount++;
        } else {
            outOfStockItems.push(item.name);
        }
    });

    updateCartUI();
    toggleCart();
    closeHistory();

    // 4. Smart Feedback
    if (outOfStockItems.length > 0) {
        // If only a few items are missing, list them
        const missingText = outOfStockItems.length <= 2 ? outOfStockItems.join(", ") : `${outOfStockItems.length} items`;
        showToast(`${addedCount} added. ${missingText} out of stock.`, "neutral");
    } else {
        showToast("All items added to cart!", "success");
    }
    saveCartLocal();
}

// --- HELPER ---
function logout() {
    cleanupListeners(); // FIX: Unsubscribe from listeners to prevent memory leak
    auth.signOut().then(() => location.reload());
}
function toggleProfileMenu() { document.getElementById('profile-menu').classList.toggle('active'); }
function closeSuccessModal() { document.getElementById('success-modal').style.display = 'none'; }
function toggleCouponList() { const l = document.getElementById('coupon-list'); l.style.display = l.style.display === 'none' ? 'block' : 'none'; }
function useCoupon(code) { document.getElementById('promo-code').value = code; applyPromo(); document.getElementById('coupon-list').style.display = 'none'; }
function applyPromo() {
    const input = document.getElementById('promo-code').value.toUpperCase().trim();
    const msgElement = document.getElementById('promo-msg');

    // Reset state
    appliedDiscount = { type: 'none', value: 0, code: null };
    msgElement.innerText = "";

    if (!input) {
        updateCartUI();
        return;
    }

    const coupon = activeCoupons.find(c => c.code === input);

    if (coupon) {
        // Check Min Order
        let currentTotal = cart.reduce((sum, i) => sum + (i.price * i.qty), 0);
        if (coupon.minOrder && currentTotal < coupon.minOrder) {
            msgElement.innerText = `Add items worth ₹${coupon.minOrder} to use this!`;
            msgElement.style.color = "orange";
        } else {
            // Apply Coupon
            appliedDiscount = { type: coupon.type, value: coupon.value, code: coupon.code };
            msgElement.innerText = "Coupon Applied! 🎉";
            msgElement.style.color = "green";
        }
    } else {
        msgElement.innerText = "Invalid Code";
        msgElement.style.color = "red";
    }
    updateCartUI();
}

// --- DYNAMIC MODAL INJECTION (Fix for Secondary Pages) ---
function ensureModalExists(modalId) {
    if (document.getElementById(modalId)) return; // Already exists

    let modalHTML = '';

    if (modalId === 'profile-modal') {
        modalHTML = `
        <div id="profile-modal" class="modal-overlay">
            <div class="modal-content">
                <button class="close-modal" onclick="closeProfileModal()">&times;</button>
                <h2 style="color:var(--primary); margin-top:0;">Edit Profile</h2>
                <label style="font-weight:bold; display:block; margin-top:15px;">Your Name</label>
                <input type="text" id="edit-name" disabled style="width:100%; padding:10px; border:1px solid #eee; background:#f9f9f9; border-radius:5px; color:#777;">
                <label style="font-weight:bold; display:block; margin-top:15px;">Mobile Number</label>
                <input type="tel" id="edit-phone" placeholder="10-digit number" style="width:100%; padding:10px; border:1px solid #ccc; border-radius:5px;">
                <label style="font-weight:bold; display:block; margin-top:15px;">Default Address</label>
                <textarea id="edit-address" rows="3" placeholder="Your full address..." style="width:100%; padding:10px; border:1px solid #ccc; border-radius:5px; resize:none;"></textarea>
                <button onclick="saveProfile()" class="btn-primary" style="width:100%; margin-top:20px; padding:12px;">Save Changes</button>
            </div>
        </div>`;
    }
    else if (modalId === 'history-modal') {
        modalHTML = `
        <div id="history-modal" class="cart-overlay">
            <div class="cart-sidebar" style="left:0; right:auto;">
                <div class="cart-header">
                    <h3>My Past Orders</h3><button class="close-cart" onclick="closeHistory()">&times;</button>
                </div>
                <div id="history-content" class="cart-items-container">
                    <p style="padding:20px;">Loading history...</p>
                </div>
            </div>
        </div>`;
    } else if (modalId === 'invoice-modal') {
        modalHTML = `
        <div id="invoice-modal" class="modal-overlay" style="z-index: 4000;">
            <div class="invoice-container">
                <div class="invoice-actions no-print">
                    <button onclick="downloadPDF()" class="btn-primary" style="background:#2c3e50;"><i class="fas fa-file-pdf"></i> Download PDF</button>
                    <button onclick="closeInvoice()" class="close-invoice" style="font-size: 2rem;">&times;</button>
                </div>
                <div id="invoice-print-area">
                    <div class="inv-header">
                        <img src="logo.jpg" alt="Namo Namkeen" class="inv-logo">
                        <div class="inv-company text-right">
                            <h2>Namo Namkeen</h2>
                            <p>131, Keshav Park, Mhow (M.P.)</p>
                            <p>+91 98266 98822</p>
                        </div>
                    </div>
                    <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
                    <div class="inv-details">
                        <div><strong>Billed To:</strong><p id="inv-customer-name">Customer Name</p><p id="inv-customer-email" style="color: #666; font-size: 0.9rem;">email@example.com</p></div>
                        <div class="text-right"><strong>Order Receipt</strong><p>ID: <span id="inv-order-id">#12345</span></p><p>Date: <span id="inv-date">--/--/----</span></p></div>
                    </div>
                    <table class="inv-table"><thead><tr><th>Item</th><th class="text-center">Qty</th><th class="text-right">Price</th><th class="text-right">Total</th></tr></thead><tbody id="inv-items-body"></tbody></table>
                    <div class="inv-total"><h3>Grand Total: <span id="inv-grand-total">₹0</span></h3></div>
                    <div id="inv-qr-section" style="text-align:center; margin-top:30px; padding:20px; border:2px dashed #e85d04; border-radius:10px; background:#fff8e1;">
                        <p style="margin:0 0 10px; font-weight:bold; color:#d35400;">Scan to Pay Instantly</p>
                        <img id="inv-qr-img" src="" alt="QR Code" style="width:120px; height:120px; mix-blend-mode: multiply;">
                        <p style="margin:10px 0 0; font-size:0.8rem; color:#555;">Accepted: GPay, PhonePe, Paytm</p>
                    </div>
                    <div class="inv-footer" style="text-align: center; margin-top: 40px; font-size: 0.8rem; color: #888;"><p>Thank you for your order!</p><p>Visit: <a href="https://www.namonamkeen.shop" style="color: inherit;">www.namonamkeen.shop</a></p></div>
                </div>
            </div>
        </div>`;
    }

    if (modalHTML) document.body.insertAdjacentHTML('beforeend', modalHTML);
}

function openProfileModal() {
    ensureModalExists('profile-modal'); // <--- Inject if missing

    document.getElementById('profile-modal').style.display = 'flex';
    document.getElementById('profile-menu').classList.remove('active');

    if (currentUser) {
        document.getElementById('edit-name').value = currentUser.displayName || '';
        if (userProfile) {
            document.getElementById('edit-phone').value = userProfile.phone || '';
            document.getElementById('edit-address').value = userProfile.address || '';
        }
    }
}

function closeProfileModal() { document.getElementById('profile-modal').style.display = 'none'; }
function saveProfile() {
    const phone = document.getElementById('edit-phone').value;
    const address = document.getElementById('edit-address').value;

    db.collection("users").doc(currentUser.uid).set({
        phone: phone,
        address: address
    }, { merge: true }).then(() => {
        // Update local variable
        if (!userProfile) userProfile = {};
        userProfile.phone = phone;
        userProfile.address = address;

        // Also update checkout fields to reflect changes immediately
        const phoneInput = document.getElementById('cust-phone');
        const addrInput = document.getElementById('cust-address');
        if (phoneInput) phoneInput.value = phone;
        if (addrInput) addrInput.value = address;

        closeProfileModal();
        showToast("Profile Updated", "success");
    });
}

function playVideo(w) { const v = w.querySelector('video'); document.querySelectorAll('.video-wrapper.playing video').forEach(o => { if (o !== v) { o.pause(); o.closest('.video-wrapper').classList.remove('playing'); } }); if (v.paused) { w.classList.add('playing'); v.play(); } else { w.classList.remove('playing'); v.pause(); } }
function closeAnnouncement() { document.getElementById('announcement-bar').style.display = 'none'; }
function filterMenu(c) {
    currentCategory = c;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');

    renderMenu();
    vibrate(30); // Haptic feedback on filter click

    // Scroll to top of grid
    const grid = document.getElementById('menu-grid');
    const yOffset = -130; // Offset for Sticky Header + Sticky Filter
    const y = grid.getBoundingClientRect().top + window.pageYOffset + yOffset;
    window.scrollTo({ top: y, behavior: 'smooth' });
}
function searchMenu() {
    searchQuery = document.getElementById('menu-search').value;
    renderMenu();
}
function toggleLanguage() { currentLang = currentLang === 'en' ? 'hi' : 'en'; renderMenu(); updateCartUI(); }
function toggleMobileMenu() {
    const nav = document.getElementById('mobile-nav');
    const hamburger = document.querySelector('.hamburger');

    // Toggle classes on both
    nav.classList.toggle('active');
    hamburger.classList.toggle('active');
}

// Close menu when clicking outside (Optional but good UX)
document.addEventListener('click', (e) => {
    const nav = document.getElementById('mobile-nav');
    const hamburger = document.querySelector('.hamburger');

    // If menu is open AND click is NOT on menu AND NOT on hamburger
    if (nav.classList.contains('active') && !nav.contains(e.target) && !hamburger.contains(e.target)) {
        nav.classList.remove('active');
        hamburger.classList.remove('active');
    }
});
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

// --- NEW RAZORPAY PAYMENT LOGIC ---

// Change function to 'async' so we can wait for user input
async function initiateRazorpayPayment() {
    if (cart.length === 0) return showToast("Your cart is empty!", "error");

    const phone = document.getElementById('cust-phone').value.trim();
    const address = document.getElementById('cust-address').value.trim();

    if (!/^[0-9]{10}$/.test(phone)) return showToast("Enter valid 10-digit phone", "error");
    if (address.length < 5) return showToast("Enter complete address", "error");

    // --- FIX: Use Centralized Calculation ---
    const { finalTotal } = getCartTotals();
    const amountPaise = finalTotal * 100;

    const methodElem = document.querySelector('input[name="paymentMethod"]:checked');
    const paymentMethod = methodElem ? methodElem.value : 'Online';

    if (paymentMethod === 'COD') {
        if (await showConfirm(`Place order for ₹${finalTotal} via Cash on Delivery?`)) {
            saveOrderToFirebase('COD', 'Pending', null);
        }
    } else {
        openRazorpayModal(amountPaise, finalTotal, phone);
    }
}

function openRazorpayModal(amountPaise, amountINR, userPhone) {
    // SECURITY: Check if Razorpay library is loaded
    if (typeof Razorpay === 'undefined') {
        showToast("Payment system not loaded. Please refresh and try again.", "error");
        toggleBtnLoading('btn-main-checkout', false);
        return;
    }

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
            "ondismiss": function () { showToast("Payment cancelled.", "error"); }
        }
    };

    var rzp1 = new Razorpay(options);
    rzp1.on('payment.failed', function (response) {
        showToast("Payment Failed: " + response.error.description);
    });
    rzp1.open();
}

async function saveOrderToFirebase(method, paymentStatus, txnId) {
    toggleBtnLoading('btn-main-checkout', true);

    const phone = document.getElementById('cust-phone').value.trim();
    const address = document.getElementById('cust-address').value.trim();
    const orderId = 'ORD-' + Date.now().toString().slice(-6);

    // 1. Determine User ID (Guest or Registered)
    let uid = currentUser ? currentUser.uid : `guest_${phone}`;
    let uName = currentUser ? currentUser.displayName : "Guest";

    // 2. Capture Delivery Note (FIX: Declare before use)
    const deliveryNote = document.getElementById('delivery-note') ? document.getElementById('delivery-note').value.trim() : '';

    // 3. Calculate Totals (FIX: Use centralized function)
    const { subtotal, discountAmount, shipping, finalTotal } = getCartTotals();

    try {
        const batch = db.batch();
        const orderRef = db.collection("orders").doc(String(orderId));

        batch.set(orderRef, {
            id: orderId,
            userId: uid,
            userName: uName,
            userPhone: phone,
            userAddress: address,
            deliveryNote: deliveryNote,
            items: cart,
            subtotal: subtotal,        // Save Subtotal
            shippingCost: shipping,    // Save Shipping Cost
            discount: appliedDiscount, // Save Discount Info
            discountAmt: discountAmount,// Save Discount Amount
            total: finalTotal,         // Final Paid Amount
            paymentMethod: method,
            status: 'Pending',
            paymentStatus: paymentStatus,
            transactionId: txnId || '',
            timestamp: new Date()
        });

        // B. Update/Create User Profile (Sync Guest Data)
        const userRef = db.collection("users").doc(String(uid));
        batch.set(userRef, {
            name: uName,
            phone: phone,
            address: address,
            lastOrder: new Date(),
            type: currentUser ? 'Registered' : 'Guest'
        }, { merge: true });

        // --- LOYALTY LOGIC: Earn Points ---
        if (currentUser) {
            // Earn 1 Coin for every ₹100 spent
            const coinsEarned = Math.floor(finalTotal / 100);

            if (coinsEarned > 0) {
                // Increment user's wallet balance
                batch.update(userRef, {
                    walletBalance: firebase.firestore.FieldValue.increment(coinsEarned)
                });
            }

            // If they USED points in this order, deduct them
            if (appliedDiscount.type === 'loyalty') {
                batch.update(userRef, {
                    walletBalance: firebase.firestore.FieldValue.increment(-appliedDiscount.value)
                });
            }
        }

        await batch.commit();
        showSuccessModal(orderId, finalTotal, method);

        cart = [];
        appliedDiscount = { type: 'none', value: 0, code: null };
        saveCartLocal();
        updateCartUI();
        if (document.getElementById('cart-sidebar').classList.contains('active')) toggleCart();

    } catch (error) {
        console.error("Order Error:", error);
        showToast("Error placing order.", "error");
    } finally {
        toggleBtnLoading('btn-main-checkout', false);
    }
}

function showSuccessModal(orderId, amount, method) {
    // FIX: Check if currentUser exists, otherwise use Guest
    const custName = currentUser ? currentUser.displayName : "Guest";
    const address = document.getElementById('cust-address').value;

    // Optional Delivery Note
    const noteElem = document.getElementById('delivery-note');
    const noteText = (noteElem && noteElem.value.trim()) ? `\n*Note:* ${noteElem.value.trim()}` : '';

    const msg = `*New Order: ${orderId}*\n*Method:* ${method}\n*Amount:* ₹${amount}\n*Customer:* ${custName}\n*Address:* ${address}${noteText}\n\n*Payment:* ${method === 'Online' ? 'PAID ✅' : 'Cash on Delivery 🚚'}`;

    const orderIdElem = document.getElementById('success-order-id');
    if (orderIdElem) orderIdElem.innerText = orderId;

    const waBtn = document.getElementById('wa-link-btn');
    if (waBtn) {
        waBtn.onclick = () => {
            window.open(`https://wa.me/${shopConfig.adminPhone}?text=${encodeURIComponent(msg)}`, '_blank');
        };
    }

    const modal = document.getElementById('success-modal');
    if (modal) {
        modal.style.display = 'flex';

        // TRIGGER CONFETTI
        if (typeof confetti === 'function') {
            confetti({
                particleCount: 150,
                spread: 70,
                origin: { y: 0.6 },
                colors: ['#e85d04', '#faa307', '#ffffff'] // Your brand colors
            });
        }
    }
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
    // 1. Get Values
    const pidStr = document.getElementById('review-pid').value;
    const oid = document.getElementById('review-oid').value;
    const comment = document.getElementById('review-comment').value.trim();
    const ratingElem = document.querySelector('input[name="rating"]:checked');

    // 2. Validation
    if (!ratingElem) return showToast("Please select a star rating!", "error");
    const rating = parseInt(ratingElem.value);

    if (!currentUser) return showToast("You must be logged in to review.", "error");

    // 3. Handle Product ID Type (Keep as number if it is one, else string)
    // This fixes issues if you have alphanumeric IDs like "Mix123"
    const pid = isNaN(Number(pidStr)) ? pidStr : Number(pidStr);

    toggleBtnLoading('btn-submit-review', true);

    try {
        // 4. Check for Duplicates
        const check = await db.collection("reviews")
            .where("orderId", "==", oid)
            .where("productId", "==", pid)
            .get();

        if (!check.empty) {
            showToast("You have already reviewed this item!", "warning");
            closeModal('review-modal');
            toggleBtnLoading('btn-submit-review', false);
            return;
        }

        // 5. Add Review (FIX: Added fallback for userName to prevent crashes)
        await db.collection("reviews").add({
            productId: pid,
            orderId: oid,
            userId: currentUser.uid,
            userName: currentUser.displayName || 'Customer', // Fixes "undefined" error
            rating: rating,
            comment: comment,
            timestamp: new Date()
        });

        // 6. Update Product Stats
        // Note: We use String(pid) because Document IDs are always strings
        const productRef = db.collection("products").doc(String(pid));

        await productRef.update({
            ratingSum: firebase.firestore.FieldValue.increment(rating),
            ratingCount: firebase.firestore.FieldValue.increment(1)
        });

        showToast("Thanks for your feedback!", "success");
        closeModal('review-modal');

        // Refresh to show new rating on cards
        fetchData();

    } catch (error) {
        console.error("Review Error:", error);
        // Show specific error message to help debug
        showToast("Error: " + error.message, "error");
    } finally {
        toggleBtnLoading('btn-submit-review', false);
    }
}

// --- TOAST FUNCTION ---
function showToast(message, type = 'neutral') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    let icon = '';
    if (type === 'success') icon = '<i class="fas fa-check-circle" style="color:#2ecc71"></i>';
    if (type === 'error') icon = '<i class="fas fa-exclamation-circle" style="color:#e74c3c"></i>';

    toast.innerHTML = `${icon} <span>${message}</span>`;
    container.appendChild(toast);

    // Remove after 3 seconds
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 400);
    }, 3000);
}

// --- SEO HELPER FUNCTION ---
function updateSchema(p) {
    // 1. Remove old schema if exists to prevent duplicates
    const oldSchema = document.getElementById('json-ld-product');
    if (oldSchema) oldSchema.remove();

    // 2. Create new Schema JSON
    const schemaData = {
        "@context": "https://schema.org/",
        "@type": "Product",
        "name": p.name,
        "image": ["https://namonamkeen.shop/" + p.image],
        "description": p.desc || "Authentic Indore Namkeen",
        "brand": {
            "@type": "Brand",
            "name": "Namo Namkeen"
        },
        "offers": {
            "@type": "Offer",
            "url": "https://namonamkeen.shop",
            "priceCurrency": "INR",
            "price": p.price,
            "availability": p.in_stock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock"
        }
    };

    // 3. Inject into Head
    const script = document.createElement('script');
    script.id = "json-ld-product";
    script.type = "application/ld+json";
    script.text = JSON.stringify(schemaData);
    document.head.appendChild(script);
}

// --- SEO HELPER ---
// --- PWA INSTALLATION LOGIC ---
let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
    // 1. Prevent Chrome 67 and earlier from automatically showing the prompt
    e.preventDefault();
    // 2. Stash the event so it can be triggered later.
    deferredPrompt = e;
    // 3. Update UI notify the user they can add to home screen
    const installBtn = document.getElementById('pwa-install-btn');
    if (installBtn) {
        installBtn.style.display = 'block'; // Show the button

        installBtn.addEventListener('click', () => {
            // Hide our user interface that shows our A2HS button
            installBtn.style.display = 'none';
            // Show the prompt
            deferredPrompt.prompt();
            // Wait for the user to respond to the prompt
            deferredPrompt.userChoice.then((choiceResult) => {
                if (choiceResult.outcome === 'accepted') {
                    console.log('User accepted the A2HS prompt');
                } else {
                    console.log('User dismissed the A2HS prompt');
                }
                deferredPrompt = null;
            });
        });
    }
});

// Optional: Analytics to track if app was installed successfully
window.addEventListener('appinstalled', () => {
    console.log('PWA was installed');
    // You could save this event to Firestore to track how many users installed the app
});

function saveCartLocal() {
    localStorage.setItem('namoCart', JSON.stringify(cart));
    localStorage.setItem('namoDiscount', JSON.stringify(appliedDiscount));

    // --- NEW: SYNC TO CLOUD ---
    if (currentUser) {
        db.collection("users").doc(currentUser.uid).update({
            cart: cart,
            lastCartUpdate: new Date() // Useful for Abandoned Cart feature
        }).catch(err => console.log("Cart Sync Error", err));
    }
}

function loadCartLocal() {
    const savedCart = localStorage.getItem('namoCart');
    const savedDiscount = localStorage.getItem('namoDiscount');

    if (savedCart) {
        cart = JSON.parse(savedCart);
    }

    // NEW: Restore the discount
    if (savedDiscount) {
        appliedDiscount = JSON.parse(savedDiscount);
        // Visual feedback if a code is applied
        if (appliedDiscount.code) {
            const input = document.getElementById('promo-code');
            const msg = document.getElementById('promo-msg');
            if (input) input.value = appliedDiscount.code;
            if (msg) {
                msg.innerText = "Code Applied!";
                msg.style.color = "green";
            }
        }
    }

    updateCartUI();
}

// --- CUSTOM CONFIRMATION HELPER ---
function showConfirm(message) {
    return new Promise((resolve) => {
        // 1. Create Modal HTML if not exists
        if (!document.getElementById('custom-confirm-modal')) {
            const modalHtml = `
            <div id="custom-confirm-modal" class="modal-overlay">
                <div class="modal-content confirm-box">
                    <h3 style="margin-bottom:10px; color:var(--text-dark);">Please Confirm</h3>
                    <p id="custom-confirm-msg" style="color:#666; font-size:0.95rem;"></p>
                    <div class="confirm-actions">
                        <button id="btn-confirm-no" class="btn-confirm-no">Cancel</button>
                        <button id="btn-confirm-yes" class="btn-confirm-yes">Yes, Proceed</button>
                    </div>
                </div>
            </div>`;
            document.body.insertAdjacentHTML('beforeend', modalHtml);
        }

        // 2. Set Message & Show
        document.getElementById('custom-confirm-msg').innerText = message;
        const modal = document.getElementById('custom-confirm-modal');
        modal.style.display = 'flex';

        // 3. Handle Clicks
        const btnYes = document.getElementById('btn-confirm-yes');
        const btnNo = document.getElementById('btn-confirm-no');

        // Clone buttons to remove old event listeners (safety)
        const newYes = btnYes.cloneNode(true);
        const newNo = btnNo.cloneNode(true);
        btnYes.parentNode.replaceChild(newYes, btnYes);
        btnNo.parentNode.replaceChild(newNo, btnNo);

        newYes.onclick = () => {
            modal.style.display = 'none';
            resolve(true);
        };

        newNo.onclick = () => {
            modal.style.display = 'none';
            resolve(false);
        };
    });
}

// --- LOGIN MODAL HANDLERS ---

function openLoginChoiceModal() {
    // 1. Do NOT close the cart. 
    // The modal should stack on top of the sidebar.
    // (Ensure your CSS z-indexes are correct: Sidebar ~5001, Modal ~6000+)

    document.getElementById('login-choice-modal').style.display = 'flex';
}

function handleLoginChoice(method) {
    closeModal('login-choice-modal'); // Close the selection modal

    if (method === 'google') {
        // 2. Trigger Google Login as 'Checkout Flow' (true)
        // This ensures that after login, initiateRazorpayPayment() is called automatically.
        googleLogin(true);
    }
    else if (method === 'mobile') {
        showToast("Mobile Login coming soon! Please use Google or Guest Checkout.", "neutral");
    }
}

// --- SMART SEARCH LOGIC ---
const searchInput = document.getElementById('menu-search');
const suggestionsBox = document.getElementById('search-suggestions');
let fuse; // Hold the Fuse instance

// Initialize Fuse once products are loaded
function initFuzzySearch() {
    const options = {
        keys: ['name', 'nameHi', 'category', 'desc'], // Fields to search
        threshold: 0.4, // 0.0 = perfect match, 1.0 = match anything. 0.4 is good for typos.
        distance: 100   // How close the match needs to be
    };
    fuse = new Fuse(products, options);
}

if (searchInput && suggestionsBox) {
    searchInput.addEventListener('input', function () {
        if (!fuse) {
            searchMenu();
            return;
        }
        const query = this.value.toLowerCase().trim();

        // 1. Hide if empty
        if (query.length === 0) {
            suggestionsBox.classList.remove('active');
            searchMenu(); // Reset grid to show all
            return;
        }

        // 2. Perform Fuzzy Search
        // Fuse returns results in { item: ... } format
        const results = fuse.search(query);
        const matches = results.map(result => result.item).slice(0, 5); // Limit to top 5

        // 3. Render Suggestions
        if (matches.length > 0) {
            suggestionsBox.innerHTML = matches.map(p => `
                <div class="suggestion-item" onclick="selectSuggestion(${p.id})">
                    <img src="${p.image}" class="suggestion-img" onerror="this.onerror=null; this.src='logo.jpg';">
                    <div class="suggestion-info">
                        <h4>${p.name}</h4>
                        <span>₹${p.price}</span>
                    </div>
                </div>
            `).join('');
            suggestionsBox.classList.add('active');
        } else {
            suggestionsBox.classList.remove('active');
        }

        // Also filter the main grid
        searchMenu();
    });

    // Hide when clicking outside
    document.addEventListener('click', (e) => {
        if (suggestionsBox && !searchInput.contains(e.target) && !suggestionsBox.contains(e.target)) {
            suggestionsBox.classList.remove('active');
        }
    });
}

function selectSuggestion(id) {
    openProductDetail(id);
    document.getElementById('search-suggestions').classList.remove('active');
    document.getElementById('menu-search').value = ''; // Optional: clear search
    searchMenu(); // Reset grid
}

// --- PDF DOWNLOAD FUNCTION ---
function downloadPDF() {
    const element = document.getElementById('invoice-print-area');
    const orderId = document.getElementById('inv-order-id').innerText.replace('#', '');

    // Configuration for the PDF
    const opt = {
        margin: 10,
        filename: `Namo_Invoice_${orderId}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true }, // scale: 2 improves quality
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    // Show loading state
    const btn = document.querySelector('button[onclick="downloadPDF()"]');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';

    // Generate and Save
    html2pdf().set(opt).from(element).save().then(() => {
        btn.innerHTML = originalText; // Restore button
        showToast("Invoice Downloaded!", "success");
    }).catch(err => {
        console.error(err);
        btn.innerHTML = originalText;
        showToast("Failed to generate PDF", "error");
    });
}

// Add function to bottom of script.js
// Add function to bottom of script.js
function loadStorefront() {
    // FIX: Safety check - only run if we are on the homepage
    const homeSection = document.getElementById('home');
    if (!homeSection) return;

    db.collection("settings").doc("layout").get().then(doc => {
        if (doc.exists) {
            const data = doc.data();
            if (data.heroTitle) document.getElementById('hero-title').innerHTML = data.heroTitle.replace(/\n/g, '<br>');
            if (data.heroSubtitle) document.getElementById('hero-subtitle').innerText = data.heroSubtitle;
            if (data.heroImage) {
                homeSection.style.backgroundImage = `url('${data.heroImage}')`;
            }
        }
    }).catch(e => console.log("Layout load error (using default)", e));
}

function vibrate(ms = 50) {
    if (navigator.vibrate) {
        navigator.vibrate(ms);
    }
}

function closeModal(id) {
    document.getElementById(id).style.display = 'none';
}

// --- HELPER: Centralized Price Calculation ---
function getCartTotals() {
    const subtotal = cart.reduce((sum, i) => sum + (i.price * i.qty), 0);

    // 1. Calculate Discount
    let discountAmount = 0;
    if (appliedDiscount && appliedDiscount.value > 0) {
        if (appliedDiscount.type === 'percent') {
            discountAmount = Math.round(subtotal * (appliedDiscount.value / 100));
        } else if (appliedDiscount.type === 'flat') {
            discountAmount = appliedDiscount.value;
        }
    }
    if (discountAmount > subtotal) discountAmount = subtotal;

    // 2. Calculate Delivery
    const freeShipLimit = shopConfig.freeShippingThreshold || 250;
    const deliveryFee = shopConfig.deliveryCharge || 0;

    // Delivery based on subtotal (before discount) is standard, 
    // but if you want it based on post-discount price, change 'subtotal' to 'subtotal - discountAmount' below.
    const shipping = (subtotal >= freeShipLimit) ? 0 : deliveryFee;

    const finalTotal = subtotal - discountAmount + shipping;

    return { subtotal, discountAmount, shipping, finalTotal };
}

// --- ADDRESS MANAGEMENT ---
function loadUserAddresses() {
    if (!currentUser || !userProfile || !userProfile.savedAddresses) return;

    const selector = document.getElementById('addr-selector');
    const container = document.getElementById('saved-addresses');

    // Reset Selector
    selector.innerHTML = '<option value="new">+ Add New Address</option>';

    userProfile.savedAddresses.forEach((addr, idx) => {
        const opt = document.createElement('option');
        opt.value = idx;
        opt.text = addr.label || addr.text.substring(0, 30) + '...';
        selector.insertBefore(opt, selector.lastChild); // Insert before "Add New"
    });

    container.style.display = 'block';

    // Auto-select first address
    if (userProfile.savedAddresses.length > 0) {
        selector.value = 0;
        selectAddress(0);
    }
}

function selectAddress(idx) {
    const textarea = document.getElementById('cust-address');
    const saveBtn = document.getElementById('btn-save-addr');

    if (idx === 'new') {
        textarea.value = '';
        textarea.disabled = false;
        textarea.focus();
        saveBtn.style.display = 'inline-block';
    } else {
        const addr = userProfile.savedAddresses[idx];
        textarea.value = addr.text;
        // Optional: Disable editing of saved address to prevent accidental changes
        // textarea.disabled = true; 
        saveBtn.style.display = 'none';
    }
}

async function saveNewAddress() {
    const text = document.getElementById('cust-address').value.trim();
    if (text.length < 5) return showToast("Address too short", "error");

    const label = prompt("Give this address a name (e.g., Home, Office):", "Home");
    if (!label) return;

    const newAddr = { label, text };

    try {
        await db.collection("users").doc(currentUser.uid).update({
            savedAddresses: firebase.firestore.FieldValue.arrayUnion(newAddr)
        });

        // Update local profile
        if (!userProfile.savedAddresses) userProfile.savedAddresses = [];
        userProfile.savedAddresses.push(newAddr);

        showToast("Address Saved!", "success");
        loadUserAddresses(); // Refresh UI

        // Select the newly added address (second to last option)
        const selector = document.getElementById('addr-selector');
        selector.value = userProfile.savedAddresses.length - 1;

    } catch (e) {
        console.error(e);
        showToast("Error saving address", "error");
    }
}

