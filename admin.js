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
const ADMIN_EMAILS = ["parul19.accenture@gmail.com"];

let previousOrderCount = 0;
const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3'); // Simple notification sound

let salesChartInstance, productChartInstance;
const ITEMS_PER_PAGE = 10;
let state = {
    inventory: { data: [], page: 1 },
    orders: { data: [], filteredData: null, page: 1 },
    customers: { data: [], filteredData: null, page: 1 }
};

// --- AUTHENTICATION ---
if (window.location.pathname.endsWith('admin-local.html')) {
    document.addEventListener('DOMContentLoaded', () => {
        document.getElementById('login-overlay').style.display = 'none';
        document.getElementById('admin-user-info').innerText = 'Local Admin';
        initDashboard();
    });
} else {
    auth.onAuthStateChanged(user => {
        console.log("Auth State Changed:", user ? user.email : "No User");
        if (user && ADMIN_EMAILS.includes(user.email)) {
            document.getElementById('login-overlay').style.display = 'none';
            document.getElementById('admin-user-info').innerText = user.displayName;
            initDashboard();
        } else if (user) {
            showToast("Access Denied. Admin Only.", "error");
            auth.signOut();
        }
    });
}

function adminLogin() { auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()); }
function logout() { auth.signOut().then(() => location.reload()); }

function initDashboard() {
    console.log("Initializing Dashboard...");
    loadDashboardData();
    loadInventory();
    loadOrders();
    loadCustomers(); // This triggers the customer fetch
    loadSettings();
    loadCoupons();
}

// --- PAGINATION ---
function renderTable(type) {
    const s = state[type];
    const dataToRender = s.filteredData ? s.filteredData : s.data;
    const totalItems = dataToRender.length;
    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE) || 1;
    if (s.page > totalPages) s.page = totalPages; if (s.page < 1) s.page = 1;
    const pageItems = dataToRender.slice((s.page - 1) * ITEMS_PER_PAGE, s.page * ITEMS_PER_PAGE);

    const tbody = document.getElementById(`${type}-body`);
    if (!tbody) {
        console.error(`Table body for ${type} not found in HTML`);
        return;
    }
    tbody.innerHTML = '';

    if (type === 'inventory') renderInventoryRows(tbody, pageItems);
    if (type === 'orders') renderOrderRows(tbody, pageItems);
    if (type === 'customers') renderCustomerRows(tbody, pageItems);

    const info = document.getElementById(`${type}-page-info`);
    if (info) info.innerText = `Page ${s.page} of ${totalPages}`;
}

function changePage(type, diff) {
    const s = state[type];
    const data = s.filteredData ? s.filteredData : s.data;
    const maxPage = Math.ceil(data.length / ITEMS_PER_PAGE);
    if ((s.page + diff) >= 1 && (s.page + diff) <= maxPage) {
        s.page += diff;
        renderTable(type);
    }
}

// --- 4. CUSTOMERS (FIXED) ---
function loadCustomers() {
    console.log("Fetching Customers from Firebase...");
    db.collection("users").limit(200).get().then(snap => {
        console.log(`Fetched ${snap.size} customer records.`);

        let count = 0, today = 0;
        state.customers.data = [];

        snap.forEach(doc => {
            const u = doc.data();
            count++;

            let last = null;
            if (u.lastLogin) {
                // Handle both Firestore Timestamp and Date strings
                if (u.lastLogin.seconds) last = new Date(u.lastLogin.seconds * 1000);
                else last = new Date(u.lastLogin);
            }

            if (last && !isNaN(last.getTime())) {
                if (last.setHours(0, 0, 0, 0) === new Date().setHours(0, 0, 0, 0)) today++;
                u.displayDate = last.toLocaleDateString();
            } else {
                u.displayDate = '-';
            }
            state.customers.data.push(u);
        });

        // Update Stats UI
        if (document.getElementById('cust-total')) document.getElementById('cust-total').innerText = count;
        if (document.getElementById('cust-active')) document.getElementById('cust-active').innerText = today;

        // Render Table
        renderTable('customers');

    }).catch(err => {
        console.error("Error loading customers:", err);
        showToast("Failed to load customers. Check console.", "error");
    });
}

function renderCustomerRows(tbody, items) {
    console.log("Rendering customer rows...", items.length);

    if (items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No customers found</td></tr>';
        return;
    }

    items.forEach(u => {
        // SAFE DATA HANDLING (Prevents crashes if data is missing)
        const name = u.name || 'Guest';
        const email = u.email || '';
        const phone = u.phone || '-';

        // Safe address substring
        let address = '-';
        if (u.address) {
            address = String(u.address).substring(0, 20);
            if (String(u.address).length > 20) address += '...';
        }

        const date = u.displayDate || '-';

        // Safe WhatsApp Button
        let waBtn = '-';
        if (u.phone) {
            // Remove non-numeric characters for the link
            const cleanPhone = String(u.phone).replace(/\D/g, '');
            waBtn = `<button class="icon-btn btn-green" onclick="window.open('https://wa.me/91${cleanPhone}', '_blank')"><i class="fab fa-whatsapp"></i></button>`;
        }

        tbody.innerHTML += `
            <tr>
                <td><strong>${name}</strong><br><small>${email}</small></td>
                <td>${phone}</td>
                <td>${address}</td>
                <td>${date}</td>
                <td>${waBtn}</td>
            </tr>`;
    });
}

function filterCustomers() {
    const q = document.getElementById('custSearch').value.toLowerCase();
    if (!state.customers.data) return;
    state.customers.filteredData = state.customers.data.filter(u =>
        (u.name || '').toLowerCase().includes(q) ||
        (u.phone || '').includes(q) ||
        (u.email || '').toLowerCase().includes(q)
    );
    state.customers.page = 1;
    renderTable('customers');
}

function exportCustomersToCSV() {
    if (!state.customers.data || state.customers.data.length === 0) return showToast("No data to export","error");

    let csv = "Name,Email,Phone,Address,Last Login\n";
    state.customers.data.forEach(u => {
        // Handle commas/newlines in address for CSV safety
        const addr = u.address ? String(u.address).replace(/(\r\n|\n|\r|,)/gm, " ") : "";
        csv += `"${u.name || ''}","${u.email || ''}","${u.phone || ''}","${addr}","${u.displayDate}"\n`;
    });
    downloadCSV(csv, "namo_customers.csv");
}

// --- 1. DASHBOARD ---
function loadDashboardData() {
    db.collection("orders").orderBy("timestamp", "desc").limit(100).onSnapshot(snap => {
        let rev = 0, count = 0, pending = 0, salesMap = {}, prodMap = {};
        snap.forEach(doc => {
            const o = doc.data();
            const d = o.timestamp ? o.timestamp.toDate() : new Date();
            rev += o.total; count++;
            if (o.status === 'Pending') pending++;
            const dateStr = d.toLocaleDateString();
            salesMap[dateStr] = (salesMap[dateStr] || 0) + o.total;
            if (o.items) o.items.forEach(i => prodMap[i.name] = (prodMap[i.name] || 0) + i.qty);
        });

        document.getElementById('today-rev').innerText = '₹' + rev;
        document.getElementById('total-orders').innerText = count;
        document.getElementById('pending-count').innerText = pending;
        document.getElementById('avg-order').innerText = '₹' + (count ? Math.round(rev / count) : 0);

        if (salesChartInstance) salesChartInstance.destroy();
        const ctx1 = document.getElementById('salesChart').getContext('2d');
        salesChartInstance = new Chart(ctx1, {
            type: 'line',
            data: {
                labels: Object.keys(salesMap),
                datasets: [{ label: 'Revenue', data: Object.values(salesMap), borderColor: '#e85d04', backgroundColor: 'rgba(232,93,4,0.1)', fill: true }]
            },
            options: { maintainAspectRatio: false }
        });

        if (productChartInstance) productChartInstance.destroy();
        const topP = Object.entries(prodMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
        const ctx2 = document.getElementById('productChart').getContext('2d');
        productChartInstance = new Chart(ctx2, {
            type: 'doughnut',
            data: {
                labels: topP.map(x => x[0]),
                datasets: [{ data: topP.map(x => x[1]), backgroundColor: ['#e85d04', '#2980b9', '#27ae60', '#f1c40f', '#8e44ad'] }]
            },
            options: { maintainAspectRatio: false }
        });
    });
}

// --- 2. INVENTORY ---
function loadInventory() {
    db.collection("products").orderBy("id").onSnapshot(snap => {
        let total = 0, inStock = 0, outStock = 0;
        state.inventory.data = [];
        snap.forEach(doc => {
            const p = doc.data(); p.docId = doc.id;
            total++; p.in_stock ? inStock++ : outStock++;
            state.inventory.data.push(p);
        });
        document.getElementById('inv-total').innerText = total;
        document.getElementById('inv-stock').innerText = inStock;
        document.getElementById('inv-out').innerText = outStock;
        renderTable('inventory');
    });
}

function renderInventoryRows(tbody, items) {
    items.forEach(p => {
        const vs = p.variants ? p.variants.map(v => `${v.weight}: ₹${v.price}`).join(' ') : '₹' + p.price;
        const rowClass = !p.in_stock ? 'row-out-stock' : '';
        tbody.innerHTML += `
            <tr class="${rowClass}">
                <td><img src="${p.image}" width="40" height="40" style="border-radius:5px; object-fit:cover;" onerror="this.src='logo.jpg'"></td>
                <td><strong>${p.name}</strong><br><small>${p.category}</small></td>
                <td><small>${vs}</small></td>
                <td><span class="stock-tag ${p.in_stock ? 'stock-in' : 'stock-out'}" onclick="toggleStock('${p.docId}',${!p.in_stock})">${p.in_stock ? 'In Stock' : 'Out'}</span></td>
                <td>
                    <button class="icon-btn btn-blue" onclick="editProduct('${p.docId}')"><i class="fas fa-edit"></i></button>
                    <button class="icon-btn btn-danger" onclick="delProduct('${p.docId}')"><i class="fas fa-trash"></i></button>
                </td>
            </tr>`;
    });
}

// --- 3. ORDERS ---
function loadOrders() {
    db.collection("orders").orderBy("timestamp", "desc").limit(20).onSnapshot(snap => {
        let pending = 0, packed = 0, delivered = 0;
        // CHECK FOR NEW ORDERS
        if (previousOrderCount > 0 && snap.size > previousOrderCount) {
            // New order detected!
            audio.play().catch(e => console.log("Audio play failed (user interaction needed first)"));
            showToast("New Order Received!", "success");
        }
        previousOrderCount = snap.size;
        state.orders.data = [];
        snap.forEach(doc => {
            const o = doc.data(); o.docId = doc.id;
            if (o.status === 'Pending') pending++; else if (o.status === 'Packed') packed++; else delivered++;
            state.orders.data.push(o);
        });
        document.getElementById('ord-pending').innerText = pending;
        document.getElementById('ord-packed').innerText = packed;
        document.getElementById('ord-delivered').innerText = delivered;
        state.orders.filteredData = null;
        renderTable('orders');
    });
}

function renderOrderRows(tbody, items) {
    tbody.innerHTML = '';
    items.forEach(o => {
        const d = o.timestamp ? new Date(o.timestamp.seconds * 1000).toLocaleDateString() : '-';
        const statusClass = `status-${o.status.toLowerCase()}`;
        const itemCount = o.items.length;

        tbody.innerHTML += `
            <tr>
                <td><input type="checkbox" class="order-check" value="${o.docId}" onchange="updateBulkUI()"></td>
                <td><strong>#${o.id}</strong><br><small style="color:#888">${d}</small></td>
                <td>
                    <div style="font-weight:600;">${escapeHtml(o.userName)}</div>
                    <div style="font-size:0.85rem; color:#666;">${o.userPhone}</div>
                </td>
                <td>${itemCount} Items</td>
                <td style="font-weight:bold;">₹${o.total}</td>
                <td><span class="status-pill ${statusClass}">${o.status}</span></td>
                <td>
                    <button class="icon-btn btn-blue" onclick="viewOrder('${o.docId}')" title="View"><i class="fas fa-eye"></i></button>
                    <button class="icon-btn" style="background:#555;" onclick="printPackingSlip('${o.docId}')" title="Print"><i class="fas fa-print"></i></button>
                    
                    ${o.status === 'Pending' ?
                `<button class="icon-btn btn-green" onclick="setStatus('${o.docId}', 'Packed')" title="Mark Packed"><i class="fas fa-box"></i></button>`
                : ''}
                </td>
            </tr>`;
    });
}

function filterOrders() {
    const status = document.getElementById('order-filter').value;
    const query = document.getElementById('order-search').value.toLowerCase();
    const dateStart = document.getElementById('date-start').value;
    const dateEnd = document.getElementById('date-end').value;

    state.orders.filteredData = state.orders.data.filter(o => {
        // 1. Status Filter
        const matchesStatus = (status === 'All') || (o.status === status);

        // 2. Search Filter (ID, Name, Phone)
        const str = (o.id + o.userName + o.userPhone).toLowerCase();
        const matchesSearch = str.includes(query);

        // 3. Date Filter
        let matchesDate = true;
        if (dateStart || dateEnd) {
            const orderDate = o.timestamp ? new Date(o.timestamp.seconds * 1000) : new Date();
            orderDate.setHours(0, 0, 0, 0); // Normalize time

            if (dateStart) {
                const start = new Date(dateStart);
                if (orderDate < start) matchesDate = false;
            }
            if (dateEnd) {
                const end = new Date(dateEnd);
                if (orderDate > end) matchesDate = false;
            }
        }

        return matchesStatus && matchesSearch && matchesDate;
    });

    state.orders.page = 1;
    renderTable('orders');
}

function exportOrdersToCSV() {
    let csv = "Date,Order ID,Customer,Phone,Address,Items,Total,Status\n";
    state.orders.data.forEach(o => {
        const d = o.timestamp ? new Date(o.timestamp.seconds * 1000).toLocaleDateString() : '-';
        const items = o.items.map(i => `${i.name} x ${i.qty}`).join(' | ');
        csv += `"${d}","${o.id}","${escapeHtml(o.userName)}","${escapeHtml(o.userPhone)}","${escapeHtml(o.userAddress.replace(/\n/g, ' '))}","${items}",${o.total},${o.status}\n`;
    });
    downloadCSV(csv, "namo_orders.csv");
}

// --- 5. COUPONS ---
function loadCoupons() {
    db.collection("coupons").orderBy("expiryDate", "desc").onSnapshot(snap => {
        const tbody = document.getElementById('coupons-body');
        if (!tbody) return;
        tbody.innerHTML = '';
        snap.forEach(doc => {
            const c = doc.data();
            const expiry = c.expiryDate.toDate();
            const isExpired = expiry < new Date();
            const statusClass = (c.isActive && !isExpired) ? 'status-active' : 'status-expired';
            const statusText = isExpired ? 'Expired' : (c.isActive ? 'Active' : 'Inactive');
            const displayValue = c.type === 'percent' ? `${c.value}%` : `₹${c.value}`;

            tbody.innerHTML += `
                <tr>
                    <td><strong>${c.code}</strong></td>
                    <td>${displayValue} OFF</td>
                    <td>${expiry.toLocaleDateString()}</td>
                    <td class="${statusClass}">${statusText}</td>
                    <td>
                        <button class="icon-btn btn-danger" onclick="deleteCoupon('${doc.id}')"><i class="fas fa-trash"></i></button>
                        <button class="icon-btn ${c.isActive ? 'btn-blue' : 'btn-green'}" onclick="toggleCoupon('${doc.id}', ${!c.isActive})">
                            <i class="fas ${c.isActive ? 'fa-ban' : 'fa-check'}"></i>
                        </button>
                    </td>
                </tr>`;
        });
    });
}

function saveCoupon() {
    const code = document.getElementById('cpn-code').value.toUpperCase().trim();
    const type = document.getElementById('cpn-type').value;
    const value = document.getElementById('cpn-value').value;
    const dateStr = document.getElementById('cpn-expiry').value;
    const minOrder = parseInt(document.getElementById('cpn-min').value) || 0; // New Field

    if (!code || !value || !dateStr) return showToast("Fill all fields", "error");

    const expiryDate = new Date(dateStr);
    expiryDate.setHours(23, 59, 59);

    db.collection("coupons").add({
        code, type, value: parseInt(value), expiryDate, isActive: true,
        minOrder: minOrder // Save it
    })
        .then(() => { showToast("Coupon Created!", "success"); document.getElementById('cpn-code').value = ''; })
        .catch(err => showToast(err.message, "error"));
}

function deleteCoupon(id) { if (confirm("Delete?")) db.collection("coupons").doc(id).delete(); }
function toggleCoupon(id, status) { db.collection("coupons").doc(id).update({ isActive: status }); }

// --- HELPER FUNCTIONS ---
function downloadCSV(csv, filename) {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
}

function setStatus(id, status) {
    db.collection("orders").doc(id).update({ status: status }).then(() => {
        const order = state.orders.data.find(o => o.docId === id);
        if (order && confirm(`Updated to ${status}. Notify customer?`)) {
            let msg = `Hello ${escapeHtml(order.userName)}, your Namo Namkeen order #${order.id} is now *${status}*.`;
            window.open(`https://wa.me/91${escapeHtml(order.userPhone.replace(/\D/g, ''))}?text=${encodeURIComponent(msg)}`, '_blank');
        }
    });
}

// Replace the existing viewOrder function
function viewOrder(id) {
    const o = state.orders.data.find(x => x.docId === id);
    if (!o) return;

    // Generate Editable Items List
    let itemsHtml = '';
    o.items.forEach((item, idx) => {
        itemsHtml += `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; border-bottom:1px solid #eee; padding-bottom:5px;">
            <div>
                <strong>${item.name}</strong> <small>(${item.weight})</small><br>
                Price: ₹${item.price}
            </div>
            <div style="display:flex; align-items:center; gap:5px;">
                <button onclick="adminUpdateQty('${id}', ${idx}, -1)" style="padding:2px 8px;">-</button>
                <span>${item.qty}</span>
                <button onclick="adminUpdateQty('${id}', ${idx}, 1)" style="padding:2px 8px;">+</button>
                <button onclick="adminRemoveItem('${id}', ${idx})" style="color:red; border:none; background:none; margin-left:5px;">&times;</button>
            </div>
        </div>`;
    });

    const html = `
        <div style="background:#f9f9f9; padding:10px; border-radius:5px; margin-bottom:15px;">
            <p><strong>Customer:</strong> ${escapeHtml(o.userName)}</p>
            <p><strong>Phone:</strong> ${escapeHtml(o.userPhone)}</p>
            <p><strong>Address:</strong> ${escapeHtml(o.userAddress)}</p>
        </div>
        
        <h4>Order Items (Edit Mode)</h4>
        <div id="admin-order-items">${itemsHtml}</div>
        
        <div style="margin-top:20px; text-align:right; border-top:2px solid #eee; padding-top:10px;">
            <h3>Total: ₹${o.total}</h3>
            ${o.discount && o.discount.value > 0 ? `<small style="color:green">Discount Applied: -₹${o.discount.value}</small>` : ''}
        </div>
    `;

    document.getElementById('order-detail-content').innerHTML = html;
    document.getElementById('order-modal').style.display = 'flex';
}

// Add these NEW Helper Functions to admin.js
function adminUpdateQty(orderId, itemIdx, change) {
    const orderDoc = state.orders.data.find(x => x.docId === orderId);
    if (!orderDoc) return;

    // Clone items array
    let newItems = [...orderDoc.items];
    let item = newItems[itemIdx];

    item.qty += change;
    if (item.qty < 1) return adminRemoveItem(orderId, itemIdx); // Remove if 0

    recalculateAndSave(orderId, newItems, orderDoc);
}

function adminRemoveItem(orderId, itemIdx) {
    if (!confirm("Remove this item?")) return;
    const orderDoc = state.orders.data.find(x => x.docId === orderId);
    let newItems = [...orderDoc.items];

    newItems.splice(itemIdx, 1); // Remove item
    recalculateAndSave(orderId, newItems, orderDoc);
}

function recalculateAndSave(orderId, newItems, orderDoc) {
    // 1. Calculate New Total
    let newTotal = newItems.reduce((sum, i) => sum + (i.price * i.qty), 0);

    // 2. Re-apply Discount if exists
    let discountVal = 0;
    if (orderDoc.discount) {
        if (orderDoc.discount.type === 'percent') discountVal = Math.round(newTotal * (orderDoc.discount.value / 100));
        else discountVal = orderDoc.discount.value;
    }
    const finalTotal = Math.max(0, newTotal - discountVal);

    // 3. Update Firebase
    db.collection("orders").doc(orderId).update({
        items: newItems,
        total: finalTotal
    }).then(() => {
        // UI will auto-update because of onSnapshot in loadOrders
        // But we need to refresh the modal specifically
        // Simple hack: Close and reopen or just alert
        viewOrder(orderId); // Refresh modal content
    });
}

function loadSettings() {
    db.collection("settings").doc("announcement").get().then(doc => {
        if (doc.exists) {
            const data = doc.data();
            if (document.getElementById('setting-announce')) {
                document.getElementById('setting-announce').value = data.text || '';
                document.getElementById('setting-announce-active').value = data.active ? 'true' : 'false';
            }
        }
    });
}

function saveSettings() {
    const text = document.getElementById('setting-announce').value;
    const active = document.getElementById('setting-announce-active').value === 'true';
    db.collection("settings").doc("announcement").set({ text, active }, { merge: true }).then(() => showToast("Saved", "success"));
}

function toggleStock(id, s) { db.collection("products").doc(id).update({ in_stock: s }); }
function delProduct(id) { if (confirm("Delete?")) db.collection("products").doc(id).delete(); }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }
function toggleSidebar() { document.getElementById('sidebar').classList.toggle('active'); }

function switchView(v) {
    // 1. Hide all sections
    document.querySelectorAll('.view-section').forEach(e => e.classList.remove('active'));

    // 2. Deactivate all nav links
    document.querySelectorAll('.nav-links a').forEach(e => e.classList.remove('active'));

    // 3. Show target section
    const targetSection = document.getElementById('view-' + v);
    if (targetSection) {
        targetSection.classList.add('active');
    } else {
        console.error("View not found:", v);
    }
    // 4. Activate target nav link
    const targetNav = document.getElementById('nav-' + v);
    if (targetNav) {
        targetNav.classList.add('active');
    }

    // 5. Update Header Title
    document.getElementById('page-title').innerText = v.charAt(0).toUpperCase() + v.slice(1);

    // 6. Mobile: Close sidebar after click
    document.getElementById('sidebar').classList.remove('active');

    // 7. Load specific data if needed
    if (v === 'orders') loadOrders();
}

// --- PRODUCT MANAGEMENT ---
function openProductModal() {
    document.getElementById('p-id').value = '';
    document.getElementById('variant-container').innerHTML = '';
    addVariantRow();
    document.getElementById('product-modal').style.display = 'flex';
}

function editProduct(id) {
    db.collection("products").doc(id).get().then(d => {
        const p = d.data();
        document.getElementById('p-id').value = id;
        document.getElementById('p-name').value = p.name;
        document.getElementById('p-nameHi').value = p.nameHi || '';
        document.getElementById('p-category').value = p.category;
        document.getElementById('p-image').value = p.image;
        document.getElementById('p-stock').checked = p.in_stock;
        document.getElementById('p-bestseller').checked = p.bestseller;

        const vc = document.getElementById('variant-container');
        vc.innerHTML = '';

        if (p.variants && p.variants.length > 0) {
            p.variants.forEach(v => {
                const stockStatus = (v.inStock !== undefined) ? v.inStock : true;
                addVariantRow(v.weight, v.price, stockStatus);
            });
        } else {
            addVariantRow('Standard', p.price, true);
        }
        document.getElementById('product-modal').style.display = 'flex';
    });
}

function addVariantRow(w = '', p = '', inStock = true) {
    const d = document.createElement('div');
    d.className = 'variant-row';
    const checked = inStock ? 'checked' : '';
    d.innerHTML = `
        <input class="form-control var-name" placeholder="Size (e.g. 250g)" value="${w}" style="margin:0; flex:2;">
        <input class="form-control var-price" type="number" placeholder="Price" value="${p}" style="margin:0; flex:1;">
        <div style="display:flex; align-items:center; gap:5px; background:#eee; padding:5px 10px; border-radius:5px;">
            <input type="checkbox" class="var-stock" ${checked} style="width:auto; margin:0;">
            <small>Stock</small>
        </div>
        <button class="remove-variant" onclick="this.parentElement.remove()">&times;</button>
    `;
    document.getElementById('variant-container').appendChild(d);
}

function saveProduct() {
    const id = document.getElementById('p-id').value || Date.now().toString();
    const vs = [];

    document.querySelectorAll('.variant-row').forEach(r => {
        const name = r.querySelector('.var-name').value.trim();
        const price = parseInt(r.querySelector('.var-price').value);
        const inStock = r.querySelector('.var-stock').checked;

        if (name && price) {
            vs.push({ weight: name, price: price, inStock: inStock });
        }
    });

    if (vs.length === 0) vs.push({ weight: 'Standard', price: 0, inStock: true });
    const activeVariants = vs.filter(v => v.inStock);
    const basePrice = activeVariants.length > 0 ? Math.min(...activeVariants.map(v => v.price)) : (vs[0].price || 0);

    db.collection("products").doc(id).set({
        id: parseInt(id) || id,
        name: document.getElementById('p-name').value,
        nameHi: document.getElementById('p-nameHi').value,
        category: document.getElementById('p-category').value,
        image: document.getElementById('p-image').value,
        in_stock: document.getElementById('p-stock').checked,
        bestseller: document.getElementById('p-bestseller').checked,
        variants: vs,
        price: basePrice
    }, { merge: true }).then(() => closeModal('product-modal'));
}

async function importFromSheet() {
    if (!confirm("Overwrite product data?")) return;
    const u = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRznY2zlF7wuPxkTe1k22gRLVOA9AHtmgZy2LBdEs9LIU3GlO_VxmFyN446vpb9IPspRXMeiBi4Lc29/pub?output=csv";
    try {
        const r = await fetch(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`);
        const t = await r.text();
        const rows = t.split("\n").slice(1);
        const b = db.batch();
        rows.forEach(rw => {
            if (!rw.trim()) return;
            const c = rw.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g).map(x => x.replace(/^"|"$/g, ''));
            const id = c[0];
            if (!id || id === '999') return;

            let v = [], rp = c[3];
            if (rp.includes('|')) rp.split('|').forEach(x => { let [s, p] = x.split('='); if (s) v.push({ weight: s.trim(), price: parseInt(p) }) });
            else v.push({ weight: 'Standard', price: parseInt(rp) || 0 });

            b.set(db.collection("products").doc(id), {
                id: parseInt(id), name: c[1], nameHi: c[2],
                price: Math.min(...v.map(z => z.price)), variants: v, desc: c[4],
                category: c[6], image: c[7], in_stock: c[10].toUpperCase() === 'TRUE'
            }, { merge: true });
        });
        await b.commit();
        showToast("Import Done", "success");
    } catch (e) { showToast("Import Failed: " + e.message); }
}

function escapeHtml(text) {
    if (!text) return text;
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// --- SERVICE WORKER ---
function registerAdminServiceWorker() {
    if ('serviceWorker' in navigator && (window.location.protocol === 'http:' || window.location.protocol === 'https:')) {
        navigator.serviceWorker.register('/admin-sw.js')
            .then(registration => {
                console.log('Admin SW Registered');
                registration.onupdatefound = () => {
                    const newWorker = registration.installing;
                    newWorker.onstatechange = () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            if (confirm("New Admin Dashboard version available! Refresh now?")) {
                                window.location.reload();
                            }
                        }
                    };
                };
            })
            .catch(err => console.log("Admin SW Registration Failed:", err));
    }
}

function printPackingSlip(docId) {
    const order = state.orders.data.find(o => o.docId === docId);
    if (!order) return;

    const itemsHtml = order.items.map(i =>
        `<tr>
            <td style="padding:5px; border-bottom:1px solid #eee;">${i.name} <br><small>${i.weight}</small></td>
            <td style="padding:5px; border-bottom:1px solid #eee; text-align:center;">${i.qty}</td>
        </tr>`
    ).join('');

    const slipWindow = window.open('', '_blank', 'width=400,height=600');
    slipWindow.document.write(`
        <html>
        <head>
            <title>Slip #${order.id}</title>
            <style>
                body { font-family: monospace; padding: 20px; max-width: 300px; margin: 0 auto; }
                h2 { margin: 0 0 10px; text-align: center; border-bottom: 2px dashed #000; padding-bottom: 10px; }
                .meta { margin-bottom: 15px; font-size: 0.9rem; }
                table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
                .footer { text-align: center; margin-top: 20px; font-size: 0.8rem; border-top: 2px dashed #000; padding-top: 10px; }
            </style>
        </head>
        <body>
            <h2>NAMO NAMKEEN</h2>
            <div class="meta">
                <strong>Order:</strong> #${order.id}<br>
                <strong>Date:</strong> ${new Date(order.timestamp.seconds * 1000).toLocaleDateString()}<br>
                <br>
                <strong>Customer:</strong> ${order.userName}<br>
                <strong>Phone:</strong> ${order.userPhone}<br>
                <strong>Address:</strong><br> ${order.userAddress}
            </div>
            
            <table>
                <thead>
                    <tr style="border-bottom:2px solid #000;">
                        <th style="text-align:left;">Item</th>
                        <th>Qty</th>
                    </tr>
                </thead>
                <tbody>${itemsHtml}</tbody>
            </table>

            <h3 style="text-align:right;">Total: ₹${order.total}</h3>
            <div style="text-align:center;">[ ${order.paymentMethod} ]</div>

            <div class="footer">
                Thank you for your order!<br>
                www.namonamkeen.shop
            </div>
            <script>window.print(); window.onafterprint = function(){ window.close(); }</script>
        </body>
        </html>
    `);
    slipWindow.document.close();
}

// --- BULK ACTIONS ---
function toggleAllOrders(source) {
    const checkboxes = document.querySelectorAll('.order-check');
    checkboxes.forEach(c => c.checked = source.checked);
    updateBulkUI();
}

function updateBulkUI() {
    const checked = document.querySelectorAll('.order-check:checked');
    const toolbar = document.getElementById('bulk-toolbar');
    const countSpan = document.getElementById('selected-count');

    if (checked.length > 0) {
        toolbar.classList.add('active');
        countSpan.innerText = `${checked.length} Selected`;
    } else {
        toolbar.classList.remove('active');
    }
}

function bulkUpdateStatus(newStatus) {
    const checked = document.querySelectorAll('.order-check:checked');
    if (checked.length === 0) return;

    if (!confirm(`Mark ${checked.length} orders as ${newStatus}?`)) return;

    const batch = db.batch();
    checked.forEach(c => {
        const docRef = db.collection("orders").doc(c.value);
        batch.update(docRef, { status: newStatus });
    });

    batch.commit().then(() => {
        showToast("Bulk Update Successful", "success");
        // Clear selection
        document.querySelectorAll('.order-check').forEach(c => c.checked = false);
        updateBulkUI();
    }).catch(err => showToast("Error: " + err.message));
}

function bulkPrintSlips() {
    const checked = document.querySelectorAll('.order-check:checked');
    if (checked.length === 0) return;

    // In a real app, you might bundle these into one PDF.
    // For now, we open them sequentially or just the first one as a demo.
    showToast("Printing " + checked.length + " slips...", "success");
    checked.forEach(c => printPackingSlip(c.value));
}

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
registerAdminServiceWorker();