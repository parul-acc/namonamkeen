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
let discountMultiplier = 1;

// --- 3. INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    fetchData(); // Renamed to generic fetchData
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
        // Filter out any dummy data
        products = products.filter(p => p.id !== 999);
        renderMenu();
        renderHamperOptions();
    }).catch(err => console.error("Products Error:", err));

    // 2. Fetch Announcement (New Logic)
    db.collection("settings").doc("announcement").get().then(doc => {
        if (doc.exists) {
            const data = doc.data();
            // Only show if 'active' is true and text exists
            if (data.active === true && data.text) {
                const bar = document.getElementById('announcement-bar');
                const txt = document.getElementById('announcement-text');
                if (bar && txt) {
                    txt.innerText = data.text;
                    bar.style.display = 'block';
                }
            } else {
                // Hide if inactive
                const bar = document.getElementById('announcement-bar');
                if (bar) bar.style.display = 'none';
            }
        }
    }).catch(err => console.error("Settings Error:", err));
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

        if (p.variants && p.variants.length > 0) {
            displayPrice = p.variants[0].price;
            variantHtml = `<select class="variant-select" id="variant-select-${p.id}" onclick="event.stopPropagation()" onchange="updateCardPrice(${p.id}, this.value)">`;
            p.variants.forEach((v, index) => {
                variantHtml += `<option value="${index}">${v.weight}</option>`;
            });
            variantHtml += `</select>`;
        }

        let btnAction = p.in_stock ? `addToCartFromGrid(${p.id})` : '';
        let btnText = p.in_stock ? (currentLang === 'en' ? 'Add' : 'जोड़ें') : 'Sold Out';
        let cardClass = p.in_stock ? '' : 'sold-out';

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

// --- 6. VARIANT ACTIONS ---
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

// --- 7. HAMPER LOGIC ---
function renderHamperOptions() {
    const container = document.getElementById('hamper-options');
    if (!container) return;
    // Filter items <= 105
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

// --- 8. SNACK FINDER ---
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

// --- 9. MODAL ---
function openProductDetail(id) {
    const p = products.find(x => x.id === id);
    if (!p) return;

    let vHtml = '', iPrice = p.price;
    if (p.variants && p.variants.length > 0) {
        iPrice = p.variants[0].price;
        vHtml = `<select id="modal-variant-select" class="variant-select" onchange="updateModalPrice(this)">`;
        p.variants.forEach((v, idx) => { vHtml += `<option value="${idx}" data-price="${v.price}">${v.weight} - ₹${v.price}</option>`; });
        vHtml += `</select>`;
    }

    const html = `
        <img src="${p.image}" class="p-detail-img" onerror="this.src='logo.jpg'">
        <h2>${p.name}</h2>
        <p class="p-detail-desc">${p.desc || ''}</p>
        ${vHtml}
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:15px;">
            <h3 id="modal-price-display" style="color:var(--primary); margin:0;">₹${iPrice}</h3>
            <button class="btn-primary" style="padding:10px 20px;" onclick="addToCartFromModal(${p.id})">Add to Cart</button>
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

// --- 10. CART ---
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
    let tot = 0, cnt = 0;

    if (cart.length === 0) {
        con.innerHTML = '<p style="text-align:center; padding:20px;">Cart is empty</p>';
        document.getElementById('clear-cart-btn').style.display = 'none';
    } else {
        document.getElementById('clear-cart-btn').style.display = 'flex';
        cart.forEach(i => {
            tot += i.price * i.qty;
            cnt += i.qty;
            con.innerHTML += `
                <div class="cart-item">
                    <img src="${i.image}" onerror="this.src='logo.jpg'">
                    <div class="item-details"><h4>${i.name} <small>(${i.weight})</small></h4><p>₹${i.price} x ${i.qty}</p>
                    <div class="item-controls"><button class="qty-btn" onclick="changeQty('${i.cartId}', -1)">-</button><span>${i.qty}</span><button class="qty-btn" onclick="changeQty('${i.cartId}', 1)">+</button></div></div>
                    <button class="remove-btn" onclick="removeFromCart('${i.cartId}')" style="color:red; border:none; background:none; margin-left:auto;"><i class="fas fa-trash"></i></button>
                </div>`;
        });
    }
    const final = Math.round(tot * discountMultiplier);
    document.getElementById('cart-total').innerText = '₹' + final;
    document.getElementById('cart-count').innerText = cnt;
}

function changeQty(id, d) {
    const i = cart.find(x => x.cartId === id);
    if (i) { i.qty += d; if (i.qty <= 0) removeFromCart(id); else updateCartUI(); }
}

function removeFromCart(id) { cart = cart.filter(x => x.cartId !== id); updateCartUI(); }
function clearCart() { if (confirm("Clear?")) { cart = []; updateCartUI(); } }
function toggleCart() { document.getElementById('cart-sidebar').classList.toggle('active'); document.querySelector('.cart-overlay').classList.toggle('active'); }

// --- 11. EXTRAS ---
function closeAnnouncement() { document.getElementById('announcement-bar').style.display = 'none'; }
function filterMenu(c) { currentCategory = c; document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active')); event.target.classList.add('active'); renderMenu(); }
function searchMenu() { searchQuery = document.getElementById('menu-search').value; renderMenu(); }
function toggleLanguage() { currentLang = currentLang === 'en' ? 'hi' : 'en'; renderMenu(); updateCartUI(); }
function toggleMobileMenu() { document.getElementById('mobile-nav').classList.toggle('active'); }
function scrollToTop() { window.scrollTo({ top: 0, behavior: 'smooth' }); }

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
    let msg = `*New Order #${orderId}*\nName: ${currentUser.displayName}\nPhone: ${phone}\nAddr: ${address}\n\n`;
    cart.forEach(i => { total += i.price * i.qty; msg += `- ${i.name} (${i.weight}) x ${i.qty}\n`; });
    const final = Math.round(total * discountMultiplier);
    msg += `\n*Total: ₹${final}*`;

    await db.collection("orders").add({
        id: orderId, userId: currentUser.uid, userName: currentUser.displayName, userPhone: phone, userAddress: address,
        items: cart, total: final, status: 'Pending', timestamp: new Date()
    });
    window.open(`https://wa.me/919826698822?text=${encodeURIComponent(msg)}`, '_blank');
    cart = []; updateCartUI(); toggleCart();
    document.getElementById('success-total-amount').innerText = '₹' + final;
    document.getElementById('success-modal').style.display = 'flex';
}

function closeSuccessModal() { document.getElementById('success-modal').style.display = 'none'; }
function toggleCouponList() { const l = document.getElementById('coupon-list'); l.style.display = l.style.display === 'none' ? 'block' : 'none'; }
function useCoupon(c) { document.getElementById('promo-code').value = c; applyPromo(); toggleCouponList(); }
function applyPromo() { const c = document.getElementById('promo-code').value.toUpperCase(); if (c === 'NAMO10') { discountMultiplier = 0.9; } else { discountMultiplier = 1; alert("Invalid Code"); } updateCartUI(); }
function openProfileModal() { document.getElementById('profile-modal').style.display = 'flex'; document.getElementById('profile-menu').classList.remove('active'); }
function closeProfileModal() { document.getElementById('profile-modal').style.display = 'none'; }
function saveProfile() { db.collection("users").doc(currentUser.uid).set({ phone: document.getElementById('edit-phone').value, address: document.getElementById('edit-address').value }, { merge: true }).then(() => closeProfileModal()); }
function showOrderHistory() { document.getElementById('history-modal').classList.add('active'); }
function closeHistory() { document.getElementById('history-modal').classList.remove('active'); }
function playVideo(w) { const v = w.querySelector('video'); if (v.paused) { w.classList.add('playing'); v.play(); } else { v.pause(); } }

function registerServiceWorker() {
    // Only register if supported AND running on http/https (not file://)
    if ('serviceWorker' in navigator && (window.location.protocol === 'http:' || window.location.protocol === 'https:')) {
        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log("Service Worker Registered"))
            .catch(err => console.log("SW Registration Failed:", err));
    }
}