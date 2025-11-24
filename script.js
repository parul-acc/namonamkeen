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

// New Coupon State
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

// Scroll Listener
window.onscroll = function () {
    const btn = document.getElementById("scrollTopBtn");
    if (btn) btn.style.display = (document.body.scrollTop > 300 || document.documentElement.scrollTop > 300) ? "flex" : "none";
};

// --- 4. DATA FETCHING ---
function fetchData() {
    // 1. Fetch Products
    db.collection("products").get().then(snap => {
        products = [];
        snap.forEach(doc => products.push(doc.data()));
        products = products.filter(p => p.id !== 999);
        renderMenu();
        renderHamperOptions();
    }).catch(err => console.error("Products Error:", err));

    // 2. Fetch Announcement
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

    // 3. Fetch Coupons
    const now = new Date();
    db.collection("coupons").where("isActive", "==", true).onSnapshot(snap => {
        activeCoupons = [];
        snap.forEach(doc => {
            const c = doc.data();
            if (c.expiryDate.toDate() > now) {
                activeCoupons.push(c);
            }
        });
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

        grid.innerHTML += `
            <div class="product-card ${cardClass}" onclick="openProductDetail(${p.id})">
                ${ribbonHTML}
                <img src="${p.image}" class="product-img" loading="lazy" onerror="this.src='logo.jpg'">
                <div class="product-info">
                    <h3>${name}</h3>
                    <p class="product-desc">${desc}</p>
                    <div style="margin-bottom:10px; min-height:30px;">${variantHtml}</div>
                    <div class="price-row">
                        <span class="price" id="price-${p.id}">₹${displayPrice}</span>
                        <button class="add-btn" onclick="event.stopPropagation(); ${btnAction}">${btnText}</button>
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
    const container = document.getElementById('hamper-options');
    if (!container) return;
    const eligible = products.filter(p => p.price <= 105 && p.in_stock);

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
            if (currentTotal + p.price > 310) {
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
    const names = selectedHamperItems.map(p => p.name).join(' + ');
    cart.push({
        cartId: 'hamper-' + Date.now(),
        productId: 'HAMPER',
        name: 'Gift Box (3 Packs)',
        weight: names,
        price: 250,
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

    let variantHtml = '';
    let initialPrice = p.price;
    let isAvailable = p.in_stock;

    if (p.variants && p.variants.length > 0) {
        const firstActive = p.variants.find(v => v.inStock !== false);
        initialPrice = firstActive ? firstActive.price : p.variants[0].price;
        if (!firstActive) isAvailable = false;

        variantHtml = `<select id="modal-variant-select" class="variant-select" onchange="updateModalPrice(this)">`;
        p.variants.forEach((v, idx) => {
            const stockStatus = (v.inStock !== false);
            const disabledAttr = stockStatus ? '' : 'disabled';
            const label = v.weight + (stockStatus ? '' : ' (Out of Stock)');
            const optionText = `${label} - ₹${v.price}`;
            const selectedAttr = (v.price === initialPrice && stockStatus) ? 'selected' : '';
            variantHtml += `<option value="${idx}" data-price="${v.price}" ${disabledAttr} ${selectedAttr}>${optionText}</option>`;
        });
        variantHtml += `</select>`;
    }

    let btnHtml = `<button class="btn-primary" style="padding:10px 20px;" onclick="addToCartFromModal(${p.id})">Add to Cart</button>`;
    if (!isAvailable) {
        btnHtml = `<button class="btn-primary" style="padding:10px 20px; background:#999; cursor:not-allowed;" disabled>Out of Stock</button>`;
    }

    const html = `
        <img src="${p.image}" class="p-detail-img" onerror="this.src='logo.jpg'">
        <h2>${name}</h2>
        <p class="p-detail-desc">${desc}</p>
        ${variantHtml}
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:15px;">
            <h3 id="modal-price-display" style="color:var(--primary); margin:0;">₹${initialPrice}</h3>
            ${btnHtml}
        </div>`;

    document.getElementById('p-modal-body').innerHTML = html;
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

// --- 9. CART & COUPONS ---
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

    let discountAmount = 0;
    if (appliedDiscount && appliedDiscount.type === 'percent') {
        discountAmount = Math.round(subtotal * (appliedDiscount.value / 100));
    } else if (appliedDiscount && appliedDiscount.type === 'flat') {
        discountAmount = appliedDiscount.value;
    }

    if (discountAmount > subtotal) discountAmount = subtotal;
    const final = subtotal - discountAmount;

    document.getElementById('cart-total').innerHTML = `
        <div style="font-size:0.9rem; color:#666;">Subtotal: ₹${subtotal}</div>
        ${discountAmount > 0 ? `<div style="font-size:0.9rem; color:green;">Coupon (${appliedDiscount.code}): -₹${discountAmount}</div>` : ''}
        <div style="font-size:1.3rem; font-weight:bold; color:var(--primary); margin-top:5px;">₹${final}</div>
    `;

    document.getElementById('cart-count').innerText = count;
}

function changeQty(id, d) {
    const i = cart.find(x => x.cartId === id);
    if (i) { i.qty += d; if (i.qty <= 0) removeFromCart(id); else updateCartUI(); }
}

function removeFromCart(id) { cart = cart.filter(x => x.cartId !== id); updateCartUI(); }
function clearCart() { if (confirm("Clear?")) { cart = []; updateCartUI(); } }
function toggleCart() { document.getElementById('cart-sidebar').classList.toggle('active'); document.querySelector('.cart-overlay').classList.toggle('active'); }

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

function toggleCouponList() {
    const l = document.getElementById('coupon-list');
    l.style.display = l.style.display === 'none' ? 'block' : 'none';
}

function useCoupon(code) {
    document.getElementById('promo-code').value = code;
    applyPromo();
    document.getElementById('coupon-list').style.display = 'none';
}

function applyPromo() {
    const input = document.getElementById('promo-code').value.toUpperCase().trim();
    if (!input) {
        appliedDiscount = { type: 'none', value: 0, code: null };
        document.getElementById('promo-msg').innerText = "";
        updateCartUI();
        return;
    }

    const coupon = activeCoupons.find(c => c.code === input);
    if (coupon) {
        appliedDiscount = { code: coupon.code, type: coupon.type, value: coupon.value };
        document.getElementById('promo-msg').innerText = "Code Applied!";
        document.getElementById('promo-msg').style.color = "green";
    } else {
        appliedDiscount = { type: 'none', value: 0, code: null };
        document.getElementById('promo-msg').innerText = "Invalid or Expired Code";
        document.getElementById('promo-msg').style.color = "red";
    }
    updateCartUI();
}

// --- 10. AUTH & CHECKOUT ---
function validateAndLogin() {
    if (document.getElementById('cust-phone').value.length < 10) { alert("Enter valid phone"); return; }
    googleLogin();
}

function googleLogin() {
    auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()).then(res => {
        db.collection("users").doc(res.user.uid).set({
            name: res.user.displayName, email: res.user.email,
            phone: document.getElementById('cust-phone').value,
            address: document.getElementById('cust-address').value,
            lastLogin: new Date()
        }, { merge: true });
    }).catch(e => alert(e.message));
}

function updateUserUI(loggedIn) {
    if (loggedIn) {
        document.getElementById('login-btn').style.display = 'none';
        document.getElementById('user-profile').style.display = 'block';
        document.getElementById('user-pic').src = currentUser.photoURL;
        document.getElementById('user-name').innerText = currentUser.displayName;
        document.getElementById('btn-login-checkout').style.display = 'none';
        document.getElementById('btn-final-checkout').style.display = 'flex';
    } else {
        document.getElementById('login-btn').style.display = 'block';
        document.getElementById('user-profile').style.display = 'none';
        document.getElementById('btn-login-checkout').style.display = 'flex';
        document.getElementById('btn-final-checkout').style.display = 'none';
    }
}

function logout() { auth.signOut().then(() => location.reload()); }
function toggleProfileMenu() { document.getElementById('profile-menu').classList.toggle('active'); }

async function checkoutWhatsApp() {
    if (cart.length === 0) return alert("Cart empty");
    const phone = document.getElementById('cust-phone').value;
    const address = document.getElementById('cust-address').value;
    if (phone.length < 10 || address.length < 5) return alert("Details needed");

    const orderId = 'ORD-' + Date.now().toString().slice(-6);
    let total = 0;
    cart.forEach(i => { total += i.price * i.qty; });

    let discountAmount = 0;
    if (appliedDiscount.type === 'percent') {
        discountAmount = Math.round(total * (appliedDiscount.value / 100));
    } else if (appliedDiscount.type === 'flat') {
        discountAmount = appliedDiscount.value;
    }
    if (discountAmount > total) discountAmount = total;
    const final = total - discountAmount;

    let msg = `*New Order #${orderId}*\nName: ${currentUser.displayName}\nPhone: ${phone}\nAddr: ${address}\n\n`;
    cart.forEach(i => { msg += `- ${i.name} (${i.weight}) x ${i.qty}\n`; });

    if (discountAmount > 0) {
        msg += `\nSubtotal: ₹${total}`;
        msg += `\nDiscount (${appliedDiscount.code}): -₹${discountAmount}`;
    }
    msg += `\n*Total to Pay: ₹${final}*`;

    await db.collection("orders").add({
        id: orderId, userId: currentUser.uid, userName: currentUser.displayName, userPhone: phone, userAddress: address,
        items: cart, total: final, status: 'Pending', timestamp: new Date(), discount: appliedDiscount
    });
    window.open(`https://wa.me/919826698822?text=${encodeURIComponent(msg)}`, '_blank');
    cart = []; appliedDiscount = { type: 'none', value: 0, code: null }; updateCartUI(); toggleCart();
    document.getElementById('success-total-amount').innerText = '₹' + final;
    document.getElementById('success-modal').style.display = 'flex';
}

// --- 11. HISTORY & HELPERS ---
// --- ORDER HISTORY & INVOICE LOGIC ---

// 1. Enhanced Order History (Fetches & Saves Data)
function showOrderHistory() {
    const modal = document.getElementById('history-modal');
    const content = document.getElementById('history-content');

    modal.classList.add('active');

    if (!currentUser) {
        content.innerHTML = '<p style="padding:20px; text-align:center;">Please login to view your past orders.</p>';
        return;
    }

    content.innerHTML = '<p style="padding:20px; text-align:center;">Loading your tasty history... 🍪</p>';

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

            historyOrders = []; // Store locally for invoice generation
            let html = '';

            snap.forEach(doc => {
                const o = doc.data();
                historyOrders.push(o);

                const date = o.timestamp ? o.timestamp.toDate().toLocaleDateString() : 'N/A';
                let statusColor = '#e67e22'; // Pending
                if (o.status === 'Packed') statusColor = '#3498db';
                if (o.status === 'Delivered') statusColor = '#2ecc71';

                const itemsList = o.items.map(i =>
                    `<div style="display:flex; justify-content:space-between; font-size:0.9rem; color:#555; margin-bottom:4px;">
                        <span>${i.name} x ${i.qty}</span>
                        <span>₹${i.price * i.qty}</span>
                    </div>`
                ).join('');

                html += `
                    <div style="background:white; border:1px solid #eee; border-radius:10px; padding:15px; margin-bottom:15px; box-shadow:0 2px 5px rgba(0,0,0,0.05);">
                        <div style="display:flex; justify-content:space-between; border-bottom:1px dashed #ddd; padding-bottom:8px; margin-bottom:10px;">
                            <div>
                                <strong style="color:#333;">${date}</strong>
                                <div style="font-size:0.75rem; color:#999;">#${o.id}</div>
                            </div>
                            <span style="color:${statusColor}; font-weight:bold; font-size:0.85rem; text-transform:uppercase;">${o.status}</span>
                        </div>
                        <div style="margin-bottom:10px;">${itemsList}</div>
                        <div style="display:flex; justify-content:space-between; border-top:1px dashed #ddd; padding-top:10px; margin-bottom:10px; font-weight:bold; color:#333;">
                            <span>Total</span>
                            <span style="color:var(--primary);">₹${o.total}</span>
                        </div>
                        <div style="display:flex; gap:10px; border-top:1px solid #eee; padding-top:10px;">
                            <button onclick="openInvoice('${o.id}')" style="flex:1; padding:8px; background:white; border:1px solid #e85d04; color:#e85d04; border-radius:5px; cursor:pointer;">
                                <i class="fas fa-file-invoice"></i> Invoice
                            </button>
                            <button onclick="repeatOrder('${o.id}')" style="flex:1; padding:8px; background:#e85d04; color:white; border:none; border-radius:5px; cursor:pointer;">
                                <i class="fas fa-redo"></i> Repeat
                            </button>
                        </div>
                    </div>
                `;
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

// 2. Invoice Logic
function openInvoice(orderId) {
    // Find data in the local variable we just saved
    const order = historyOrders.find(o => o.id === orderId);
    if (!order) return alert("Order details not found.");

    // Populate HTML
    document.getElementById('inv-customer-name').innerText = order.userName;
    document.getElementById('inv-customer-email').innerText = currentUser.email || '-';
    document.getElementById('inv-order-id').innerText = `#${order.id}`;
    document.getElementById('inv-date').innerText = order.timestamp ? new Date(order.timestamp.seconds * 1000).toLocaleDateString() : '-';
    document.getElementById('inv-grand-total').innerText = `₹${order.total}`;

    // Generate QR Code
    const upiLink = `upi://pay?pa=9826698822@paytm&pn=NamoNamkeen&am=${order.total}&cu=INR`;
    document.getElementById('inv-qr-img').src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(upiLink)}`;

    // Populate Items Table
    const tbody = document.getElementById('inv-items-body');
    tbody.innerHTML = '';
    order.items.forEach(i => {
        tbody.innerHTML += `
            <tr>
                <td>${i.name} <br><small>${i.weight}</small></td>
                <td class="text-center">${i.qty}</td>
                <td class="text-right">₹${i.price}</td>
                <td class="text-right">₹${i.price * i.qty}</td>
            </tr>`;
    });

    // Show Modal
    document.getElementById('invoice-modal').style.display = 'flex';
}

function closeInvoice() {
    document.getElementById('invoice-modal').style.display = 'none';
}

function printInvoice() {
    window.print();
}

// 3. Repeat Order Logic
function repeatOrder(orderId) {
    const order = historyOrders.find(o => o.id === orderId);
    if (!order) return;

    if (confirm("Add all items from this order to your cart?")) {
        order.items.forEach(item => {
            const cartId = item.cartId || `${item.productId}-${item.weight.replace(/\s/g, '')}`;
            const existing = cart.find(c => c.cartId === cartId);
            if (existing) {
                existing.qty += item.qty;
            } else {
                cart.push({ ...item, cartId: cartId });
            }
        });
        updateCartUI();
        toggleCart();
        closeHistory();
    }
}

function closeSuccessModal() { document.getElementById('success-modal').style.display = 'none'; }
function openProfileModal() { document.getElementById('profile-modal').style.display = 'flex'; document.getElementById('profile-menu').classList.remove('active'); }
function closeProfileModal() { document.getElementById('profile-modal').style.display = 'none'; }
function saveProfile() { db.collection("users").doc(currentUser.uid).set({ phone: document.getElementById('edit-phone').value, address: document.getElementById('edit-address').value }, { merge: true }).then(() => closeProfileModal()); }
function closeHistory() { document.getElementById('history-modal').classList.remove('active'); }
function playVideo(w) {
    const v = w.querySelector('video');

    // Feature: Pause any other playing videos
    document.querySelectorAll('.video-wrapper.playing video').forEach(otherVid => {
        if (otherVid !== v) {
            otherVid.pause();
            otherVid.closest('.video-wrapper').classList.remove('playing');
        }
    });

    // Toggle current video
    if (v.paused) {
        w.classList.add('playing');
        v.play();
    } else {
        w.classList.remove('playing');
        v.pause();
    }
}
function closeAnnouncement() { document.getElementById('announcement-bar').style.display = 'none'; }
function filterMenu(c) { currentCategory = c; document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active')); event.target.classList.add('active'); renderMenu(); }
function searchMenu() { searchQuery = document.getElementById('menu-search').value; renderMenu(); }
function toggleLanguage() { currentLang = currentLang === 'en' ? 'hi' : 'en'; renderMenu(); updateCartUI(); }
function toggleMobileMenu() { document.getElementById('mobile-nav').classList.toggle('active'); }
function scrollToTop() { window.scrollTo({ top: 0, behavior: 'smooth' }); }

// --- CHECKOUT FLOW ---

// Step 1: Open Payment Modal (Show QR & Total)
function openPaymentModal() {
    if (cart.length === 0) return alert("Cart empty");
    
    const phone = document.getElementById('cust-phone').value;
    const address = document.getElementById('cust-address').value;
    
    // 1. Validate Details
    if (phone.length < 10 || address.length < 5) {
        alert("Please enter a valid Phone Number and Address.");
        return;
    }

    // 2. Calculate Final Amount
    let total = 0;
    cart.forEach(i => { total += i.price * i.qty; });
    
    // Apply Discount Logic
    let discountAmount = 0;
    if (appliedDiscount.type === 'percent') {
        discountAmount = Math.round(total * (appliedDiscount.value / 100));
    } else if (appliedDiscount.type === 'flat') {
        discountAmount = appliedDiscount.value;
    }
    if (discountAmount > total) discountAmount = total;
    const finalAmount = total - discountAmount;

    // 3. Update Success Modal UI
    document.getElementById('success-total-amount').innerText = '₹' + finalAmount;

    // Generate UPI Link (Opens Payment Apps)
    // Format: upi://pay?pa=UPI_ID&pn=NAME&am=AMOUNT&cu=INR
    const upiLink = `upi://pay?pa=9826698822@paytm&pn=NamoNamkeen&am=${finalAmount}&cu=INR`;
    document.getElementById('upi-pay-link').href = upiLink;

    // Generate QR Code Image
    const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(upiLink)}`;
    document.getElementById('success-qr-img').src = qrApiUrl;

    // 4. Show the Modal
    document.getElementById('success-modal').style.display = 'flex';
    
    // Close cart sidebar to focus on modal
    toggleCart();
}

// Step 2: Save to DB & Send WhatsApp (Called by Button in Modal)
async function finalizeOrder() {
    const phone = document.getElementById('cust-phone').value;
    const address = document.getElementById('cust-address').value;
    const orderId = 'ORD-' + Date.now().toString().slice(-6);
    
    let total = 0;
    cart.forEach(i => { total += i.price * i.qty; });

    // Recalculate for record
    let discountAmount = 0;
    if (appliedDiscount.type === 'percent') {
        discountAmount = Math.round(total * (appliedDiscount.value / 100));
    } else if (appliedDiscount.type === 'flat') {
        discountAmount = appliedDiscount.value;
    }
    if (discountAmount > total) discountAmount = total;
    const final = total - discountAmount;

    // Prepare WhatsApp Message
    let msg = `*New Order #${orderId}*\nName: ${currentUser.displayName}\nPhone: ${phone}\nAddr: ${address}\n\n`;
    cart.forEach(i => { msg += `- ${i.name} (${i.weight}) x ${i.qty}\n`; });
    
    if(discountAmount > 0) {
        msg += `\nSubtotal: ₹${total}`;
        msg += `\nDiscount (${appliedDiscount.code}): -₹${discountAmount}`;
    }
    msg += `\n*Total to Pay: ₹${final}*`;

    // Save to Firestore
    await db.collection("orders").add({
        id: orderId, 
        userId: currentUser.uid, 
        userName: currentUser.displayName, 
        userPhone: phone, 
        userAddress: address,
        items: cart, 
        total: final, 
        status: 'Pending', 
        timestamp: new Date(), 
        discount: appliedDiscount
    });

    // Open WhatsApp
    window.open(`https://wa.me/919826698822?text=${encodeURIComponent(msg)}`, '_blank');

    // Cleanup
    cart = []; 
    appliedDiscount = { type: 'none', value: 0, code: null }; 
    updateCartUI(); 
    document.getElementById('success-modal').style.display = 'none';
}

function registerServiceWorker() {
    if ('serviceWorker' in navigator && (window.location.protocol === 'http:' || window.location.protocol === 'https:')) {
        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log("Service Worker Registered"))
            .catch(err => console.log("SW Registration Failed:", err));
    }
}