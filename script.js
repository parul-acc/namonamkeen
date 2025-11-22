// YOUR UPI ID (Replace this!)
const SHOP_UPI_ID = "8103276050@ybl"; // e.g., namonamkeen@sbi
const SHOP_NAME = "Parul Gangwal";

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
// --- ROBUST DATA FETCHING (With Fallback) ---
async function fetchProductsFromSheet() {
    const RAW_SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRTzLvn_dqN55WIaUHU8ytqM2Y2gXTZA4_29iYAdkh_uDmT4EgplKxJ4JimuoQJ5GugKxCq2v87cQGp/pub?output=csv';
    
    // Strategy: Try Proxy 1, if fails, try Proxy 2
    const proxies = [
        `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(RAW_SHEET_URL)}&t=${Date.now()}`,
        `https://corsproxy.io/?${encodeURIComponent(RAW_SHEET_URL)}`
    ];

    let csvData = null;

    for (const url of proxies) {
        try {
            console.log("Trying to fetch from:", url);
            const response = await fetch(url);
            if (response.ok) {
                csvData = await response.text();
                break; // Success! Stop trying.
            }
        } catch (err) {
            console.warn("Proxy failed, trying next...", err);
        }
    }

    if (!csvData) {
        console.error("All proxies failed.");
        const grid = document.getElementById('menu-grid');
        if(grid) grid.innerHTML = '<p style="text-align:center; padding:20px; color:red;">Menu could not be loaded. Please refresh.</p>';
        return;
    }

    // Success - Process Data
    const allData = csvToJSON(csvData);
    
    // 1. Announcement
    globalAnnouncement = allData.find(p => p.id == 999);
    if (globalAnnouncement) updateAnnouncementUI();

    // 2. Filter Products
    products = allData.filter(p => p.id && p.name && p.id != 999);

    console.log("Menu Loaded:", products);
    renderMenu();
    renderHamperOptions();
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
// --- AUTH UI UPDATE (With Data Fetching) ---
function updateUserUI(isLoggedIn) {
    const btn = document.getElementById('login-btn');
    const profile = document.getElementById('user-profile');
    const loginBtnCart = document.getElementById('btn-login-checkout');
    const orderBtnCart = document.getElementById('btn-final-checkout');

    if (isLoggedIn && currentUser) {
        // Navbar changes
        btn.style.display = 'none';
        profile.style.display = 'block';
        document.getElementById('user-pic').src = currentUser.photoURL;
        document.getElementById('user-name').innerText = currentUser.displayName;

        // Cart Button Changes (Unlock Order)
        if(loginBtnCart) loginBtnCart.style.display = 'none';
        if(orderBtnCart) orderBtnCart.style.display = 'flex';

        // FETCH SAVED ADDRESS/PHONE
        db.collection("users").doc(currentUser.uid).get().then((doc) => {
            if (doc.exists) {
                const data = doc.data();
                if (data.phone) document.getElementById('cust-phone').value = data.phone;
                if (data.address) document.getElementById('cust-address').value = data.address;
            }
        });

    } else {
        // Guest Mode
        btn.style.display = 'block';
        profile.style.display = 'none';
        
        // Lock Cart
        if(loginBtnCart) loginBtnCart.style.display = 'flex';
        if(orderBtnCart) orderBtnCart.style.display = 'none';
        
        // Clear Inputs
        if(document.getElementById('cust-phone')) document.getElementById('cust-phone').value = '';
        if(document.getElementById('cust-address')) document.getElementById('cust-address').value = '';
    }
}
function toggleProfileMenu() { document.getElementById('profile-menu').classList.toggle('active'); }

// --- ORDER HISTORY & INVOICE LOGIC ---

// --- FIXED ORDER HISTORY ---
function showOrderHistory() {
    document.getElementById('profile-menu').classList.remove('active');
    document.getElementById('history-modal').classList.add('active');
    const container = document.getElementById('history-content');
    
    if (!currentUser) return;

    container.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Loading history...</div>';

    db.collection("orders")
      .where("userId", "==", currentUser.uid)
      .orderBy("timestamp", "desc")
      .get()
      .then((querySnapshot) => {
          container.innerHTML = '';
          pastOrders = []; // Reset local list

          if (querySnapshot.empty) {
              container.innerHTML = '<p style="padding:20px; text-align:center; color:#777;">No past orders found.</p>';
              return;
          }
          
          querySnapshot.forEach((doc) => {
              const order = doc.data();
              order.id = doc.id; 
              pastOrders.push(order); 

              // 1. DEFINE THE DATE VARIABLE HERE
              const date = order.timestamp ? order.timestamp.toDate().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Date N/A';
              
              // 2. Status Color Logic
              const status = order.status || 'Pending';
              let statusColor = '#e67e22'; 
              if(status === 'Packed') statusColor = '#2980b9';
              if(status === 'Delivered') statusColor = '#27ae60';
              if(status === 'Cancelled') statusColor = '#c0392b';

              // 3. Items List
              let itemsHtml = '';
              order.items.forEach(i => {
                  itemsHtml += `<div style="font-size:0.9rem; color:#555; margin-bottom:2px;">• ${i.name} x ${i.qty}</div>`;
              });

              // 4. Generate HTML (Now 'date' is definitely defined)
              const html = `
                <div class="history-card" style="background:white; border:1px solid #eee; padding:15px; margin-bottom:15px; border-radius:12px; box-shadow:0 2px 8px rgba(0,0,0,0.05);">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; border-bottom:1px solid #f9f9f9; padding-bottom:8px;">
                        <span style="font-weight:600; color:#333; font-size:0.9rem;"><i class="far fa-calendar-alt"></i> ${date}</span>
                        <span style="background:${statusColor}; color:white; padding:2px 10px; border-radius:10px; font-size:0.75rem; font-weight:bold; text-transform:uppercase;">${status}</span>
                    </div>
                    <div style="margin-bottom:12px; padding-left:5px;">${itemsHtml}</div>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px; padding-top:10px; border-top:1px solid #eee;">
                        <span style="font-weight:bold; color:var(--primary); font-size:1.1rem;">Total: ₹${order.total}</span>
                        <div style="display:flex; gap:5px;">
                            <button onclick="reorderItems('${order.id}')" style="background:var(--primary); color:white; border:none; padding:6px 15px; border-radius:20px; cursor:pointer; font-size:0.85rem; font-weight:600; display:flex; align-items:center; gap:6px;">
                                <i class="fas fa-redo"></i> Reorder
                            </button>
                            <button onclick="openInvoice('${order.id}')" style="background:white; border:1px solid #ddd; color:#555; padding:6px 10px; border-radius:20px; cursor:pointer;">
                                <i class="fas fa-file-invoice"></i>
                            </button>
                        </div>
                    </div>
                </div>`;
                
              container.innerHTML += html;
          });
      })
      .catch((error) => {
          console.error("History Error:", error);
          container.innerHTML = '<p style="padding:20px; text-align:center;">Error loading history.</p>';
      });
}

function openInvoice(orderId) {
    const order = pastOrders.find(o => o.id === orderId);
    if(!order) return;

    document.body.classList.add('printing-invoice'); 

    // ... (Your existing population code for ID, Date, Name etc.) ...
    document.getElementById('inv-order-id').innerText = "#" + order.id.slice(0, 8).toUpperCase();
    document.getElementById('inv-date').innerText = order.timestamp ? order.timestamp.toDate().toLocaleDateString() : 'N/A';
    document.getElementById('inv-customer-name').innerText = order.userName || "Customer";
    document.getElementById('inv-customer-email').innerText = order.userEmail || currentUser.email || "";
    document.getElementById('inv-grand-total').innerText = "₹" + order.total;

    // --- NEW: GENERATE DYNAMIC QR CODE ---
    const qrImg = document.getElementById('inv-qr-img');
    if(qrImg) {
        // UPI Link Format: upi://pay?pa=UPI_ID&pn=NAME&am=AMOUNT&tn=NOTE
        const upiString = `upi://pay?pa=${SHOP_UPI_ID}&pn=${SHOP_NAME}&am=${order.total}&tn=Order_${order.id.slice(0,5)}`;
        
        // Use a free API to generate the QR image
        qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(upiString)}`;
    }
    // -------------------------------------

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

// --- CHECKOUT: SAVE -> SHOW MODAL ---
async function checkoutWhatsApp() {
    console.log("1. Checkout Started");

    // 1. Validation
    if (cart.length === 0) return alert("Your cart is empty!");
    if (!currentUser) return alert("Please login to place an order.");

    const phoneInput = document.getElementById('cust-phone');
    const addrInput = document.getElementById('cust-address');
    const phone = phoneInput ? phoneInput.value.trim() : '';
    const address = addrInput ? addrInput.value.trim() : '';

    if (phone.length < 10) {
        alert("Please enter a valid 10-digit Mobile Number.");
        if(phoneInput) phoneInput.focus();
        return;
    }
    if (address.length < 5) {
        alert("Please enter a full Delivery Address.");
        if(addrInput) addrInput.focus();
        return;
    }

    // 2. UI Feedback
    const btn = document.getElementById('btn-final-checkout');
    const originalText = btn ? btn.innerHTML : 'Confirm & Order';
    if(btn) {
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
        btn.disabled = true;
    }

    try {
        console.log("2. Calculating Totals");
        // Recalculate Totals (Including Shipping/Discount logic)
        const subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
        const shipping = (subtotal >= 500) ? 0 : 40; // Match your logic
        const discount = (typeof discountMultiplier !== 'undefined') ? discountMultiplier : 1;
        const total = Math.round((subtotal * discount) + shipping);
        const orderId = 'ORD-' + Date.now().toString().slice(-6);

        console.log("3. Saving to Firebase...");
        
        // Save User Info
        await db.collection("users").doc(currentUser.uid).set({
            phone: phone,
            address: address,
            lastOrder: new Date()
        }, { merge: true });

        // Save Order
        await db.collection("orders").add({
            id: orderId,
            userId: currentUser.uid,
            userName: currentUser.displayName,
            userEmail: currentUser.email,
            userPhone: phone,
            userAddress: address,
            items: cart,
            subtotal: subtotal,
            shipping: shipping,
            total: total,
            status: 'Pending',
            timestamp: new Date()
        });

        console.log("4. Order Saved. Preparing Modal.");

        // 5. Setup Success Modal
        if (typeof triggerConfetti === "function") triggerConfetti();

        // Generate WhatsApp Message
        const ICON_CART = String.fromCodePoint(0x1F6D2);     
        const ICON_PIN = String.fromCodePoint(0x1F4CD);      
        const ICON_PHONE = String.fromCodePoint(0x1F4DE);

        let msg = `*${ICON_CART} NEW ORDER - NAMO NAMKEEN*\n`;
        msg += `Order ID: #${orderId}\n`;
        msg += `---------------------------------\n`;
        msg += `*Customer Details:*\n`;
        msg += `👤 Name: ${currentUser.displayName}\n`;
        msg += `${ICON_PHONE} Mobile: +91 ${phone}\n`;
        msg += `${ICON_PIN} Address: ${address}\n`;
        msg += `---------------------------------\n`;
        msg += `*Order Details:*\n`;

        cart.forEach((item, index) => {
            msg += `${index + 1}. *${item.name}* x ${item.qty}\n`;
        });

        msg += `---------------------------------\n`;
        msg += `Subtotal: ₹${subtotal}\n`;
        msg += `Delivery: ${shipping === 0 ? 'FREE' : '₹'+shipping}\n`;
        msg += `*💰 GRAND TOTAL: ₹${total}*\n`;
        msg += `---------------------------------\n`;
        msg += `_Payment QR Scanned? (Yes/No)_\n`; 

        // Generate QR
        // Replace with your actual UPI ID
        const SHOP_UPI_ID = "8103276050@ybl"; 
        const SHOP_NAME = "Namo Namkeen";
        
        // The Magic Link: Opens GPay/PhonePe directly
        const upiLink = `upi://pay?pa=${SHOP_UPI_ID}&pn=${encodeURIComponent(SHOP_NAME)}&am=${total}&tn=Order_${orderId}&cu=INR`;
        
        // QR Code for scanning (Desktop users)
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(upiLink)}`;

        // D. Update Modal DOM
        const modal = document.getElementById('success-modal');
        if(modal) {
            document.getElementById('success-total-amount').innerText = "₹" + total;
            
            // Set the Image
            document.getElementById('success-qr-img').src = qrUrl;
            
            // Set the Click Link (Deep Link)
            document.getElementById('upi-pay-link').href = upiLink;
            
            // Setup WhatsApp Button
            const waBtn = document.getElementById('btn-send-whatsapp');
            waBtn.onclick = function() {
                const adminPhone = "919826698822"; 
                window.open(`https://wa.me/${adminPhone}?text=${encodeURIComponent(msg)}`, '_blank');
            };

            // Show Modal with animation class
            modal.style.display = 'flex';
            setTimeout(() => modal.classList.add('active'), 10);
            
            // Lock background scrolling
            document.body.classList.add('modal-open');
        }else {
            console.error("CRITICAL: #success-modal not found in HTML!");
            alert("Order Placed! Check your Order History.");
        }

        // Clear Cart
        cart = [];
        updateCartUI();
        toggleCart(); // Close Sidebar

        if(btn) {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }

    } catch (error) {
        console.error("Order Failed:", error);
        alert("Error saving order: " + error.message);
        if(btn) {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }
}

function closeSuccessModal() {
    const modal = document.getElementById('success-modal');
    if(modal) {
        modal.classList.remove('active');
        document.body.classList.remove('modal-open'); // Unlock scroll
        setTimeout(() => {
            modal.style.display = 'none';
        }, 300);
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
function toggleMobileMenu() {
    const nav = document.getElementById('mobile-nav');
    if(nav) {
        // This works for both the old display method and new transform method
        nav.classList.toggle('active'); 
    }
}
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

// --- TOAST NOTIFICATION SYSTEM ---
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    
    // Create element
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    // Icon based on type
    let icon = '';
    if(type === 'success') icon = '<i class="fas fa-check-circle"></i>';
    if(type === 'error') icon = '<i class="fas fa-exclamation-circle"></i>';
    if(type === 'info') icon = '<i class="fas fa-info-circle"></i>';

    toast.innerHTML = `${icon} <span>${message}</span>`;
    
    // Add to screen
    container.appendChild(toast);

    // Remove after 3 seconds
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(20px)';
        setTimeout(() => toast.remove(), 400);
    }, 3000);
}

function openProductDetail(id) {
    const p = products.find(item => item.id == id);
    if(!p) return;

    // Determine Name/Desc based on Language
    const name = currentLang === 'en' ? p.name : (p.nameHi || p.name);
    const desc = currentLang === 'en' ? p.desc : (p.descHi || p.desc);

    const html = `
        <img src="${p.image}" class="p-detail-img" onerror="this.src='logo.jpg'">
        
        <div class="p-detail-tags">
            <div class="p-veg-mark"><i class="fas fa-circle"></i></div>
            ${p.bestseller ? '<span style="background:#faa307; padding:2px 8px; border-radius:4px; font-size:0.8rem; font-weight:bold;">Bestseller</span>' : ''}
        </div>

        <h2 style="color:var(--primary); margin:10px 0;">${name}</h2>
        <p class="p-detail-desc">${desc}</p>
        <h3 style="margin-bottom:20px;">₹${p.price} / pack</h3>

        <button class="btn-primary" style="width:100%; padding:15px;" onclick="addToCart(${p.id}); closeProductModal();">
            Add to Cart
        </button>
    `;

    document.getElementById('p-modal-body').innerHTML = html;
    document.getElementById('product-modal').style.display = 'flex';
}

function closeProductModal() {
    document.getElementById('product-modal').style.display = 'none';
}

// --- 1. NEW: VALIDATE AND LOGIN ---
function validateAndLogin() {
    const phone = document.getElementById('cust-phone').value.trim();
    const address = document.getElementById('cust-address').value.trim();

    // Strict Validation Check
    if (phone.length !== 10 || isNaN(phone)) {
        alert("Please enter a valid 10-digit Mobile Number BEFORE logging in.");
        document.getElementById('cust-phone').focus();
        document.getElementById('cust-phone').style.border = "2px solid red";
        return;
    }
    if (address.length < 10) {
        alert("Please enter your full delivery address BEFORE logging in.");
        document.getElementById('cust-address').focus();
        document.getElementById('cust-address').style.border = "2px solid red";
        return;
    }

    // Reset borders
    document.getElementById('cust-phone').style.border = "none";
    document.getElementById('cust-address').style.border = "1px solid #ddd";

    // If valid, proceed to Google Login
    googleLogin();
}

// --- 2. UPDATED: GOOGLE LOGIN (Saves Data Immediately) ---
function googleLogin() {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider)
        .then((result) => {
            // Login Success! Now capture the data they typed.
            const phone = document.getElementById('cust-phone').value.trim();
            const address = document.getElementById('cust-address').value.trim();

            // Save immediately to their new profile
            db.collection("users").doc(result.user.uid).set({
                name: result.user.displayName,
                email: result.user.email,
                phone: phone,      // <--- Saving the input data
                address: address,  // <--- Saving the input data
                lastLogin: new Date()
            }, { merge: true });

            console.log("User logged in and details saved.");
        })
        .catch((error) => {
            console.error("Login Failed:", error);
            alert("Login failed: " + error.message);
        });
}

// --- 3. NEW: COUPON UI FUNCTIONS ---
function toggleCouponList() {
    const list = document.getElementById('coupon-list');
    if (list.style.display === "none") {
        list.style.display = "block";
    } else {
        list.style.display = "none";
    }
}

function useCoupon(code) {
    document.getElementById('promo-code').value = code;
    applyPromo(); // Auto-apply
    toggleCouponList(); // Hide list
}

// --- 4. UPDATED: APPLY PROMO (Visual Feedback) ---
let discountMultiplier = 1; 

function applyPromo() {
    const code = document.getElementById('promo-code').value.toUpperCase().trim();
    const msg = document.getElementById('promo-msg');
    
    if (code === 'NAMO10') {
        discountMultiplier = 0.90; 
        msg.style.color = 'green';
        msg.innerHTML = "🎉 <b>NAMO10</b> Applied! 10% Off.";
        if(typeof showToast === 'function') showToast("10% Discount Applied!", "success");
    } else if (code === 'WELCOME20') {
        discountMultiplier = 0.80; 
        msg.style.color = 'green';
        msg.innerHTML = "🎉 <b>WELCOME20</b> Applied! 20% Off.";
        if(typeof showToast === 'function') showToast("20% Discount Applied!", "success");
    } else {
        discountMultiplier = 1;
        msg.style.color = 'red';
        msg.innerHTML = "❌ Invalid or Expired Code.";
    }
    updateCartUI();
}

// --- REORDER LOGIC ---
function reorderItems(orderId) {
    const order = pastOrders.find(o => o.id === orderId);
    if(!order) return;

    let addedCount = 0;

    // Loop through history items
    order.items.forEach(historyItem => {
        // Check if product still exists in current catalog (by ID or Name)
        // We check 'products' array to ensure we use CURRENT price and image
        const liveProduct = products.find(p => p.id == historyItem.id || p.name === historyItem.name);

        if(liveProduct && liveProduct.in_stock) {
            // Add to cart logic
            const existing = cart.find(c => c.id == liveProduct.id);
            if(existing) {
                existing.qty += historyItem.qty;
            } else {
                // Push a clean copy
                cart.push({
                    id: liveProduct.id,
                    name: liveProduct.name,
                    nameHi: liveProduct.nameHi,
                    price: liveProduct.price,
                    image: liveProduct.image,
                    qty: historyItem.qty
                });
            }
            addedCount++;
        }
    });

    if(addedCount > 0) {
        updateCartUI();
        closeHistory(); // Close history modal
        toggleCart();   // Open cart sidebar
        if(typeof showToast === 'function') showToast("Items added to Cart!", "success");
    } else {
        alert("Sorry, these items are no longer available.");
    }
}

// --- PROFILE MANAGEMENT ---
function openProfileModal() {
    if(!currentUser) return;
    document.getElementById('profile-menu').classList.remove('active');
    
    // Pre-fill data
    document.getElementById('edit-name').value = currentUser.displayName;
    
    // Fetch latest from DB
    db.collection("users").doc(currentUser.uid).get().then(doc => {
        if(doc.exists) {
            const data = doc.data();
            document.getElementById('edit-phone').value = data.phone || '';
            document.getElementById('edit-address').value = data.address || '';
        }
        document.getElementById('profile-modal').style.display = 'flex';
    });
}

function closeProfileModal() {
    document.getElementById('profile-modal').style.display = 'none';
}

function saveProfile() {
    const phone = document.getElementById('edit-phone').value;
    const address = document.getElementById('edit-address').value;

    if(phone.length < 10 || address.length < 5) {
        alert("Please enter valid details.");
        return;
    }

    const btn = document.querySelector('#profile-modal .btn-primary');
    btn.innerHTML = "Saving...";

    db.collection("users").doc(currentUser.uid).set({
        phone: phone,
        address: address
    }, { merge: true }).then(() => {
        btn.innerHTML = "Save Changes";
        closeProfileModal();
        if(typeof showToast === 'function') showToast("Profile Updated!", "success");
        
        // Update the Checkout inputs if they exist on screen
        if(document.getElementById('cust-phone')) document.getElementById('cust-phone').value = phone;
        if(document.getElementById('cust-address')) document.getElementById('cust-address').value = address;
    });
}