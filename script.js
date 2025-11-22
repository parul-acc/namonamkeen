// --- 1. CONFIGURATION ---

// 1. Your Google Sheet CSV Link
const RAW_SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRTzLvn_dqN55WIaUHU8ytqM2Y2gXTZA4_29iYAdkh_uDmT4EgplKxJ4JimuoQJ5GugKxCq2v87cQGp/pub?output=csv';

// 2. PROXY (CodeTabs)
// Added '&t=' + Date.now() to force fresh data every time
const SHEET_URL = `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(RAW_SHEET_URL)}&t=${Date.now()}`;
// --- 2. STATE VARIABLES ---
let products = [];
let cart = [];
let currentLang = 'en';
let currentCategory = 'all';
let searchQuery = '';
let selectedHamperItems = [];
let globalAnnouncement = null; // Store announcement data globally

// --- 3. INITIALIZATION ---
// --- 3. INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    const grid = document.getElementById('menu-grid');
    
    // NEW: Inject 4 Skeleton Cards instead of text
    if(grid) {
        grid.innerHTML = ''; // Clear
        for(let i=0; i<4; i++) {
            grid.innerHTML += `
                <div class="skeleton-card">
                    <div class="skeleton skeleton-img"></div>
                    <div class="skeleton-info">
                        <div class="skeleton skeleton-text"></div>
                        <div class="skeleton skeleton-text-sm"></div>
                        <div class="skeleton skeleton-btn"></div>
                    </div>
                </div>
            `;
        }
    }
    
    fetchProductsFromSheet();
    registerServiceWorker();
    checkStoreStatus();
});

// --- 4. DATA FETCHING ---
async function fetchProductsFromSheet() {
    try {
        const response = await fetch(SHEET_URL);
        const data = await response.text();

        // Parse the CSV
        const allData = csvToJSON(data);

        // 1. Find Announcement (ID 999)
        // Using '==' to allow string "999" or number 999
        globalAnnouncement = allData.find(p => p.id == 999);

        if (globalAnnouncement) {
            console.log("Announcement Found:", globalAnnouncement);
            updateAnnouncementUI(); // Show it immediately
        } else {
            console.log("No Announcement (ID 999) found in Sheet.");
        }

        // 2. Filter Products (Exclude 999 and bad rows)
        products = allData.filter(p => p.id && p.name && p.id != 999);

        console.log("Menu Loaded:", products);
        renderMenu();
        renderHamperOptions();

    } catch (error) {
        console.error("Error loading menu:", error);
        const grid = document.getElementById('menu-grid');
        if (grid) grid.innerHTML = '<p style="text-align:center; width:100%;">Menu loading... (If this takes long, refresh)</p>';

        // Retry logic
        setTimeout(() => renderMenu(), 2000);
    }
}

// --- ANNOUNCEMENT LOGIC (New & Fixed) ---
function updateAnnouncementUI() {
    const bar = document.getElementById('announcement-bar');
    const textElem = document.getElementById('announcement-text');

    if (!globalAnnouncement || !bar || !textElem) return;

    // Logic: Show if in_stock is TRUE AND user hasn't closed it
    if (globalAnnouncement.in_stock === true) {
        if (!sessionStorage.getItem('announcementClosed')) {

            // Select text based on current language
            const msg = currentLang === 'en' ? globalAnnouncement.name : (globalAnnouncement.nameHi || globalAnnouncement.name);

            textElem.innerText = msg;
            bar.style.display = 'block';
        } else {
            bar.style.display = 'none'; // Hidden because user closed it
        }
    } else {
        bar.style.display = 'none'; // Hidden because in_stock is FALSE
    }
}

function closeAnnouncement() {
    const bar = document.getElementById('announcement-bar');
    if (bar) {
        bar.style.display = 'none';
        sessionStorage.setItem('announcementClosed', 'true');
    }
}

// --- CSV PARSER ---
function csvToJSON(csvText) {
    const lines = csvText.split("\n");
    const result = [];
    const headers = lines[0].split(",").map(h => h.trim());

    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;

        const obj = {};
        // Robust Regex to handle commas inside quotes
        const currentline = lines[i].match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || lines[i].split(",");

        headers.forEach((header, j) => {
            let val = currentline[j] ? currentline[j].replace(/['"]+/g, '').trim() : '';

            if (header === 'id') val = parseInt(val);
            if (header === 'price') val = parseInt(val) || 0;

            // Boolean Logic for "TRUE" / "FALSE"
            if (header === 'bestseller' || header === 'in_stock') {
                val = (val.toUpperCase().trim() === 'TRUE');
            }

            if (header === 'tags') val = val ? val.split('|') : [];
            obj[header] = val;
        });
        result.push(obj);
    }
    return result;
}

// --- 5. RENDER MENU ---
function renderMenu() {
    const grid = document.getElementById('menu-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const filtered = products.filter(p => {
        const pName = p.name ? p.name.toString().toLowerCase() : '';
        const pNameHi = p.nameHi ? p.nameHi.toString() : '';
        const search = searchQuery.toLowerCase();

        const matchesCategory = currentCategory === 'all' || p.category === currentCategory;
        const matchesSearch = pName.includes(search) || pNameHi.includes(search);

        return matchesCategory && matchesSearch;
    });

    if (filtered.length === 0) {
        grid.innerHTML = '<p style="text-align:center; width:100%; grid-column:1/-1;">No snacks found!</p>';
        return;
    }

    filtered.forEach(product => {
        const displayName = currentLang === 'en' ? product.name : (product.nameHi || product.name);
        const displayDesc = currentLang === 'en' ? product.desc : (product.descHi || product.desc);
        let btnText = currentLang === 'en' ? "Add" : "जोड़ें";
        const ribbonText = currentLang === 'en' ? "Bestseller" : "बेस्टसेलर";
        const ribbonHTML = product.bestseller ? `<div class="ribbon">${ribbonText}</div>` : '';

        let tagsHTML = '<div class="badge-container">';
        if (product.tags) {
            if (product.tags.includes('jain')) tagsHTML += '<span class="diet-badge badge-jain">Jain</span>';
            if (product.tags.includes('upwas')) tagsHTML += '<span class="diet-badge badge-upwas">Upwas</span>';
            if (product.tags.includes('vegan')) tagsHTML += '<span class="diet-badge badge-vegan">Vegan</span>';
        }
        tagsHTML += '</div>';

        let soldOutClass = '';
        let soldOutOverlay = '';
        let onClickAction = `onclick="addToCart(${product.id})"`;

        if (product.in_stock === false) {
            soldOutClass = 'sold-out';
            soldOutOverlay = '<div class="sold-out-overlay"><div class="sold-out-badge">SOLD OUT</div></div>';
            btnText = "Sold Out";
            onClickAction = '';
        }

        const card = document.createElement('div');
        card.className = `product-card ${soldOutClass}`;
        card.innerHTML = `
            ${ribbonHTML}
            ${soldOutOverlay}
<img src="${product.image}" 
     loading="lazy" 
     width="100%" 
     height="200" 
     alt="${displayName}" 
     class="product-img" 
     onerror="this.src='logo.jpg'">
           
            <div class="product-info">
                ${tagsHTML}
                <h3>${displayName}</h3>
                <p class="product-desc">${displayDesc}</p>
                <div class="price-row">
                    <span class="price">₹${product.price}</span>
                    <button class="share-btn" onclick="shareProduct('${displayName}', '${product.image}')" style="background:none; border:none; color:var(--primary); cursor:pointer; margin-right:10px; font-size:1.2rem;">
                        <i class="fas fa-share-alt"></i>
                    </button>
                    <button class="add-btn" ${onClickAction}>
                        ${product.in_stock ? '<i class="fas fa-plus"></i>' : ''} ${btnText}
                    </button>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
}

function filterMenu(cat) {
    currentCategory = cat;
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.innerText.toLowerCase().includes(cat) || (cat === 'all' && btn.innerText === 'All')) btn.classList.add('active');
    });
    renderMenu();
}

function searchMenu() {
    searchQuery = document.getElementById('menu-search').value;
    renderMenu();
}

function toggleLanguage() {
    currentLang = currentLang === 'en' ? 'hi' : 'en';

    // Update Static Text
    document.querySelectorAll('[data-en]').forEach(el => {
        el.innerText = el.getAttribute(`data-${currentLang}`);
    });

    // Update Menu
    renderMenu();

    // Update Cart
    updateCartUI();

    // NEW: Update Announcement Bar Text
    updateAnnouncementUI();

    // Update Store Status
    checkStoreStatus();
}

// --- STORE STATUS (Open/Closed) ---
function checkStoreStatus() {
    const now = new Date();
    const hour = now.getHours();
    const statusDiv = document.getElementById('store-status');
    const statusText = document.getElementById('status-text');
    if (!statusDiv || !statusText) return;

    // Open 9 AM to 9 PM
    const isOpen = hour >= 9 && hour < 21;

    if (isOpen) {
        statusDiv.className = 'store-status open';
        statusText.innerText = currentLang === 'en' ? 'Open' : 'खुला है';
    } else {
        statusDiv.className = 'store-status closed';
        statusText.innerText = currentLang === 'en' ? 'Closed' : 'बंद है';
    }
}

// --- UTILS (Share, Hamper, Cart, etc.) ---
function shareProduct(name, image) {
    if (navigator.share) {
        navigator.share({
            title: 'Namo Namkeen',
            text: `Check out this delicious ${name} from Namo Namkeen!`,
            url: window.location.href
        }).catch(console.error);
    } else {
        alert("Link copied to clipboard!");
    }
}

function renderHamperOptions() {
    const container = document.getElementById('hamper-options');
    if (!container) return;

    const eligibleProducts = products.filter(p => p.price <= 100 && p.in_stock === true);
    container.innerHTML = '';

    eligibleProducts.forEach(p => {
        const div = document.createElement('div');
        div.className = 'hamper-option';
        div.onclick = () => toggleHamperItem(p.id, div);
        div.innerHTML = `<img src="${p.image}" alt="${p.name}"><h4>${p.name}</h4>`;
        container.appendChild(div);
    });
}

function toggleHamperItem(id, element) {
    const product = products.find(p => p.id === id);
    if (selectedHamperItems.includes(product.name)) {
        selectedHamperItems = selectedHamperItems.filter(name => name !== product.name);
        element.classList.remove('selected');
    } else {
        if (selectedHamperItems.length < 3) {
            selectedHamperItems.push(product.name);
            element.classList.add('selected');
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
            btn.innerHTML = `Add Box to Cart - ₹250`;
        } else {
            btn.classList.add('disabled');
            btn.innerHTML = `Select ${3 - selectedHamperItems.length} more`;
        }
    }
}

function addHamperToCart() {
    if (selectedHamperItems.length !== 3) return;
    cart.push({
        id: 'hamper-' + Date.now(),
        name: `Gift Box (${selectedHamperItems.join(', ')})`,
        nameHi: `गिफ्ट बॉक्स (${selectedHamperItems.join(', ')})`,
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

function addToCart(id) {
    const product = products.find(p => p.id === id);
    const existing = cart.find(item => item.id === id);
    if (existing) existing.qty++;
    else cart.push({ ...product, qty: 1 });
    updateCartUI();
    if (!document.getElementById('cart-sidebar').classList.contains('active')) toggleCart();
}

// --- FIXED: REMOVE FROM CART ---
function removeFromCart(id) {
    // We use loose inequality (!=) to ensure "1" (text) matches 1 (number)
    cart = cart.filter(item => item.id != id);
    updateCartUI();

    // If cart is empty, close sidebar automatically (Optional UI polish)
    if (cart.length === 0) {
        const sidebar = document.getElementById('cart-sidebar');
        if (sidebar) sidebar.classList.remove('active');
        const overlay = document.querySelector('.cart-overlay');
        if (overlay) overlay.classList.remove('active');
    }
}

function changeQty(id, change) {
    // Use loose equality (==) to find the item
    const item = cart.find(i => i.id == id);
    if (item) {
        item.qty += change;
        if (item.qty <= 0) removeFromCart(id);
        else updateCartUI();
    }
}

function clearCart() {
    if (confirm("Clear cart?")) { cart = []; updateCartUI(); }
}

function updateCartUI() {
    const container = document.getElementById('cart-items');
    const totalElem = document.getElementById('cart-total');
    const countElem = document.getElementById('cart-count');
    const clearBtn = document.getElementById('clear-cart-btn');

    if (countElem) countElem.innerText = cart.reduce((sum, item) => sum + item.qty, 0);

    const total = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    if (totalElem) totalElem.innerText = '₹' + total;
    if (clearBtn) clearBtn.style.display = cart.length > 0 ? 'flex' : 'none';

    if (container) {
        container.innerHTML = '';
        if (cart.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding:20px; color:#999;">Cart is empty.</div>';
            return;
        }

        cart.forEach(item => {
            const name = currentLang === 'en' ? item.name : (item.nameHi || item.name);
            const div = document.createElement('div');
            div.className = 'cart-item';
            div.innerHTML = `
                <img src="${item.image}" alt="${name}">
                <div class="item-details">
                    <h4>${name}</h4>
                    <p>₹${item.price} x ${item.qty}</p>
                    <div class="item-controls">
                        <button class="qty-btn" onclick="changeQty('${item.id}', -1)">-</button>
                        <span>${item.qty}</span>
                        <button class="qty-btn" onclick="changeQty('${item.id}', 1)">+</button>
                    </div>
                </div>
                <button class="remove-btn" onclick="removeFromCart('${item.id}')" style="background:none; border:none; color:red; margin-left:auto;"><i class="fas fa-trash"></i></button>
            `;
            container.appendChild(div);
        });
    }
}

// --- CHECKOUT WHATSAPP ---
function checkoutWhatsApp() {
    if (cart.length === 0) {
        alert("Please add items to your cart first!");
        return;
    }

    if (typeof triggerConfetti === "function") {
        triggerConfetti();
    }

    const ICON_CART = String.fromCodePoint(0x1F6D2);
    const ICON_CALENDAR = String.fromCodePoint(0x1F4C5);
    const ICON_CLOCK = String.fromCodePoint(0x23F0);
    const ICON_MONEY = String.fromCodePoint(0x1F4B0);
    const ICON_MEMO = String.fromCodePoint(0x1F4DD);
    const ICON_PIN = String.fromCodePoint(0x1F4CD);

    const now = new Date();
    const dateStr = now.toLocaleDateString('en-IN');
    const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

    let msg = `*${ICON_CART} NEW ORDER - NAMO NAMKEEN*\n`;
    msg += `${ICON_CALENDAR} Date: ${dateStr} | ${ICON_CLOCK} Time: ${timeStr}\n`;
    msg += `---------------------------------\n`;
    msg += `*Order Details:*\n`;

    let total = 0;

    cart.forEach((item, index) => {
        const itemTotal = item.price * item.qty;
        total += itemTotal;
        msg += `${index + 1}. *${item.name}*\n`;
        msg += `    Qty: ${item.qty} x ₹${item.price} = ₹${itemTotal}\n`;
    });

    msg += `---------------------------------\n`;
    msg += `*${ICON_MONEY} GRAND TOTAL: ₹${total}*\n`;
    msg += `---------------------------------\n`;
    msg += `${ICON_MEMO} *Customer Note:* (Type here)\n`;
    msg += `${ICON_PIN} *Delivery Address:* (Type here)\n\n`;
    msg += `_Please confirm availability and send payment QR code._`;

    setTimeout(() => {
        const phone = "919826698822";
        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
    }, 800);
}

function triggerConfetti() {
    var duration = 3 * 1000;
    var animationEnd = Date.now() + duration;
    var defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 3000 };
    function randomInOut(min, max) { return Math.random() * (max - min) + min; }
    var interval = setInterval(function () {
        var timeLeft = animationEnd - Date.now();
        if (timeLeft <= 0) return clearInterval(interval);
        var particleCount = 50 * (timeLeft / duration);
        confetti(Object.assign({}, defaults, { particleCount, origin: { x: randomInOut(0.1, 0.3), y: Math.random() - 0.2 } }));
        confetti(Object.assign({}, defaults, { particleCount, origin: { x: randomInOut(0.7, 0.9), y: Math.random() - 0.2 } }));
    }, 250);
}

function toggleMobileMenu() {
    const nav = document.getElementById('mobile-nav');
    if (nav) nav.classList.toggle('active');
}
function toggleCart() {
    const sb = document.getElementById('cart-sidebar');
    const ov = document.querySelector('.cart-overlay');
    if (sb) sb.classList.toggle('active');
    if (ov) ov.classList.toggle('active');
}
function playVideo(wrapper) {
    const video = wrapper.querySelector('video');
    if (video.paused) { wrapper.classList.add('playing'); video.setAttribute('controls', 'true'); video.play(); }
    else { video.pause(); }
}
function openQuiz() { document.getElementById('quiz-modal').style.display = 'flex'; startQuiz(); }
function closeQuiz() { document.getElementById('quiz-modal').style.display = 'none'; }
function startQuiz() {
    document.getElementById('quiz-content').innerHTML = `
        <div class="quiz-question"><h3>Spicy or Sweet?</h3><div class="quiz-options">
            <button class="quiz-btn" onclick="quizStep2('spicy')">Spicy</button>
            <button class="quiz-btn" onclick="quizStep2('sweet')">Sweet</button>
        </div></div>`;
}
function quizStep2(pref) {
    const html = pref === 'spicy' ?
        `<h3>Sev or Nuts?</h3><div class="quiz-options"><button class="quiz-btn" onclick="showResult(1)">Sev</button><button class="quiz-btn" onclick="showResult(3)">Nuts</button></div>` :
        `<h3>Fried or Dry?</h3><div class="quiz-options"><button class="quiz-btn" onclick="showResult(7)">Fried</button><button class="quiz-btn" onclick="showResult(11)">Dry</button></div>`;
    document.getElementById('quiz-content').innerHTML = html;
}
function showResult(id) {
    const p = products.find(p => p.id == id);
    if (p) {
        document.getElementById('quiz-content').innerHTML = `
            <h3>Try This!</h3><img src="${p.image}" class="result-img"><p>${p.name}</p>
            <button class="btn-primary" onclick="addToCart(${p.id}); closeQuiz();">Add - ₹${p.price}</button>`;
    }
}
function registerServiceWorker() {
    if ('serviceWorker' in navigator && window.location.protocol !== 'file:') {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('sw.js')
                .then(reg => console.log('SW Registered!', reg))
                .catch(err => console.log('SW Failed', err));
        });
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            const btn = document.getElementById('install-btn');
            if (btn) {
                btn.style.display = 'block';
                btn.onclick = () => { e.prompt(); };
            }
        });
    }
}

// --- SCROLL TO TOP LOGIC ---
// Show button when user scrolls down 300px
window.onscroll = function () { scrollFunction() };

function scrollFunction() {
    const btn = document.getElementById("scrollTopBtn");
    if (document.body.scrollTop > 300 || document.documentElement.scrollTop > 300) {
        if (btn) btn.style.display = "flex";
    } else {
        if (btn) btn.style.display = "none";
    }
}

function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}