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
let currentModalQty = 1;
let confirmationResult = null; // Stores the OTP result object

// Add at the top with other vars
const messaging = firebase.messaging();

// Add this mapping object at the top of script.js
const synonymMap = {
    "kaju": "cashew",
    "badam": "almond",
    "tikha": "spicy",
    "meetha": "sweet",
    "shakkar": "sugar",
    "namak": "salt",
    "falahari": "farali",
    "chivda": "chiwda",
    "murukku": "chakli"
};

// NEW: Add this Shop Config
let shopConfig = {
    upiId: "8103276050@ybl", // Default fallback if DB fails
    adminPhone: "919826698822",
    deliveryCharge: 50, // Set default to 50
    freeShippingThreshold: 250 // Set default threshold
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
    setupRecaptcha();

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
            userProfile = doc.data();

            // --- NEW: Ensure Referral Code Exists ---
            if (!userProfile.referralCode) {
                initReferral(); // Call the generator function immediately
            }

            // Auto-fill Checkout Fields
            // Auto-fill Checkout Fields
            const nameInput = document.getElementById('cust-name'); // <--- NEW
            const phoneInput = document.getElementById('cust-phone');
            const emailInput = document.getElementById('cust-email'); // <--- NEW

            if (nameInput) {
                // Use Profile Name -> Auth Name -> Empty
                nameInput.value = userProfile.name || (currentUser.displayName || "");
            }

            if (phoneInput && !phoneInput.value && userProfile.phone) {
                phoneInput.value = userProfile.phone.replace('+91', '');
            }
            // Auto-fill Email (Priority: Profile Data > Auth Data)
            if (emailInput && !emailInput.value) {
                emailInput.value = userProfile.email || (currentUser.email || "");
            }

            // --- NEW AUTO-FILL LOGIC ---
            if (userProfile.addressDetails) {
                // If we have new structured data, use it
                document.getElementById('cust-addr-street').value = userProfile.addressDetails.street || '';
                document.getElementById('cust-addr-city').value = userProfile.addressDetails.city || 'Indore';
                document.getElementById('cust-addr-pin').value = userProfile.addressDetails.pin || '';
            } else if (userProfile.address) {
                // Fallback for old data: Put everything in Street field
                document.getElementById('cust-addr-street').value = userProfile.address;
            }

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
    // initReferral is already called inside the if block when needed
}

// --- HELPER: Sanitize user/product data to prevent XSS ---
function sanitizeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// Alias for consistency with admin.js
function escapeHtml(text) {
    return sanitizeHTML(text);
}

// Sanitize/normalize image or user-provided URLs to allow only safe schemes
function sanitizeUrl(url) {
    if (!url) return '';
    try {
        const u = String(url).trim();
        if (u.startsWith('data:image/') || u.startsWith('http://') || u.startsWith('https://')) return u;
        return 'logo.jpg';
    } catch (e) {
        return 'logo.jpg';
    }
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
    // NOTE: Do not reference `data` here — it is only defined inside the
    // settings onSnapshot callback below. Config values are applied there.
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
        checkDeepLink();
    }).catch(err => console.error("Products Error:", err));

    unsubscribeListeners.config =
        // NEW: Fetch Shop Configuration from Firestore
        db.collection("settings").doc("config").onSnapshot(doc => {
            if (doc.exists) {
                const data = doc.data();

                // 1. Contact & Pay Info
                if (data.upiId) shopConfig.upiId = data.upiId;
                if (data.adminPhone) shopConfig.adminPhone = data.adminPhone.replace(/\D/g, '');
                if (data.vapidKey) shopConfig.vapidKey = data.vapidKey;

                // 2. Delivery Settings (The Fix)
                if (data.deliveryCharge !== undefined) {
                    shopConfig.deliveryCharge = parseFloat(data.deliveryCharge);
                }
                if (data.freeShippingThreshold !== undefined) {
                    shopConfig.freeShippingThreshold = parseFloat(data.freeShippingThreshold);
                }

                // 3. Refresh Cart immediately to show new fees
                updateCartUI();
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

let currentSort = 'default';

function sortMenu(sortVal) {
    currentSort = sortVal;
    renderMenu();
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

    filtered.sort((a, b) => {
        // 1. Featured items first
        if (a.isFeatured && !b.isFeatured) return -1;
        if (!a.isFeatured && b.isFeatured) return 1;
        // 2. Then Bestsellers
        if (a.bestseller && !b.bestseller) return -1;
        if (!a.bestseller && b.bestseller) return 1;
        return 0;
    });

    if (currentSort === 'price-low') {
        filtered.sort((a, b) => a.price - b.price);
    } else if (currentSort === 'price-high') {
        filtered.sort((a, b) => b.price - a.price);
    } else if (currentSort === 'rating') {
        // Calculate average rating safely
        const getRating = (p) => p.ratingCount ? (p.ratingSum / p.ratingCount) : 0;
        filtered.sort((a, b) => getRating(b) - getRating(a));
    }

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
                showToast("Total value too high! Try a cheaper item.", "error");
                return;
            }
            selectedHamperItems.push(p);
            el.classList.add('selected');
        } else {
            showToast("Select only 3 items!", "error");
        }
    }
    updateHamperUI();
}

function updateHamperUI() {
    const countElem = document.getElementById('hamper-count');
    if (countElem) countElem.innerText = selectedHamperItems.length;
    const btn = document.getElementById('add-hamper-btn');
    if (btn) {
        const hamperPrice = shopConfig.hamperPrice || 250;
        if (selectedHamperItems.length === 3) {
            btn.classList.remove('disabled');
            btn.innerHTML = `Add Hamper to Cart - ₹${hamperPrice}`;
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

// --- 8. PRODUCT MODAL (Redesigned like Image 2) ---
function openProductDetail(id) {
    const p = products.find(x => x.id === id);
    if (!p) return;

    // Reset Qty on open
    currentModalQty = 1;

    // Update SEO Schema if function exists
    if (typeof updateSchema === 'function') updateSchema(p);

    const name = currentLang === 'en' ? p.name : (p.nameHi || p.name);
    const desc = currentLang === 'en' ? p.desc : (p.descHi || p.desc);
    const category = p.category ? p.category.charAt(0).toUpperCase() + p.category.slice(1) : "Snacks";

    // --- Variant Logic ---
    let variantHtml = '';
    let initialPrice = p.price;
    let isAvailable = p.in_stock;

    // Default to first variant
    if (p.variants && p.variants.length > 0) {
        const firstActive = p.variants.find(v => v.inStock !== false);
        initialPrice = firstActive ? firstActive.price : p.variants[0].price;
        if (!firstActive) isAvailable = false;

        variantHtml = `<select id="modal-variant-select" class="pm-select" onchange="updateModalPrice(this)" style="margin-top:10px; width:100%; padding:8px; border-radius:5px; border:1px solid #ddd;">`;
        p.variants.forEach((v, idx) => {
            const stockStatus = (v.inStock !== false);
            const disabledAttr = stockStatus ? '' : 'disabled';
            const label = v.weight + (stockStatus ? '' : '');
            const selectedAttr = (v.price === initialPrice && stockStatus) ? 'selected' : '';
            variantHtml += `<option value="${idx}" data-price="${v.price}" ${disabledAttr} ${selectedAttr}>${label}</option>`;
        });
        variantHtml += `</select>`;
    }

    // --- Share Button Logic ---
    const shareUrl = `${window.location.origin}/?pid=${p.id}`;
    const shareText = `👀 *Look at this!* \n\nFound this amazing *${name}* on Namo Namkeen! 🤤🔥\n\nIt looks super crunchy and tasty. Check it out here:`;

    let shareBtnHtml = '';

    if (navigator.share) {
        shareBtnHtml = `
            <button onclick="shareNative('${name.replace(/'/g, "\\'")}', '${shareUrl}')" style="background:none; border:none; color:var(--primary); font-size:1.2rem; cursor:pointer;" title="Share">
                <i class="fas fa-share-alt"></i>
            </button>`;
    } else {
        const waUrl = `https://wa.me/?text=${encodeURIComponent(shareText + ' ' + shareUrl)}`;
        shareBtnHtml = `
            <a href="${waUrl}" target="_blank" style="color:#25D366; font-size:1.2rem;" title="Share on WhatsApp">
                <i class="fab fa-whatsapp"></i>
            </a>`;
    }

    // --- NEW MODAL HTML STRUCTURE ---
    const html = `
        <div style="display: flex; flex-direction: column; height: 100%;">
            
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                ${shareBtnHtml}
                <button onclick="closeProductModal()" style="background:none; border:none; color:#e85d04; font-size:1.8rem; cursor:pointer; line-height:1;">&times;</button>
            </div>

            <div style="text-align: center; margin-bottom: 15px;">
                <img src="${p.image}" style="width: 200px; height: 200px; object-fit: cover; border-radius: 50%; box-shadow: 0 5px 15px rgba(0,0,0,0.1);" onerror="this.src='logo.jpg'">
            </div>

            <div style="flex-grow: 1;">
                <h2 style="margin: 0; font-size: 1.6rem; color: #333;">${name}</h2>
                <p style="color: #999; font-size: 0.85rem; margin: 2px 0 10px;">Category: ${category}</p>
                <p style="color: #666; font-size: 0.95rem; line-height: 1.5;">${desc}</p>
                
                ${variantHtml}
                
                <h3 id="modal-price-display" style="color: #2ecc71; font-size: 1.8rem; margin: 15px 0 0;">₹${initialPrice}</h3>
            </div>

            <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 20px; gap: 15px;">
                
                <div style="display: flex; align-items: center; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; height: 45px;">
                    <button onclick="updateModalQty(-1)" style="width: 40px; height: 100%; border:none; background: #fff; font-size: 1.2rem; color: #666;">-</button>
                    <span id="modal-qty-display" style="min-width: 30px; text-align: center; font-weight: bold; font-size: 1.1rem;">1</span>
                    <button onclick="updateModalQty(1)" style="width: 40px; height: 100%; border:none; background: #fff; font-size: 1.2rem; color: #666;">+</button>
                </div>

                <button onclick="addToCartFromModal(${p.id})" 
                    style="flex: 1; height: 45px; background: #e85d04; color: white; border: none; border-radius: 8px; font-size: 1.1rem; font-weight: 600; cursor: pointer;"
                    ${!isAvailable ? 'disabled style="background:#ccc; cursor:not-allowed; flex:1; height:45px; border:none; border-radius:8px;"' : ''}>
                    ${isAvailable ? 'Add' : 'Sold Out'}
                </button>
            </div>

        </div>
    `;

    document.getElementById('p-modal-body').innerHTML = html;

    // Fix Mobile Styling for Modal Container
    const modalContent = document.querySelector('#product-modal .modal-content');
    if (modalContent) {
        modalContent.style.padding = "20px";
        modalContent.style.maxWidth = "400px"; // Mobile card width
        modalContent.style.borderRadius = "15px";
    }

    document.getElementById('product-modal').style.display = 'flex';
}

// --- NEW HELPER FUNCTIONS ---

function updateModalQty(change) {
    let newQty = currentModalQty + change;
    if (newQty < 1) newQty = 1;
    currentModalQty = newQty;
    document.getElementById('modal-qty-display').innerText = currentModalQty;
}

// --- Helper Function for Native Sharing ---
// Add this right below openProductDetail function
function shareNative(title, url) {
    if (navigator.share) {
        navigator.share({
            title: title,
            text: `Check out ${title} on Namo Namkeen!`,
            url: url
        }).catch(err => {
            // Only show error if user didn't cancel the share dialog
            if (err.name !== 'AbortError') {
                showToast("Could not share. Please try again.", "error");
            }
        });
    }
}

// 1. Add this function to script.js
async function cancelOrder(docId) {
    if (!docId) return showToast("Error: Invalid Order ID", "error");

    try {
        const orderRef = db.collection("orders").doc(docId);
        const orderDoc = await orderRef.get();
        const orderData = orderDoc.data();

        // --- TIME CHECK ---
        const orderTime = orderData.timestamp.toDate();
        const now = new Date();
        const diffMins = Math.round((now - orderTime) / 60000);

        if (diffMins > 30) {
            return showToast("Cannot cancel after 30 mins. Please call us.", "error");
        }

        // Ask confirmation only once, after time validation
        if (!await showConfirm("Are you sure you want to cancel this order?")) return;

        const batch = db.batch();

        // 1. Update Order Status
        batch.update(orderRef, {
            status: "Cancelled",
            cancelledBy: "User",
            cancelledAt: new Date()
        });

        // 2. REVERSE LOYALTY POINTS
        // Only if the user is still the same and points were involved
        if (orderData.userId && orderData.userId !== 'guest') {
            const userRef = db.collection("users").doc(orderData.userId);
            let netChange = 0;

            // A. Deduct the points they EARNED from this order
            // (We assume standard 1% rate or calculate based on total)
            const earned = Math.floor(orderData.total / 100);
            if (earned > 0) {
                netChange -= earned; // Remove them
                // Log deduction
                const histRef = userRef.collection("wallet_history").doc();
                batch.set(histRef, {
                    amount: earned,
                    type: 'debit',
                    description: `Reversal: Order #${orderData.id} Cancelled`,
                    timestamp: new Date()
                });
            }

            // B. Refund the points they SPENT on this order
            if (orderData.discount && orderData.discount.type === 'loyalty') {
                netChange += orderData.discount.value; // Give them back
                // Log Refund
                const histRef = userRef.collection("wallet_history").doc();
                batch.set(histRef, {
                    amount: orderData.discount.value,
                    type: 'credit',
                    description: `Refund: Order #${orderData.id} Cancelled`,
                    timestamp: new Date()
                });
            }

            // Apply to Wallet
            if (netChange !== 0) {
                batch.update(userRef, {
                    walletBalance: firebase.firestore.FieldValue.increment(netChange)
                });
            }
        }

        await batch.commit();
        showToast("Order Cancelled. Points Reversed.", "success");
        showOrderHistory();

    } catch (e) {
        // Log only in development environment
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            console.error("Cancel Error:", e);
        }
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
    if (sel) {
        v = p.variants[sel.value];
    } else if (p.variants && p.variants.length > 0) {
        v = p.variants[0];
    }

    // Add item with the specific quantity selected
    addToCart(p, v, currentModalQty);
    closeProductModal();
}

function closeProductModal() { document.getElementById('product-modal').style.display = 'none'; }

function addToCart(p, v, qtyToAdd = 1) {
    const cartId = `${p.id}-${v.weight.replace(/\s/g, '')}`;
    const ex = cart.find(i => i.cartId === cartId);

    if (ex) {
        ex.qty += qtyToAdd; // Add specific amount
        showToast(`Updated ${p.name} quantity (+${qtyToAdd})`, "success");
    } else {
        cart.push({
            cartId: cartId,
            productId: p.id,
            name: p.name,
            image: p.image,
            weight: v.weight,
            price: v.price,
            qty: qtyToAdd // Set initial amount
        });
        showToast(`${p.name} added to cart! 🛒`, "success");
    }

    updateCartUI();
    saveCartLocal();
    vibrate(50);
}

function updateCartUI() {
    const con = document.getElementById('cart-items');
    if (!con) return;
    con.innerHTML = '';

    // 1. Initialize variables
    let subtotal = 0, count = 0;
    let finalDeliveryCost = 0;

    // 2. Get Elements (Declare ONCE at the top)
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

        // --- LOYALTY LOGIC ---
        let loyaltyHtml = '';
        const loyaltyContainer = document.getElementById('loyalty-section');

        if (currentUser && userProfile && userProfile.walletBalance > 0) {
            let tempTotal = cart.reduce((sum, i) => sum + (i.price * i.qty), 0);
            const maxRedeemable = Math.min(userProfile.walletBalance, tempTotal);
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
        }
        if (loyaltyContainer) loyaltyContainer.innerHTML = loyaltyHtml;

        // --- SHIPPING METER ---
        const freeShipLimit = shopConfig.freeShippingThreshold || 250;
        const deliveryFee = shopConfig.deliveryCharge || 0;
        let currentTotal = cart.reduce((sum, i) => sum + (i.price * i.qty), 0);

        if (currentTotal >= freeShipLimit) {
            finalDeliveryCost = 0;
            con.innerHTML += `
                <div class="shipping-bar-container" style="background: #ecfdf5; border: 1px solid #a7f3d0; padding: 12px;">
                    <div style="color: #059669; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 0.95rem;">
                        <i class="fas fa-check-circle"></i> <span>Free Delivery Applied</span> <i class="fas fa-shipping-fast"></i>
                    </div>
                </div>`;
        } else {
            finalDeliveryCost = deliveryFee;
            let percent = Math.min(100, (currentTotal / freeShipLimit) * 100);
            con.innerHTML += `
                <div class="shipping-bar-container">
                    <div class="shipping-text">Add <strong>₹${freeShipLimit - currentTotal}</strong> for Free Delivery</div>
                    <div class="progress-track"><div class="progress-fill" style="width: ${percent}%"></div></div>
                </div>`;
        }

        // --- RENDER ITEMS ---
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

    // --- CALCULATIONS & VALIDATION ---

    // 1. Coupon Validation
    if (appliedDiscount && appliedDiscount.code && appliedDiscount.type !== 'loyalty') {
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

    // 2. Final Math
    let discountAmount = 0;
    if (appliedDiscount.type === 'percent') {
        discountAmount = Math.round(subtotal * (appliedDiscount.value / 100));
    } else if (appliedDiscount.type === 'flat' || appliedDiscount.type === 'loyalty') {
        discountAmount = appliedDiscount.value;
    }
    if (discountAmount > subtotal) discountAmount = subtotal;

    const final = (subtotal - discountAmount) + finalDeliveryCost;

    // 3. Min Order Validation
    const minOrder = shopConfig.minOrderValue || 0;
    if (cart.length > 0 && final < minOrder) {
        if (checkoutBtn) {
            checkoutBtn.disabled = true;
            checkoutBtn.style.background = '#ccc';
            checkoutBtn.innerHTML = `Add ₹${minOrder - final} more to order`;
        }
    } else {
        if (checkoutBtn) {
            checkoutBtn.disabled = false;
            checkoutBtn.style.background = ''; // Reset CSS
            togglePaymentUI(); // Restore "Pay Online" or "Place Order" text
        }
    }

    // 4. Update Footer Totals
    const totalEl = document.getElementById('cart-total');
    if (totalEl) totalEl.innerText = '₹' + final.toLocaleString('en-IN');

    const countEl = document.getElementById('cart-count');
    if (countEl) countEl.innerText = count;

    // 5. Share Cart Button
    const footer = document.querySelector('.cart-footer');
    const oldShare = document.getElementById('share-cart-btn');
    if (oldShare) oldShare.remove();

    if (cart.length > 0 && footer && checkoutBtn) {
        const shareBtn = document.createElement('button');
        shareBtn.id = 'share-cart-btn';
        shareBtn.className = 'share-cart-btn';
        shareBtn.innerHTML = '<i class="fas fa-share-alt"></i> Share Order with Family';
        shareBtn.onclick = shareCartOnWhatsApp;
        footer.insertBefore(shareBtn, checkoutBtn);
    }
}

function previewProfilePic(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function (e) {
            document.getElementById('edit-profile-pic').src = e.target.result;
            document.getElementById('profile-pic-base64').value = e.target.result;
        }
        reader.readAsDataURL(input.files[0]);
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

    let msg = "👋 *Hey everyone!* \n\nI'm placing an order for some delicious snacks from *Namo Namkeen*! 😋🍟\n\nHere is what I've picked so far:\n━━━━━━━━━━━━━━━━\n";

    cart.forEach(i => {
        msg += `🔸 *${i.name}* (${i.weight}) x ${i.qty}\n`;
    });

    let total = cart.reduce((sum, i) => sum + (i.price * i.qty), 0);
    msg += `━━━━━━━━━━━━━━━━\n💰 *Total Estimate:* ₹${total}\n\nAnyone want to add anything else? Speak now or miss out! 😜⏳`;

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

function handleCheckout() {
    // 1. Check Connectivity
    if (!navigator.onLine) {
        showToast("No Internet Connection", "error");
        return;
    }

    // 2. Force Login for Guests
    if (!currentUser) {
        showToast("Please login to place an order", "neutral");
        openLoginChoiceModal();
        return;
    }

    // 3. Get Elements safely (UPDATED)
    const phoneInput = document.getElementById('cust-phone');
    // Check for the new street input to ensure form is loaded
    const streetInput = document.getElementById('cust-addr-street');

    if (!phoneInput || !streetInput) {
        showToast("Error: Checkout form not loaded correctly. Please refresh.", "error");
        return;
    }

    const phone = phoneInput.value.trim();

    // 4. Validate
    if (cart.length === 0) return showToast("Your cart is empty!", "error");
    if (!/^[0-9]{10}$/.test(phone)) return showToast("Please enter a valid 10-digit mobile number.", "error");

    // Validate Address using the helper
    const addrObj = getAddressFromInputs('cust');
    if (!addrObj) return showToast("Please enter a complete delivery address.", "error");

    const nameInput = document.getElementById('cust-name');
    if (nameInput && nameInput.value.trim().length < 2) {
        return showToast("Please enter your Name", "error");
    }

    // 5. Proceed
    vibrate(50);
    initiateRazorpayPayment();
}

// 2. Called when payment is confirmed (UPI) or immediately (COD)
async function finalizeOrder(paymentMode) {
    // 1. Get Basic Inputs
    const phoneInput = document.getElementById('cust-phone');
    const nameInput = document.getElementById('cust-name');

    // 2. Get Email (Input > Auth > Empty)
    let email = "";
    const emailInput = document.getElementById('cust-email');
    if (emailInput && emailInput.value.trim()) {
        email = emailInput.value.trim();
    } else if (currentUser && currentUser.email) {
        email = currentUser.email;
    }

    // 3. Get Address (Structured)
    const addrObj = getAddressFromInputs('cust');
    // Fallback validation (though main checkout should have caught this)
    if (!addrObj) return showToast("Please complete delivery address", "error");

    // 4. Generate Robust ID
    const generateShortId = () => {
        const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
        let result = '';
        for (let i = 0; i < 6; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result.slice(0, 3) + '-' + result.slice(3);
    };
    const orderId = 'ORD-' + generateShortId();

    // 5. User Details
    const phone = phoneInput ? phoneInput.value.trim() : '';
    let uid = currentUser ? currentUser.uid : `guest_${phone}`;

    // Determine Name
    let uName = "Guest";
    if (nameInput && nameInput.value.trim()) {
        uName = nameInput.value.trim();
    } else if (currentUser && currentUser.displayName) {
        uName = currentUser.displayName;
    }

    // 6. Calculate Totals
    const { subtotal, discountAmount, shipping, finalTotal } = getCartTotals();
    const deliveryNote = document.getElementById('delivery-note') ? document.getElementById('delivery-note').value.trim() : '';

    try {
        // --- SAVE TO FIRESTORE ---
        await db.collection("orders").doc(String(orderId)).set({
            id: orderId,
            userId: uid,
            userName: uName,
            userPhone: phone,
            userEmail: email,

            // Address Data
            userAddress: addrObj.full,       // Display String
            addressDetails: addrObj,         // Structured Object

            deliveryNote: deliveryNote,
            items: cart,

            // Financials
            subtotal: subtotal,
            shippingCost: shipping,
            discount: appliedDiscount,
            discountAmt: discountAmount,
            total: finalTotal,

            // Payment Status
            paymentMethod: paymentMode,
            status: 'Pending',
            paymentStatus: paymentMode === 'UPI' ? 'Paid (User Confirmed)' : 'Pending',
            timestamp: new Date()
        });

        // --- SUCCESS UI ---
        cart = [];
        appliedDiscount = { type: 'none', value: 0, code: null };
        saveCartLocal();
        updateCartUI();

        closeModal('payment-modal'); // Close the Scan modal

        // Close sidebar
        document.getElementById('cart-sidebar').classList.remove('active');
        document.querySelector('.cart-overlay').classList.remove('active');

        // Show Success
        showSuccessModal(orderId, finalTotal, paymentMode);

    } catch (error) {
        console.error("Order Error:", error);
        showToast("Failed to place order. Please try again.", "error");
    }
}

// Add togglePaymentUI helper if you want to change button text dynamically
function togglePaymentUI() {
    const methodElem = document.querySelector('input[name="paymentMethod"]:checked');
    if (!methodElem) return;

    const method = methodElem.value;
    const btn = document.getElementById('btn-main-checkout');

    if (btn) {
        if (method === 'UPI') { // Matches the value="UPI" in HTML
            btn.innerHTML = 'Pay Securely <i class="fas fa-lock"></i>'; // Changed text
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
        // 1. Capture Inputs from Checkout Form (if user typed before logging in)
        const enteredPhone = document.getElementById('cust-phone').value;
        const addrObj = getAddressFromInputs('cust'); // Helper reads new fields

        const updateData = {
            name: res.user.displayName,
            email: res.user.email,
            lastLogin: new Date()
        };

        if (enteredPhone) updateData.phone = enteredPhone;

        // 2. Save Address if valid
        if (addrObj) {
            updateData.address = addrObj.full;       // Save String
            updateData.addressDetails = addrObj;     // Save Object
        }

        // 3. Save to Firestore
        db.collection("users").doc(res.user.uid).set(updateData, { merge: true });

        if (isCheckoutFlow) {
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
    const saveBtn = document.getElementById('btn-save-addr');
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
        if (saveBtn) saveBtn.style.display = 'inline-block'; // Allow saving

    } else {
        document.getElementById('login-btn').style.display = 'block';
        document.getElementById('user-profile').style.display = 'none';

        // Show the guest login link if it exists
        if (guestLink) guestLink.style.display = 'block';
        if (saveBtn) saveBtn.style.display = 'none'; // Hide for guests
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
// Invoice & Repeat
function openInvoice(orderId) {
    const order = historyOrders.find(o => o.id === orderId);
    if (!order) return showToast("Order details not found.", "error");

    // Fill basic details
    document.getElementById('inv-customer-name').innerText = order.userName;
    document.getElementById('inv-customer-email').innerText = currentUser.email || '-';
    document.getElementById('inv-order-id').innerText = `#${order.id}`;
    document.getElementById('inv-date').innerText = order.timestamp ? new Date(order.timestamp.seconds * 1000).toLocaleDateString() : '-';

    // Fill items table
    const tbody = document.getElementById('inv-items-body');
    tbody.innerHTML = '';
    order.items.forEach(i => {
        tbody.innerHTML += `<tr><td>${escapeHtml(String(i.name))} <br><small>${escapeHtml(String(i.weight))}</small></td><td class="text-center">${i.qty}</td><td class="text-right">₹${i.price}</td><td class="text-right">₹${i.price * i.qty}</td></tr>`;
    });

    document.getElementById('inv-grand-total').innerText = `₹${order.total}`;

    // --- NEW: INTERACTIVE QR CODE LOGIC ---
    // 1. Construct the UPI Payment Link
    const upiLink = `upi://pay?pa=${shopConfig.upiId}&pn=NamoNamkeen&am=${order.total}&cu=INR`;

    // 2. Generate the QR Image URL
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(upiLink)}`;

    // 3. Inject clickable HTML into the QR Section
    const qrContainer = document.getElementById('inv-qr-section');
    if (qrContainer) {
        qrContainer.innerHTML = `
            <p style="margin:0 0 10px; font-weight:bold; color:#d35400;">Tap QR to Pay via App</p>
            <a href="${upiLink}" target="_blank" style="display:inline-block; transition:transform 0.2s;" onclick="this.style.transform='scale(0.95)'">
                <img src="${qrUrl}" alt="Scan or Tap to Pay" style="width:150px; height:150px; mix-blend-mode: multiply; border: 2px solid rgba(232,93,4,0.3); border-radius: 8px;">
            </a>
            <p style="margin:10px 0 0; font-size:0.8rem; color:#555;">Works with GPay, PhonePe, Paytm</p>
        `;
    }
    // --------------------------------------

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
            <div class="modal-content mobile-modal" style="max-height: 85vh; overflow-y: auto;">
                
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                    <h2 style="color:var(--primary); margin:0;">Edit Profile</h2>
                    <button class="close-modal" onclick="closeProfileModal()" style="position:static;">&times;</button>
                </div>

                <div style="text-align:center; margin-bottom:15px;">
                    <img id="edit-profile-pic" src="logo.jpg" style="width:80px; height:80px; border-radius:50%; object-fit:cover; border:2px solid var(--primary);">
                    <br>
                    <label for="profile-pic-upload" style="color:var(--primary); font-size:0.8rem; cursor:pointer; text-decoration:underline;">Change Photo</label>
                    <input type="file" id="profile-pic-upload" accept="image/*" style="display:none;" onchange="previewProfilePic(this)">
                    <input type="hidden" id="profile-pic-base64">
                </div>

                <label class="input-label">Your Name</label>
                <input type="text" id="edit-name" class="form-control" placeholder="Enter your name">
                
                <label class="input-label">Email Address</label>
                <input type="email" id="edit-email" class="form-control" placeholder="name@example.com">

                <label class="input-label">Mobile Number</label>
                <input type="tel" id="edit-phone" class="form-control" placeholder="10-digit number">
                
                <label class="input-label">Address Details</label>
                <input type="text" id="edit-addr-street" class="form-control" placeholder="House No, Street, Area" style="margin-bottom: 10px;">
                <div style="display: flex; gap: 10px;">
                    <input type="text" id="edit-addr-city" class="form-control" placeholder="City" value="Indore">
                    <input type="number" id="edit-addr-pin" class="form-control" placeholder="Pincode">
                </div>
                
                <button onclick="saveProfile()" class="btn-primary full-width" style="margin-top:20px; padding:12px;">Save Changes</button>

                <hr style="margin: 20px 0; border: 0; border-top: 1px dashed #ddd;">

                <button onclick="toggleReferralSection()" style="background:none; border:none; color:#0288d1; font-weight:600; cursor:pointer; width:100%; text-align:left; display:flex; justify-content:space-between; align-items:center;">
                    <span><i class="fas fa-gift"></i> Refer & Earn ₹50</span>
                    <i class="fas fa-chevron-down" id="ref-chevron"></i>
                </button>

                <div id="referral-section" style="display:none; margin-top:15px; background:#f0f9ff; padding:15px; border-radius:8px; border:1px solid #bae6fd;">
                    <div style="display:flex; gap:10px; margin-bottom:15px;">
                        <input type="text" id="my-ref-code" readonly value="..." style="flex:1; background:white; border:1px dashed #0288d1; padding:10px; text-align:center; font-weight:bold; letter-spacing:1px; color:#0288d1;">
                        <button class="btn-primary" onclick="copyRefCode()" style="padding:0 15px;"><i class="far fa-copy"></i></button>
                    </div>
                    <div style="display:flex; gap:10px;">
                        <input type="text" id="enter-ref-code" placeholder="Enter Code" class="form-control" style="text-transform:uppercase;">
                        <button class="btn-primary" onclick="redeemReferral()" style="background:#27ae60;">Redeem</button>
                    </div>
                </div>
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
    // If modal is missing from HTML, inject it (use your ensureModalExists function if you have it)
    const modal = document.getElementById('profile-modal');
    if (!modal) return console.error("Profile modal not found in HTML");

    modal.style.display = 'flex';
    if (document.getElementById('profile-menu')) document.getElementById('profile-menu').classList.remove('active');

    // Init Referrals
    if (typeof initReferral === 'function') initReferral();

    // Fill Data
    if (userProfile) {
        document.getElementById('edit-name').value = userProfile.name || (currentUser.displayName || '');
        document.getElementById('edit-phone').value = userProfile.phone || '';
        document.getElementById('edit-email').value = userProfile.email || (currentUser.email || '');

        // Address Logic
        if (userProfile.addressDetails) {
            document.getElementById('edit-addr-street').value = userProfile.addressDetails.street || '';
            document.getElementById('edit-addr-city').value = userProfile.addressDetails.city || 'Indore';
            document.getElementById('edit-addr-pin').value = userProfile.addressDetails.pin || '';
        } else {
            document.getElementById('edit-addr-street').value = userProfile.address || '';
            document.getElementById('edit-addr-city').value = 'Indore';
            document.getElementById('edit-addr-pin').value = '';
        }

        // Photo Logic
        const imgEl = document.getElementById('edit-profile-pic');
        const hiddenInput = document.getElementById('profile-pic-base64');
        if (userProfile.photoURL) {
            imgEl.src = userProfile.photoURL;
            hiddenInput.value = userProfile.photoURL;
        } else {
            imgEl.src = 'logo.jpg';
            hiddenInput.value = '';
        }
    }
}

async function validateCartIntegrity() {
    const productIds = cart.map(i => i.productId);
    // Fetch all products in cart
    // Note: Firestore 'in' query limit is 10. For simplicity, we loop gets or assume cart is small.
    // Better approach:
    const promises = cart.map(i => db.collection('products').doc(String(i.productId)).get());
    const docs = await Promise.all(promises);

    for (let doc of docs) {
        if (!doc.exists) throw new Error("Some items in cart are no longer available.");
        const p = doc.data();
        const cartItem = cart.find(i => i.productId === p.id);

        // Stock Check
        if (!p.in_stock) throw new Error(`${p.name} is out of stock.`);

        // Price Check
        let realPrice = p.price;
        if (p.variants) {
            const v = p.variants.find(va => va.weight === cartItem.weight);
            if (v) realPrice = v.price;
        }

        if (realPrice !== cartItem.price) {
            throw new Error(`Price changed for ${p.name}. Please refresh cart.`);
        }
    }
    return true;
}



function closeProfileModal() { document.getElementById('profile-modal').style.display = 'none'; }

// Toggle Function for the Referral Section
function toggleReferralSection() {
    const sec = document.getElementById('referral-section');
    const chev = document.getElementById('ref-chevron');
    if (sec.style.display === 'none') {
        sec.style.display = 'block';
        chev.classList.replace('fa-chevron-down', 'fa-chevron-up');
    } else {
        sec.style.display = 'none';
        chev.classList.replace('fa-chevron-up', 'fa-chevron-down');
    }
}

// Updated saveProfile to include Name
function saveProfile() {
    const name = document.getElementById('edit-name').value.trim();
    const phone = document.getElementById('edit-phone').value.trim();
    const email = document.getElementById('edit-email').value.trim();

    // Address
    const addrObj = getAddressFromInputs('edit');
    if (!name) return showToast("Name is required", "error");
    if (!addrObj || !addrObj.street) return showToast("Address is incomplete", "error");

    // Photo
    const picBase64 = document.getElementById('profile-pic-base64').value;

    const updateData = {
        name: name,
        phone: phone,
        email: email,
        address: addrObj.full,
        addressDetails: addrObj,
        lastUpdated: new Date()
    };

    if (picBase64) updateData.photoURL = picBase64;

    toggleBtnLoading('btn-save-profile', true);

    db.collection("users").doc(currentUser.uid).set(updateData, { merge: true })
        .then(() => {
            if (!userProfile) userProfile = {};
            Object.assign(userProfile, updateData);

            // Update UI Elements
            document.getElementById('user-name').innerText = name;
            if (picBase64) document.getElementById('user-pic').src = picBase64;

            // Auto-fill Checkout if open
            const custPhone = document.getElementById('cust-phone');
            if (custPhone) custPhone.value = phone.replace('+91', '');

            // Auto-fill Checkout Address inputs if they exist
            const custStreet = document.getElementById('cust-addr-street');
            if (custStreet) {
                custStreet.value = addrObj.street;
                document.getElementById('cust-addr-city').value = addrObj.city;
                document.getElementById('cust-addr-pin').value = addrObj.pin;
            }

            closeProfileModal();
            showToast("Profile Saved!", "success");
        })
        .catch(err => {
            console.error(err);
            showToast("Error saving profile", "error");
        })
        .finally(() => toggleBtnLoading('btn-save-profile', false));
}

function playVideo(w) { const v = w.querySelector('video'); document.querySelectorAll('.video-wrapper.playing video').forEach(o => { if (o !== v) { o.pause(); o.closest('.video-wrapper').classList.remove('playing'); } }); if (v.paused) { w.classList.add('playing'); v.play(); } else { w.classList.remove('playing'); v.pause(); } }
function closeAnnouncement() { document.getElementById('announcement-bar').style.display = 'none'; }
function filterMenu(c) {
    currentCategory = c;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    // Safely add 'active' to clicked element (avoid using global 'event')
    const activeTarget = document.activeElement;
    if (activeTarget && activeTarget.classList && activeTarget.classList.contains('filter-btn')) {
        activeTarget.classList.add('active');
    }

    renderMenu();
    vibrate(30); // Haptic feedback on filter click

    // Scroll to top of grid (guard in case element missing)
    const grid = document.getElementById('menu-grid');
    if (!grid) return;
    const yOffset = -130; // Offset for Sticky Header + Sticky Filter
    const rect = grid.getBoundingClientRect();
    const y = rect.top + window.pageYOffset + yOffset;
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

    // Guard: ensure elements exist before accessing classList / contains
    if (!nav || !hamburger) return;

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
        const safeCouponCode = escapeHtml(String(c.code));
        listContainer.innerHTML += `
            <div class="coupon-item" onclick="useCoupon('${safeCouponCode}')" style="padding:10px; border-bottom:1px solid #eee; cursor:pointer;">
                <strong style="color:var(--primary)">${safeCouponCode}</strong> - ${desc}
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

    // --- FIX: Get Address from New Inputs ---
    const addrObj = getAddressFromInputs('cust');
    if (!addrObj) return showToast("Enter complete address", "error");
    const address = addrObj.full; // Use formatted string for display
    // ----------------------------------------

    if (!/^[0-9]{10}$/.test(phone)) return showToast("Enter valid 10-digit phone", "error");

    // Check Payment Method
    const methodElem = document.querySelector('input[name="paymentMethod"]:checked');
    const paymentMethod = methodElem ? methodElem.value : 'Online';

    const { finalTotal } = getCartTotals();

    if (paymentMethod === 'COD') {
        if (await showConfirm(`Place order for ₹${finalTotal} via Cash on Delivery?`)) {
            saveOrderToFirebase('COD', 'Pending', null);
        }
    } else {
        // --- SECURE ONLINE FLOW ---
        toggleBtnLoading('btn-main-checkout', true);
        showToast("Initializing Secure Payment...", "neutral");

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
            showToast("Payment Init Failed: " + error.message, "error");
            toggleBtnLoading('btn-main-checkout', false);
        }
    }
}

function openSecureRazorpay(orderId, keyId, amount, userPhone) {
    const userName = currentUser ? currentUser.displayName : "Guest User";
    const userEmail = currentUser ? currentUser.email : "guest@namonamkeen.com";

    var options = {
        "key": keyId, // Received from server
        "amount": amount,
        "currency": "INR",
        "name": "Namo Namkeen",
        "description": "Secure Payment",
        "image": "logo.jpg",
        "order_id": orderId, // Critical: Links to the secure server order
        "handler": function (response) {
            console.log("Payment Success:", response);
            // Verify signature here if needed, or trust the success for basic flow
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
                showToast("Payment cancelled.", "error");
                toggleBtnLoading('btn-main-checkout', false);
            }
        }
    };

    var rzp1 = new Razorpay(options);
    rzp1.on('payment.failed', function (response) {
        showToast("Payment Failed: " + response.error.description);
        toggleBtnLoading('btn-main-checkout', false);
    });
    rzp1.open();
}

async function saveOrderToFirebase(method, paymentStatus, txnId) {
    toggleBtnLoading('btn-main-checkout', true);

    const phone = document.getElementById('cust-phone').value.trim();
    let email = document.getElementById('cust-email').value.trim();
    if (!email && currentUser && currentUser.email) email = currentUser.email;

    // --- GET ADDRESS ---
    const addrObj = getAddressFromInputs('cust');
    if (!addrObj) {
        toggleBtnLoading('btn-main-checkout', false);
        return showToast("Please complete delivery address", "error");
    }

    const emailInput = document.getElementById('cust-email');
    if (emailInput && emailInput.value.trim()) {
        email = emailInput.value.trim();
    } else if (currentUser && currentUser.email) {
        email = currentUser.email;
    }


    // 2. Generate Order ID
    const generateShortId = () => {
        const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
        let result = '';
        for (let i = 0; i < 6; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result.slice(0, 3) + '-' + result.slice(3);
    };
    const orderId = 'ORD-' + generateShortId();

    let uid = currentUser ? currentUser.uid : `guest_${phone}`;
    // --- FIX: Capture Name ---
    let uName = "Guest";
    const nameInput = document.getElementById('cust-name');
    if (nameInput && nameInput.value.trim()) {
        uName = nameInput.value.trim();
    } else if (currentUser && currentUser.displayName) {
        uName = currentUser.displayName;
    }
    const deliveryNote = document.getElementById('delivery-note') ? document.getElementById('delivery-note').value.trim() : '';

    const { subtotal, discountAmount, shipping, finalTotal } = getCartTotals();

    try {
        const batch = db.batch();
        const orderRef = db.collection("orders").doc(String(orderId));
        batch.set(orderRef, {
            id: orderId,
            userId: uid,
            userName: uName,
            userPhone: phone,
            userEmail: email, // Save email for Cloud Function
            // SAVE STRUCTURED ADDRESS
            userAddress: addrObj.full,       // Display String
            addressDetails: addrObj,         // Data Object
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

        // --- B. PREPARE USER DATA (Consolidated) ---
        const userRef = db.collection("users").doc(String(uid));

        // Base profile update
        let userUpdateData = {
            name: uName,
            phone: phone,
            address: addrObj.full,        // Update main string
            addressDetails: addrObj,      // Update structure
            lastOrder: new Date(),
            type: currentUser ? 'Registered' : 'Guest'
        };
        if (email) userUpdateData.email = email;

        // --- LOYALTY LOGIC (FIXED) ---
        if (currentUser) {
            let netWalletChange = 0;
            const coinsEarned = Math.floor(finalTotal / 100);

            // 1. Calculate Earnings
            if (coinsEarned > 0) {
                netWalletChange += coinsEarned;
                // Log Credit History
                const histRef = userRef.collection("wallet_history").doc();
                batch.set(histRef, {
                    amount: coinsEarned,
                    type: 'credit',
                    description: `Earned from Order #${orderId}`,
                    timestamp: new Date()
                });
            }

            // 2. Calculate Usage
            if (appliedDiscount.type === 'loyalty') {
                netWalletChange -= appliedDiscount.value;
                // Log Debit History
                const debitRef = userRef.collection("wallet_history").doc();
                batch.set(debitRef, {
                    amount: appliedDiscount.value,
                    type: 'debit',
                    description: `Redeemed on Order #${orderId}`,
                    timestamp: new Date()
                });
            }

            // 3. SINGLE UPDATE to User Profile
            if (netWalletChange !== 0) {
                batch.update(userRef, {
                    walletBalance: firebase.firestore.FieldValue.increment(netWalletChange)
                });
            }
        }

        // --- PERFORM SINGLE USER WRITE ---
        batch.set(userRef, userUpdateData, { merge: true });

        // --- C. COMMIT ---
        await batch.commit();

        showSuccessModal(orderId, finalTotal, method);

        cart = [];
        appliedDiscount = { type: 'none', value: 0, code: null };
        saveCartLocal();
        updateCartUI();
        if (document.getElementById('cart-sidebar').classList.contains('active')) toggleCart();

    } catch (error) {
        console.error("Order Error:", error);
        showToast("Error placing order. Please try again.", "error");
    } finally {
        toggleBtnLoading('btn-main-checkout', false);
    }
}

function showSuccessModal(orderId, amount, method) {
    const custName = currentUser ? currentUser.displayName : "Guest";

    // --- FIX: Read from New Address Fields ---
    const addrObj = getAddressFromInputs('cust');
    // If for some reason inputs are cleared, fallback to generic text
    const address = addrObj ? addrObj.full : "Address not captured";
    // -----------------------------------------

    // Optional Delivery Note
    const noteElem = document.getElementById('delivery-note');
    const noteText = (noteElem && noteElem.value.trim()) ? `\n📝 *Note:* ${noteElem.value.trim()}` : '';

    // Enhanced Message
    const msg = `🎉 *New Order Received!* 🎉\n\n🆔 *Order ID:* ${orderId}\n👤 *Customer:* ${custName}\n📍 *Address:* ${address}${noteText}\n\n💰 *Amount:* ₹${amount}\n💳 *Payment:* ${method === 'Online' ? 'PAID ✅' : 'Cash on Delivery 🚚'}\n\nPlease confirm dispatch! 🚀`;

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
        // Trigger confetti if available
        if (typeof confetti === 'function') {
            confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 }, colors: ['#e85d04', '#faa307', '#ffffff'] });
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

    // 1. Image Handling
    const fileInput = document.getElementById('review-img-upload');
    let base64Img = null;

    if (fileInput.files.length > 0) {
        const file = fileInput.files[0];
        if (file.size > 500 * 1024) return showToast("Image too large (Max 500KB)", "error");

        // Convert to Base64
        base64Img = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.readAsDataURL(file);
        });
    }

    toggleBtnLoading('btn-submit-review', true);

    try {
        // 4. Check for Duplicates
        const check = await db.collection("reviews")
            .where("status", "==", "approved")
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
        // 2. Add Review Object
        await db.collection("reviews").add({
            productId: pid,
            orderId: oid,
            userId: currentUser.uid,
            userName: currentUser.displayName || 'Customer',
            rating: rating,
            comment: comment,
            imageUrl: base64Img, // Save the image string
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
    if (!container) return; // Ensure container exists

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    let icon = '';
    if (type === 'success') icon = '<i class="fas fa-check-circle" style="color:#2ecc71"></i>';
    if (type === 'error') icon = '<i class="fas fa-exclamation-circle" style="color:#e74c3c"></i>';

    toast.innerHTML = `${icon} <span>${message}</span>`;

    // Add to DOM
    container.appendChild(toast);

    // Remove after 3 seconds
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)'; // Drop down effect
        setTimeout(() => toast.remove(), 300);
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
    closeModal('login-choice-modal'); // Close selection modal

    if (method === 'google') {
        googleLogin(true);
    }
    else if (method === 'mobile') {
        // 1. Get Phone Number
        let phoneNumber = document.getElementById('cust-phone').value.trim();

        // If empty, ask user
        if (!phoneNumber || phoneNumber.length < 10) {
            phoneNumber = prompt("Enter your 10-digit Mobile Number:");
        }

        if (!phoneNumber || phoneNumber.length < 10) {
            return showToast("Valid phone number required", "error");
        }

        // Format to E.164 (e.g., +919876543210)
        if (!phoneNumber.startsWith('+91')) {
            phoneNumber = '+91' + phoneNumber;
        }

        // 2. Send OTP
        initiatePhoneLogin(phoneNumber);
    }
}

// --- SMART SEARCH LOGIC ---
const searchInput = document.getElementById('menu-search');
const suggestionsBox = document.getElementById('search-suggestions');
let fuse; // Hold the Fuse instance

// Initialize Fuse once products are loaded
// Initialize Fuse safely
function initFuzzySearch() {
    // Safety Check: If Fuse script isn't loaded, stop here instead of crashing
    if (typeof Fuse === 'undefined') {
        console.warn("Fuse.js not loaded. Search will fallback to simple filtering.");
        return;
    }

    const options = {
        keys: ['name', 'nameHi', 'category', 'desc'],
        threshold: 0.4,
        distance: 100
    };
    fuse = new Fuse(products, options);
}

if (searchInput && suggestionsBox) {
    searchInput.addEventListener('input', function () {

        let query = this.value.toLowerCase().trim();

        // --- NEW: Check for Synonyms ---
        if (synonymMap[query]) {
            query = synonymMap[query]; // Swap "kaju" for "cashew" automatically
        }

        if (!fuse) {
            searchMenu();
            return;
        }

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
// UPDATE loadStorefront() in script.js
function loadStorefront() {
    const hero = document.getElementById('home');
    if (!hero) return;

    db.collection("settings").doc("layout").get().then(doc => {
        if (doc.exists) {
            const data = doc.data();
            // Text
            if (data.heroTitle) document.getElementById('hero-title').innerHTML = data.heroTitle.replace(/\n/g, '<br>');
            if (data.heroSubtitle) document.getElementById('hero-subtitle').innerText = data.heroSubtitle;

            // Carousel Logic
            if (data.banners && data.banners.length > 0) {
                let currentSlide = 0;
                // Create background layer if not exists
                let bgLayer = document.getElementById('hero-bg');
                if (!bgLayer) {
                    bgLayer = document.createElement('div');
                    bgLayer.id = 'hero-bg';
                    hero.insertBefore(bgLayer, hero.firstChild);
                }

                // Rotation Function
                const rotateBanner = () => {
                    bgLayer.style.backgroundImage = `url('${data.banners[currentSlide]}')`;
                    currentSlide = (currentSlide + 1) % data.banners.length;
                };

                rotateBanner(); // Init
                if (data.banners.length > 1) setInterval(rotateBanner, 5000); // Rotate every 5s
            }
        }
    });
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
    const streetInput = document.getElementById('cust-addr-street');
    const cityInput = document.getElementById('cust-addr-city');
    const pinInput = document.getElementById('cust-addr-pin');
    const saveBtn = document.getElementById('btn-save-addr');

    if (idx === 'new') {
        // Clear fields for typing
        streetInput.value = '';
        cityInput.value = 'Indore'; // Default city
        pinInput.value = '';

        // Show Save Button
        if (saveBtn) saveBtn.style.display = 'inline-block';
    } else {
        // Load Saved Data
        const savedItem = userProfile.savedAddresses[idx];

        if (savedItem.details) {
            // New Format: Fill all fields
            streetInput.value = savedItem.details.street || '';
            cityInput.value = savedItem.details.city || 'Indore';
            pinInput.value = savedItem.details.pin || '';
        } else {
            // Legacy Format (Old string addresses): Put everything in Street
            streetInput.value = savedItem.text || '';
            cityInput.value = 'Indore';
            pinInput.value = '';
        }

        // Hide Save Button (Already saved)
        if (saveBtn) saveBtn.style.display = 'none';
    }
}

async function saveNewAddress() {
    // 1. Read New Fields
    const addrObj = getAddressFromInputs('cust');

    if (!addrObj) return showToast("Please complete address first", "error");
    if (addrObj.street.length < 5) return showToast("Street address too short", "error");

    const label = prompt("Give this address a name (e.g., Home, Office):", "Home");
    if (!label) return;

    // 2. Create Structured Entry
    const newAddrEntry = {
        label: label,
        text: addrObj.full,      // For display in dropdown
        details: addrObj         // For filling inputs later
    };

    try {
        await db.collection("users").doc(currentUser.uid).update({
            savedAddresses: firebase.firestore.FieldValue.arrayUnion(newAddrEntry)
        });

        // 3. Update Local State
        if (!userProfile.savedAddresses) userProfile.savedAddresses = [];
        userProfile.savedAddresses.push(newAddrEntry);

        showToast("Address Saved!", "success");
        loadUserAddresses(); // Refresh dropdown

        // Auto-select the new address
        const selector = document.getElementById('addr-selector');
        if (selector) selector.value = userProfile.savedAddresses.length - 1;

    } catch (e) {
        console.error(e);
        showToast("Error saving address", "error");
    }
}

function checkDeepLink() {
    const urlParams = new URLSearchParams(window.location.search);
    const pid = urlParams.get('pid');

    if (pid) {
        // Clear the param so refreshing doesn't keep opening it
        window.history.replaceState({}, document.title, "/");

        // Slight delay to ensure DOM is ready
        setTimeout(() => {
            const product = products.find(p => p.id == pid);
            if (product) {
                openProductDetail(product.id);
            } else {
                showToast("Product not found", "error");
            }
        }, 500);
    }
}

// 1. ADD THIS FUNCTION to view history
function openWalletHistory() {
    if (!currentUser) return;
    document.getElementById('wallet-modal').style.display = 'flex';
    const list = document.getElementById('wallet-history-list');
    list.innerHTML = '<div style="text-align:center; padding:20px;"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';

    db.collection("users").doc(currentUser.uid).collection("wallet_history")
        .orderBy("timestamp", "desc").limit(50).get()
        .then(snap => {
            if (snap.empty) {
                list.innerHTML = '<div style="text-align:center; padding:20px; color:#999;">No transactions yet.</div>';
                return;
            }

            let html = '';
            snap.forEach(doc => {
                const t = doc.data();
                const date = t.timestamp ? t.timestamp.toDate().toLocaleDateString() : '-';
                const color = t.type === 'credit' ? 'green' : 'red';
                const sign = t.type === 'credit' ? '+' : '-';

                html += `
              <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 0; border-bottom:1px solid #eee;">
                  <div>
                      <div style="font-weight:600; color:#333;">${t.description}</div>
                      <div style="font-size:0.8rem; color:#888;">${date}</div>
                  </div>
                  <div style="font-weight:bold; color:${color}; font-size:1.1rem;">
                      ${sign} ${t.amount}
                  </div>
              </div>`;
            });
            list.innerHTML = html;
        });
}

// 1. Call this inside fetchUserProfile() or when opening profile modal
async function initReferral() {
    if (!currentUser || !userProfile) return;

    // Generate code if not exists
    if (!userProfile.referralCode) {
        // Create simple code: First 4 chars of name + Last 4 of UID
        const base = (currentUser.displayName || "USER").replace(/\s/g, '').substring(0, 4).toUpperCase();
        const suffix = currentUser.uid.substring(0, 4).toUpperCase();
        const code = base + suffix;

        await db.collection("users").doc(currentUser.uid).update({ referralCode: code });
        userProfile.referralCode = code;
    }

    document.getElementById('my-ref-code').value = userProfile.referralCode;
}

// 2. Helper to copy code
function copyRefCode() {
    const code = document.getElementById('my-ref-code');
    code.select();
    document.execCommand("copy");
    showToast("Code copied to clipboard!", "success");
}

// 3. Redeem Function
async function redeemReferral() {
    const input = document.getElementById('enter-ref-code');
    const code = input.value.trim().toUpperCase();

    if (!code) return showToast("Enter a code", "error");
    if (code === userProfile.referralCode) return showToast("You can't refer yourself!", "error");
    if (userProfile.referredBy) return showToast("You have already redeemed a code.", "error");

    try {
        // Find the referrer
        const snap = await db.collection("users").where("referralCode", "==", code).limit(1).get();

        if (snap.empty) {
            return showToast("Invalid Referral Code", "error");
        }

        const referrerDoc = snap.docs[0];
        const referrerId = referrerDoc.id;
        const referrerData = referrerDoc.data();

        const batch = db.batch();
        const rewardAmount = 50;

        // 1. Credit Current User (You)
        const myRef = db.collection("users").doc(currentUser.uid);
        batch.update(myRef, {
            walletBalance: firebase.firestore.FieldValue.increment(rewardAmount),
            referredBy: code
        });

        // Log History for You
        const myHist = myRef.collection("wallet_history").doc();
        batch.set(myHist, {
            amount: rewardAmount,
            type: 'credit',
            description: `Referral Bonus (Code: ${code})`,
            timestamp: new Date()
        });

        // 2. Credit Referrer (Friend)
        const friendRef = db.collection("users").doc(referrerId);
        batch.update(friendRef, {
            walletBalance: firebase.firestore.FieldValue.increment(rewardAmount)
        });

        // Log History for Friend
        const friendHist = friendRef.collection("wallet_history").doc();
        batch.set(friendHist, {
            amount: rewardAmount,
            type: 'credit',
            description: `Referral Reward (User: ${currentUser.displayName})`,
            timestamp: new Date()
        });

        await batch.commit();

        showToast(`Success! ₹${rewardAmount} added to your wallet.`, "success");
        userProfile.referredBy = code; // Update local state
        input.value = '';
        input.disabled = true; // Prevent double dip

    } catch (e) {
        console.error(e);
        showToast("Error processing referral", "error");
    }
}

// --- EXIT INTENT LOGIC ---

let exitIntentShown = false;

// 1. Initialize Exit Detection
document.addEventListener('DOMContentLoaded', () => {
    // Check if already shown in this session
    if (sessionStorage.getItem('namoExitShown')) return;

    // Desktop: Mouse leaves window (towards top)
    document.addEventListener('mouseleave', (e) => {
        if (e.clientY < 0) triggerExitPopup();
    });

    // Mobile: Trigger after 60 seconds if cart has items but no checkout
    // (Mobile "exit" is hard to detect, so we use a timer as a proxy)
    if (window.innerWidth < 768) {
        setTimeout(() => {
            triggerExitPopup();
        }, 60000); // 60 seconds
    }
});

function triggerExitPopup() {
    // Conditions to show:
    // 1. Popup hasn't been shown yet
    // 2. Cart has items
    // 3. User is not currently in the payment process (payment modal hidden)
    if (exitIntentShown || cart.length === 0 || document.getElementById('payment-modal').style.display === 'flex') {
        return;
    }

    const modal = document.getElementById('exit-modal');
    if (modal) {
        modal.style.display = 'flex';
        exitIntentShown = true;
        sessionStorage.setItem('namoExitShown', 'true'); // Don't show again this session
    }
}

function applyExitCoupon() {
    const code = document.getElementById('exit-coupon-code').innerText;
    const input = document.getElementById('promo-code');

    // 1. Close Popup
    closeModal('exit-modal');

    // 2. Open Cart Sidebar
    if (!document.getElementById('cart-sidebar').classList.contains('active')) {
        toggleCart();
    }

    // 3. Fill and Apply Coupon
    if (input) {
        input.value = code;
        // You need to create this coupon in Admin Panel for it to work!
        // Or we can simulate it client-side if you prefer, but Admin creation is safer.
        applyPromo();
    }
}

function setupRecaptcha() {
    if (!window.recaptchaVerifier) {
        window.recaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', {
            'size': 'invisible',
            'callback': (response) => {
                // reCAPTCHA solved, allow signInWithPhoneNumber.
                console.log("Recaptcha Verified");
            }
        });
    }
}

function initiatePhoneLogin(phoneNumber) {
    // 1. Show Global Loader
    toggleGlobalLoading(true);
    // showToast("Sending OTP...", "neutral"); // Optional: Loader is enough

    const appVerifier = window.recaptchaVerifier;

    auth.signInWithPhoneNumber(phoneNumber, appVerifier)
        .then((result) => {
            confirmationResult = result;

            // 2. Hide Loader
            toggleGlobalLoading(false);

            document.getElementById('otp-phone-display').innerText = phoneNumber;
            document.getElementById('otp-modal').style.display = 'flex';

            // Auto-focus the input for better UX
            setTimeout(() => document.getElementById('otp-input').focus(), 300);

            showToast("OTP Sent!", "success");
        }).catch((error) => {
            console.error("SMS Error:", error);

            // 3. Hide Loader on Error
            toggleGlobalLoading(false);

            showToast("SMS Failed: " + error.message, "error");
            if (window.recaptchaVerifier) window.recaptchaVerifier.clear();
            setupRecaptcha();
        });
}

function confirmOtp() {
    const code = document.getElementById('otp-input').value.trim();
    if (code.length !== 6) return showToast("Enter 6-digit code", "error");

    // 1. Show Global Loader
    toggleGlobalLoading(true);

    confirmationResult.confirm(code).then((result) => {
        const user = result.user;
        let isNewUserOrIncomplete = false;

        // Check if Name is default/missing
        if (!user.displayName) {
            isNewUserOrIncomplete = true;
        }

        // ... (Your existing profile update logic) ...
        const updateData = { phone: user.phoneNumber, lastLogin: new Date() };
        if (!user.displayName) updateData.name = "User " + user.phoneNumber.slice(-4);
        db.collection("users").doc(user.uid).set(updateData, { merge: true });

        // 2. Hide Loader & Close Modal
        toggleGlobalLoading(false);
        closeModal('otp-modal');

        showToast("Login Successful!", "success");

        requestUserNotifications();

        // --- NEW: Prompt for Name if missing ---
        if (isNewUserOrIncomplete) {
            setTimeout(() => {
                alert("Welcome! Please tell us your Name for the invoice.");
                openProfileModal(); // Opens the existing modal so they can fill Name/Email
            }, 500);
        }

        // Auto-fill Logic
        const phoneInput = document.getElementById('cust-phone');
        if (phoneInput) {
            let cleanPhone = user.phoneNumber.replace('+91', '').replace(/[^0-9]/g, '');
            phoneInput.value = cleanPhone;
        }

        if (cart.length > 0) {
            initiateRazorpayPayment();
        }

    }).catch((error) => {
        toggleGlobalLoading(false);
        console.error(error);

        if (error.code === 'auth/invalid-verification-code') {
            showToast("Invalid OTP. Please check code.", "error");
        } else {
            showToast("Login Failed: " + error.message, "error");
        }
    });
}

function resendOtp() {
    closeModal('otp-modal');
    handleLoginChoice('mobile'); // Retry flow
}

function shareApp() {
    const shareData = {
        title: 'Namo Namkeen',
        text: 'Order authentic Indori Namkeen & Sweets online! Best taste guaranteed. 😋',
        url: window.location.origin
    };

    if (navigator.share) {
        navigator.share(shareData).then(() => showToast("Thanks for sharing! 🧡", "success"));
    } else {
        // Fallback
        const waUrl = `https://wa.me/?text=${encodeURIComponent(shareData.text + ' ' + shareData.url)}`;
        window.open(waUrl, '_blank');
    }
}

// --- PWA INSTALLATION LOGIC (User Side) ---
let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
    // 1. Prevent Chrome 67 and earlier from automatically showing the prompt
    e.preventDefault();
    // 2. Stash the event so it can be triggered later.
    deferredPrompt = e;

    // 3. Update UI: Show the hidden install button
    const installBtn = document.getElementById('pwa-install-btn');
    if (installBtn) {
        installBtn.style.display = 'block'; // Make it visible
        console.log("PWA Ready to Install (User)");

        installBtn.addEventListener('click', () => {
            // Hide the button
            installBtn.style.display = 'none';
            // Show the install prompt
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

// Helper to construct address object
function getAddressFromInputs(prefix) {
    const street = document.getElementById(`${prefix}-addr-street`);
    const city = document.getElementById(`${prefix}-addr-city`);
    const pin = document.getElementById(`${prefix}-addr-pin`);

    if (!street || !city || !pin) return null; // Safety check

    return {
        street: street.value.trim(),
        city: city.value.trim(),
        pin: pin.value.trim(),
        full: `${street.value.trim()}, ${city.value.trim()} - ${pin.value.trim()}`
    };
}

function toggleGlobalLoading(show) {
    const loader = document.getElementById('global-loader');
    if (loader) {
        loader.style.display = show ? 'flex' : 'none';
    }
}

function requestUserNotifications() {
    // Check if key is loaded
    if (!shopConfig.vapidKey) {
        console.log("VAPID Key missing from config");
        return;
    }

    Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
            messaging.getToken({ vapidKey: shopConfig.vapidKey }).then((currentToken) => {
                if (currentToken && currentUser) {
                    db.collection("users").doc(currentUser.uid).update({
                        fcmToken: currentToken
                    });
                }
            }).catch(err => console.log("Token Error", err));
        }
    });
}

function openWhatsAppLogin() {
    // 1. Close the choice modal first
    closeModal('login-choice-modal');

    // 2. Open the WhatsApp modal
    document.getElementById('whatsapp-login-modal').style.display = 'flex';
}

async function sendWhatsAppOTP() {
    const phoneInput = document.getElementById('whatsapp-phone');
    const phone = phoneInput.value.trim();

    if (phone.length !== 10) {
        return showToast("Enter valid 10-digit mobile number", "error");
    }

    try {
        const sendOTP = firebase.functions().httpsCallable('sendWhatsAppOTP');
        await sendOTP({ phoneNumber: phone });

        showToast("OTP sent to your WhatsApp!", "success");
        document.getElementById('whatsapp-otp-section').style.display = 'block';

    } catch (error) {
        showToast("Failed to send OTP: " + error.message, "error");
    }
}
async function verifyWhatsAppOTP() {
    const phone = document.getElementById('whatsapp-phone').value.trim();
    const otp = document.getElementById('whatsapp-otp-input').value.trim();

    if (otp.length !== 6) {
        return showToast("Enter 6-digit OTP", "error");
    }

    try {
        const verifyOTP = firebase.functions().httpsCallable('verifyWhatsAppOTP');
        const result = await verifyOTP({ phoneNumber: phone, otp: otp });

        // Sign in with custom token
        await firebase.auth().signInWithCustomToken(result.data.token);

        showToast("Login successful! 🎉", "success");
        closeWhatsAppLogin();

    } catch (error) {
        showToast("Invalid OTP: " + error.message, "error");
    }
}