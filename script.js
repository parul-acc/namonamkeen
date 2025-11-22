// --- 1. CONFIGURATION ---
const RAW_SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRTzLvn_dqN55WIaUHU8ytqM2Y2gXTZA4_29iYAdkh_uDmT4EgplKxJ4JimuoQJ5GugKxCq2v87cQGp/pub?output=csv';
const SHEET_URL = `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(RAW_SHEET_URL)}&t=${Date.now()}`;

// --- FIREBASE CONFIG (KEEP YOUR KEYS) ---
// Note: Ensure you have your correct keys here from previous steps
const firebaseConfig = {
  apiKey: "AIzaSyB-Ep3yEAzFBlqOVGOxhjbmjwlSH0Xx5qU",
  authDomain: "namo-namkeen-app.firebaseapp.com",
  projectId: "namo-namkeen-app",
  storageBucket: "namo-namkeen-app.firebasestorage.app",
  messagingSenderId: "154786466552",
  appId: "1:154786466552:web:9be55b7b599806f536490d",
  measurementId: "G-8HJJ8YW1YH"
};

if (typeof firebase !== 'undefined') {
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    var auth = firebase.auth();
    var db = firebase.firestore();
} else {
    console.error("Firebase SDK not loaded.");
}

// --- 2. STATE VARIABLES ---
let products = [];
let cart = [];
let currentUser = null;      
let currentLang = 'en';      
let currentCategory = 'all'; 
let searchQuery = '';        
let selectedHamperItems = [];
let globalAnnouncement = null;
let pastOrders = []; // NEW: Store fetched orders here

// --- 3. INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    const grid = document.getElementById('menu-grid');
    if(grid) {
        grid.innerHTML = ''; 
        for(let i=0; i<4; i++) {
            grid.innerHTML += `<div class="skeleton-card"><div class="skeleton skeleton-img"></div><div class="skeleton-info"><div class="skeleton skeleton-text"></div><div class="skeleton skeleton-text-sm"></div><div class="skeleton skeleton-btn"></div></div></div>`;
        }
    }
    fetchProductsFromSheet();
    registerServiceWorker();
    checkStoreStatus();
    if (typeof auth !== 'undefined') {
        auth.onAuthStateChanged(user => {
            if (user) { currentUser = user; updateUserUI(true); } 
            else { currentUser = null; updateUserUI(false); }
        });
    }
});

// --- 4. DATA FETCHING ---
async function fetchProductsFromSheet() {
    try {
        const response = await fetch(SHEET_URL);
        const data = await response.text();
        const allData = csvToJSON(data);
        
        // 1. Announcement Logic
        // Loose check (==) handles string '999' vs number 999
        globalAnnouncement = allData.find(p => p.id == 999);
        
        // Debugging Log: Check your console to see what the code sees!
        if(globalAnnouncement) {
            console.log("Announcement Data:", globalAnnouncement);
            updateAnnouncementUI();
        } else {
            console.log("No Announcement Found (ID 999 missing)");
        }

        // 2. Filter Products
        products = allData.filter(p => p.id && p.name && p.id != 999); 

        console.log("Menu Loaded:", products);
        renderMenu();
        renderHamperOptions();

    } catch (error) {
        console.error("Error loading menu:", error);
        const grid = document.getElementById('menu-grid');
        if(grid) grid.innerHTML = '<p style="text-align:center; width:100%;">Menu loading... (If this takes long, refresh)</p>';
        setTimeout(() => renderMenu(), 2000);
    }
}

// --- ROBUST CSV PARSER ---
function csvToJSON(csvText) {
    // Split by newline
    const lines = csvText.split(/\r\n|\n/);
    const result = [];
    const headers = lines[0].split(",").map(h => h.trim());

    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        
        const obj = {};
        // Regex to handle commas inside quotes
        const currentline = lines[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);

        headers.forEach((header, j) => {
            // remove quotes and TRIM whitespace/newlines aggressively
            let val = currentline[j] ? currentline[j].replace(/^"|"$/g, '').trim() : '';
            
            if (header === 'id') val = parseInt(val);
            if (header === 'price') val = parseInt(val) || 0;
            
            // Boolean Logic: Check specifically for the string "TRUE"
            if (header === 'bestseller' || header === 'in_stock') {
                val = (val.toUpperCase() === 'TRUE');
            }
            
            if (header === 'tags') val = val ? val.split('|') : [];
            obj[header] = val;
        });
        result.push(obj);
    }
    return result;
}

// --- ANNOUNCEMENT ---
function updateAnnouncementUI() {
    const bar = document.getElementById('announcement-bar');
    const textElem = document.getElementById('announcement-text');
    if (!globalAnnouncement || !bar || !textElem) return;

    if (globalAnnouncement.in_stock === true) {
        // Only show if user has NOT closed it previously
        if (!sessionStorage.getItem('announcementClosed')) {
            const msg = currentLang === 'en' ? globalAnnouncement.name : (globalAnnouncement.nameHi || globalAnnouncement.name);
            textElem.innerText = msg;
            bar.style.display = 'block';
        } else { 
            console.log("Announcement hidden by user preference (sessionStorage)");
            bar.style.display = 'none'; 
        }
    } else { 
        console.log("Announcement hidden: in_stock is FALSE");
        bar.style.display = 'none'; 
    }
}

function closeAnnouncement() {
    const bar = document.getElementById('announcement-bar');
    if(bar) {
        bar.style.display = 'none';
        sessionStorage.setItem('announcementClosed', 'true');
    }
}

// --- RENDER MENU (With Lazy Loading) ---
function renderMenu() {
    const grid = document.getElementById('menu-grid');
    if(!grid) return;
    grid.innerHTML = ''; 

    const filtered = products.filter(p => {
        const pName = p.name ? p.name.toString().toLowerCase() : '';
        const pNameHi = p.nameHi ? p.nameHi.toString() : '';
        const search = searchQuery.toLowerCase();
        const matchesCategory = currentCategory === 'all' || p.category === currentCategory;
        const matchesSearch = pName.includes(search) || pNameHi.includes(search);
        return matchesCategory && matchesSearch;
    });

    if(filtered.length === 0) {
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
        if(product.tags) {
            if(product.tags.includes('jain')) tagsHTML += '<span class="diet-badge badge-jain">Jain</span>';
            if(product.tags.includes('upwas')) tagsHTML += '<span class="diet-badge badge-upwas">Upwas</span>';
            if(product.tags.includes('vegan')) tagsHTML += '<span class="diet-badge badge-vegan">Vegan</span>';
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
                 width="100%" height="200" 
                 alt="${displayName}" 
                 class="product-img" 
                 onerror="this.src='logo.jpg'">
            <div class="product-info">
                ${tagsHTML}
                <h3>${displayName}</h3>
                <p class="product-desc">${displayDesc}</p>
                <div class="price-row">
                    <span class="price">₹${product.price}</span>
                    <button class="share-btn" onclick="shareProduct('${displayName}', '${product.image}')" style="background:none; border:none; color:var(--primary); cursor:pointer; margin-right:10px; font-size:1.2rem;"><i class="fas fa-share-alt"></i></button>
                    <button class="add-btn" ${onClickAction}>${product.in_stock ? '<i class="fas fa-plus"></i>' : ''} ${btnText}</button>
                </div>
            </div>`;
        grid.appendChild(card);
    });
}

// --- UTILS & LOGIC ---
function filterMenu(cat) {
    currentCategory = cat;
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.innerText.toLowerCase().includes(cat) || (cat === 'all' && btn.innerText === 'All')) btn.classList.add('active');
    });
    renderMenu();
}
function searchMenu() { searchQuery = document.getElementById('menu-search').value; renderMenu(); }
function toggleLanguage() {
    currentLang = currentLang === 'en' ? 'hi' : 'en';
    document.querySelectorAll('[data-en]').forEach(el => el.innerText = el.getAttribute(`data-${currentLang}`));
    renderMenu(); updateCartUI(); updateAnnouncementUI(); checkStoreStatus();
}
function googleLogin() {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).then((result) => saveUserToDB(result.user)).catch((error) => alert("Login failed: " + error.message));
}
function logout() { auth.signOut().then(() => window.location.reload()); }
function saveUserToDB(user) { db.collection("users").doc(user.uid).set({ name: user.displayName, email: user.email, lastLogin: new Date() }, { merge: true }); }
function updateUserUI(isLoggedIn) {
    const btn = document.getElementById('login-btn');
    const profile = document.getElementById('user-profile');
    if (isLoggedIn) {
        btn.style.display = 'none'; profile.style.display = 'block';
        document.getElementById('user-pic').src = currentUser.photoURL;
        document.getElementById('user-name').innerText = currentUser.displayName;
    } else { btn.style.display = 'block'; profile.style.display = 'none'; }
}
function toggleProfileMenu() { document.getElementById('profile-menu').classList.toggle('active'); }
function showOrderHistory() {
    document.getElementById('profile-menu').classList.remove('active');
    document.getElementById('history-modal').classList.add('active');
    const container = document.getElementById('history-content');
    if (!currentUser) return;
    container.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';
    db.collection("orders").where("userId", "==", currentUser.uid).orderBy("timestamp", "desc").get().then((querySnapshot) => {
        container.innerHTML = '';
        if (querySnapshot.empty) { container.innerHTML = '<p style="padding:20px;">No past orders found.</p>'; return; }
        querySnapshot.forEach((doc) => {
            const order = doc.data();
            const date = order.timestamp ? order.timestamp.toDate().toDateString() : 'Date N/A';
            let itemsHtml = ''; order.items.forEach(i => itemsHtml += `<div>${i.name} x ${i.qty}</div>`);
            container.innerHTML += `<div class="history-card"><div class="history-date">${date}</div><div>${itemsHtml}</div><span class="history-total">Total: ₹${order.total}</span></div>`;
        });
    });
}

// --- ORDER HISTORY & INVOICE LOGIC ---

function showOrderHistory() {
    document.getElementById('profile-menu').classList.remove('active');
    document.getElementById('history-modal').classList.add('active');
    const container = document.getElementById('history-content');
    
    if (!currentUser) return;
    container.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';

    db.collection("orders")
      .where("userId", "==", currentUser.uid)
      .orderBy("timestamp", "desc")
      .get()
      .then((querySnapshot) => {
          container.innerHTML = '';
          pastOrders = []; // Reset local storage

          if (querySnapshot.empty) {
              container.innerHTML = '<p style="padding:20px;">No past orders found.</p>';
              return;
          }
          
          querySnapshot.forEach((doc) => {
              const order = doc.data();
              order.id = doc.id; // Save Firestore ID
              pastOrders.push(order); // Save to array for invoice retrieval

              const date = order.timestamp ? order.timestamp.toDate().toDateString() : 'Date N/A';
              
              // Summary Text
              const summary = `${order.items.length} items`;

              container.innerHTML += `
                <div class="history-card" style="display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <div class="history-date">${date}</div>
                        <div style="font-weight:bold;">${summary}</div>
                        <span class="history-total">Total: ₹${order.total}</span>
                    </div>
                    <button onclick="openInvoice('${order.id}')" class="btn-secondary" style="padding:5px 15px; font-size:0.8rem;">
                        <i class="fas fa-file-invoice"></i> View Bill
                    </button>
                </div>`;
          });
      })
      .catch((error) => {
          console.error("History Error:", error);
          container.innerHTML = '<p style="padding:20px; color:red;">Need Index: Check Console (F12)</p>';
      });
}

function openInvoice(orderId) {
    const order = pastOrders.find(o => o.id === orderId);
    if(!order) return;

    // 1. THE FIX: Add a "printing-invoice" tag to the body
    document.body.classList.add('printing-invoice'); 

    // 2. Populate Data (Existing code)
    document.getElementById('inv-order-id').innerText = "#" + order.id.slice(0, 8).toUpperCase();
    document.getElementById('inv-date').innerText = order.timestamp ? order.timestamp.toDate().toLocaleDateString() : 'N/A';
    document.getElementById('inv-customer-name').innerText = order.userName || "Customer";
    document.getElementById('inv-customer-email').innerText = order.userEmail || currentUser.email || ""; // Added userEmail fallback
    document.getElementById('inv-grand-total').innerText = "₹" + order.total;

    const tbody = document.getElementById('inv-items-body');
    tbody.innerHTML = '';
    
    order.items.forEach(item => {
        const itemTotal = item.price * item.qty;
        tbody.innerHTML += `
            <tr>
                <td>${item.name}</td>
                <td class="text-center">${item.qty}</td>
                <td class="text-right">₹${item.price}</td>
                <td class="text-right">₹${itemTotal}</td>
            </tr>
        `;
    });

    document.getElementById('invoice-modal').classList.add('active');
}

function closeInvoice() {
    // THE FIX: Remove the tag
    document.body.classList.remove('printing-invoice');
    document.getElementById('invoice-modal').classList.remove('active');
}

function printInvoice() {
    window.print();
}

function printInvoice() {
    window.print();
}

function closeHistory() { document.getElementById('history-modal').classList.remove('active'); }
function addToCart(id) {
    const product = products.find(p => p.id === id);
    const existing = cart.find(item => item.id === id);
    if (existing) existing.qty++; else cart.push({ ...product, qty: 1 });
    updateCartUI(); if (!document.getElementById('cart-sidebar').classList.contains('active')) toggleCart();
}
function removeFromCart(id) {
    cart = cart.filter(item => item.id != id);
    updateCartUI();
    if (cart.length === 0) { document.getElementById('cart-sidebar').classList.remove('active'); document.querySelector('.cart-overlay').classList.remove('active'); }
}
function changeQty(id, change) {
    const item = cart.find(i => i.id == id);
    if (item) { item.qty += change; if (item.qty <= 0) removeFromCart(id); else updateCartUI(); }
}
function clearCart() { if (confirm("Clear cart?")) { cart = []; updateCartUI(); } }
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
        if (cart.length === 0) { container.innerHTML = '<div style="text-align:center; padding:20px; color:#999;">Cart is empty.</div>'; return; }
        cart.forEach(item => {
            const name = currentLang === 'en' ? item.name : (item.nameHi || item.name);
            container.innerHTML += `<div class="cart-item"><img src="${item.image}" alt="${name}"><div class="item-details"><h4>${name}</h4><p>₹${item.price} x ${item.qty}</p><div class="item-controls"><button class="qty-btn" onclick="changeQty('${item.id}', -1)">-</button><span>${item.qty}</span><button class="qty-btn" onclick="changeQty('${item.id}', 1)">+</button></div></div><button class="remove-btn" onclick="removeFromCart('${item.id}')" style="background:none; border:none; color:red; margin-left:auto;"><i class="fas fa-trash"></i></button></div>`;
        });
    }
}
// --- CHECKOUT (Async: Saves to DB -> Then Opens WhatsApp) ---
async function checkoutWhatsApp() {
    if (cart.length === 0) {
        alert("Please add items to your cart first!");
        return;
    }

    // 1. UI Feedback: Show "Processing" on button
    const btn = document.querySelector('.btn-whatsapp-checkout');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
    btn.disabled = true;

    // 2. Trigger Celebration
    if (typeof triggerConfetti === "function") triggerConfetti();

    try {
        // 3. Calculate Total
        let total = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);

        // 4. SAVE TO DB (Wait for this to finish!)
        if (currentUser) {
            await db.collection("orders").add({
                userId: currentUser.uid,
                userName: currentUser.displayName,
                userEmail: currentUser.email,
                items: cart,
                total: total,
                timestamp: new Date() // or firebase.firestore.FieldValue.serverTimestamp()
            });
            console.log("Order successfully saved to database.");
        }

        // 5. Generate WhatsApp Message
        // Emojis via Code Points
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

        cart.forEach((item, index) => {
            // FIX: Calculate itemTotal inside the loop
            const itemTotal = item.price * item.qty;
            msg += `${index + 1}. *${item.name}*\n`;
            msg += `    Qty: ${item.qty} x ₹${item.price} = ₹${itemTotal}\n`;
        });

        msg += `---------------------------------\n`;
        msg += `*${ICON_MONEY} GRAND TOTAL: ₹${total}*\n`;
        msg += `---------------------------------\n`;
        msg += `${ICON_MEMO} *Customer Note:* (Type here)\n`;
        msg += `${ICON_PIN} *Delivery Address:* (Type here)\n\n`;
        msg += `_Please confirm availability and send payment QR code._`;

        // 6. Open WhatsApp (After short delay)
        setTimeout(() => {
            const phone = "919826698822"; 
            window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
            
            // Reset Button
            btn.innerHTML = originalText;
            btn.disabled = false;
            
            // Optional: Clear cart after successful order?
            // clearCart(); 
        }, 1000);

    } catch (error) {
        console.error("Order Failed:", error);
        alert("Could not save order. Please check your internet connection.");
        
        // Reset Button so they can try again
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}
function renderHamperOptions() {
    const container = document.getElementById('hamper-options'); if (!container) return;
    const eligibleProducts = products.filter(p => p.price <= 100 && p.in_stock === true); container.innerHTML = '';
    eligibleProducts.forEach(p => { const div = document.createElement('div'); div.className = 'hamper-option'; div.onclick = () => toggleHamperItem(p.id, div); div.innerHTML = `<img src="${p.image}" alt="${p.name}"><h4>${p.name}</h4>`; container.appendChild(div); });
}
function toggleHamperItem(id, element) {
    const product = products.find(p => p.id === id); if (selectedHamperItems.includes(product.name)) { selectedHamperItems = selectedHamperItems.filter(name => name !== product.name); element.classList.remove('selected'); } else { if (selectedHamperItems.length < 3) { selectedHamperItems.push(product.name); element.classList.add('selected'); } else { alert("Select only 3 items!"); } } updateHamperUI();
}
function updateHamperUI() { const countElem = document.getElementById('hamper-count'); if (countElem) countElem.innerText = selectedHamperItems.length; const btn = document.getElementById('add-hamper-btn'); if (btn) { if (selectedHamperItems.length === 3) { btn.classList.remove('disabled'); btn.innerHTML = `Add Box to Cart - ₹250`; } else { btn.classList.add('disabled'); btn.innerHTML = `Select ${3 - selectedHamperItems.length} more`; } } }
function addHamperToCart() { if (selectedHamperItems.length !== 3) return; cart.push({ id: 'hamper-' + Date.now(), name: `Gift Box (${selectedHamperItems.join(', ')})`, nameHi: `गिफ्ट बॉक्स`, price: 250, image: 'assets/images/product/mini-samosa.jpg', qty: 1 }); selectedHamperItems = []; document.querySelectorAll('.hamper-option').forEach(el => el.classList.remove('selected')); updateHamperUI(); toggleCart(); updateCartUI(); }
function checkStoreStatus() { const now = new Date(); const hour = now.getHours(); const statusDiv = document.getElementById('store-status'); const statusText = document.getElementById('status-text'); if (!statusDiv || !statusText) return; const isOpen = hour >= 9 && hour < 21; if (isOpen) { statusDiv.className = 'store-status open'; statusText.innerText = currentLang === 'en' ? 'Open' : 'खुला है'; } else { statusDiv.className = 'store-status closed'; statusText.innerText = currentLang === 'en' ? 'Closed' : 'बंद है'; } }
function toggleMobileMenu() { document.getElementById('mobile-nav').classList.toggle('active'); }
function toggleCart() { document.getElementById('cart-sidebar').classList.toggle('active'); document.querySelector('.cart-overlay').classList.toggle('active'); }
function playVideo(wrapper) { const video = wrapper.querySelector('video'); if (video.paused) { wrapper.classList.add('playing'); video.play(); } else { video.pause(); } }
function openQuiz() { document.getElementById('quiz-modal').style.display = 'flex'; startQuiz(); }
function closeQuiz() { document.getElementById('quiz-modal').style.display = 'none'; }
function startQuiz() { document.getElementById('quiz-content').innerHTML = `<div class="quiz-question"><h3>Spicy or Sweet?</h3><div class="quiz-options"><button class="quiz-btn" onclick="quizStep2('spicy')">Spicy</button><button class="quiz-btn" onclick="quizStep2('sweet')">Sweet</button></div></div>`; }
function quizStep2(pref) { document.getElementById('quiz-content').innerHTML = pref === 'spicy' ? `<h3>Sev or Nuts?</h3><div class="quiz-options"><button class="quiz-btn" onclick="showResult(1)">Sev</button><button class="quiz-btn" onclick="showResult(3)">Nuts</button></div>` : `<h3>Fried or Dry?</h3><div class="quiz-options"><button class="quiz-btn" onclick="showResult(7)">Fried</button><button class="quiz-btn" onclick="showResult(11)">Dry</button></div>`; }
function showResult(id) { const p = products.find(p => p.id == id); if (p) { document.getElementById('quiz-content').innerHTML = `<h3>Try This!</h3><img src="${p.image}" class="result-img"><p>${p.name}</p><button class="btn-primary" onclick="addToCart(${p.id}); closeQuiz();">Add - ₹${p.price}</button>`; } }
function shareProduct(name, image) { if (navigator.share) { navigator.share({ title: 'Namo Namkeen', text: `Check out this delicious ${name}!`, url: window.location.href }); } else { alert("Link copied!"); } }
function triggerConfetti() { var duration = 3000; var animationEnd = Date.now() + duration; var defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 3000 }; var interval = setInterval(function () { var timeLeft = animationEnd - Date.now(); if (timeLeft <= 0) return clearInterval(interval); var particleCount = 50 * (timeLeft / duration); confetti(Object.assign({}, defaults, { particleCount, origin: { x: Math.random(), y: Math.random() - 0.2 } })); }, 250); }
window.onscroll = function () { const btn = document.getElementById("scrollTopBtn"); if (btn) btn.style.display = (document.body.scrollTop > 300 || document.documentElement.scrollTop > 300) ? "flex" : "none"; };
function scrollToTop() { window.scrollTo({ top: 0, behavior: 'smooth' }); }
function registerServiceWorker() { if ('serviceWorker' in navigator && window.location.protocol !== 'file:') { window.addEventListener('load', () => navigator.serviceWorker.register('sw.js')); window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); const btn = document.getElementById('install-btn'); if (btn) { btn.style.display = 'block'; btn.onclick = () => e.prompt(); } }); } }