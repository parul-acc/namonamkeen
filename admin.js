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
const ADMIN_EMAILS = ["parul19.accenture@gmail.com", "namonamkeens@gmail.com", "soramjain2297@gmail.com"];

let previousOrderCount = 0;
const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3'); // Simple notification sound

let adminCart = []; // Store items for POS
let dashboardUnsubscribe = null; // To stop old listeners when changing filters

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
    loadDashboardData('All'); // Default call
    loadInventory();
    loadOrders();
    loadCustomers();
    loadSettings();
    loadCoupons();
    loadReviews();
    loadStoreConfig();
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
            u.uid = doc.id;
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
               <td>
    <button class="icon-btn btn-blue" onclick="viewCustomer('${u.uid}')" title="View History"><i class="fas fa-history"></i></button>
    ${waBtn}
</td>
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
    if (!state.customers.data || state.customers.data.length === 0) return showToast("No data to export", "error");

    let csv = "Name,Email,Phone,Address,Last Login\n";
    state.customers.data.forEach(u => {
        // Handle commas/newlines in address for CSV safety
        const addr = u.address ? String(u.address).replace(/(\r\n|\n|\r|,)/gm, " ") : "";
        csv += `"${u.name || ''}","${u.email || ''}","${u.phone || ''}","${addr}","${u.displayDate}"\n`;
    });
    downloadCSV(csv, "namo_customers.csv");
}

// --- 1. DASHBOARD ---
// --- DASHBOARD WITH FILTERS ---

function updateDashboardFilter(timeframe) {
    loadDashboardData(timeframe);
}

function loadDashboardData(timeframe = 'All') {
    // 1. Determine Start Date based on Timeframe
    let startDate = null;
    const now = new Date();

    if (timeframe === 'Today') {
        startDate = new Date(now.setHours(0, 0, 0, 0));
    } else if (timeframe === 'Week') {
        // Start of current week (assuming Sunday start)
        const day = now.getDay();
        const diff = now.getDate() - day; // adjust when day is sunday
        startDate = new Date(now.setDate(diff));
        startDate.setHours(0, 0, 0, 0);
    } else if (timeframe === 'Month') {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (timeframe === 'Year') {
        startDate = new Date(now.getFullYear(), 0, 1);
    }

    // 2. Build Query
    let query = db.collection("orders");

    if (startDate) {
        query = query.where("timestamp", ">=", startDate);
    }

    // Default ordering
    query = query.orderBy("timestamp", "asc"); // Ascending for charts looks better

    // 3. Manage Listener (Unsubscribe previous to avoid duplicates)
    if (dashboardUnsubscribe) {
        dashboardUnsubscribe();
    }

    // 4. Start Listening
    dashboardUnsubscribe = query.onSnapshot(snap => {
        let rev = 0, count = 0, pending = 0;
        let salesMap = {}, prodMap = {};
        let paymentStats = { 'Online': 0, 'COD': 0 };

        snap.forEach(doc => {
            const o = doc.data();

            // Skip Cancelled orders from stats
            if (o.status === 'Cancelled') return;

            const d = o.timestamp ? o.timestamp.toDate() : new Date();

            // Stats Calculation
            rev += o.total;
            count++;
            if (o.status === 'Pending') pending++;

            // Chart Data Prep
            let label;
            if (timeframe === 'Today') {
                // For Today, show Hour (e.g., "10 AM")
                label = d.toLocaleString('en-US', { hour: 'numeric', hour12: true });
            } else if (timeframe === 'Year') {
                // For Year, show Month (e.g., "Jan")
                label = d.toLocaleString('default', { month: 'short' });
            } else {
                // Default: Date (e.g., "28/11")
                label = `${d.getDate()}/${d.getMonth() + 1}`;
            }

            salesMap[label] = (salesMap[label] || 0) + o.total;

            if (o.items) {
                o.items.forEach(i => {
                    prodMap[i.name] = (prodMap[i.name] || 0) + i.qty;
                });
            }

            // Payment Stats
            const method = (o.paymentMethod === 'COD') ? 'COD' : 'Online';
            paymentStats[method] += o.total;
        });

        // 5. Update UI Stats
        document.getElementById('today-rev').innerText = '₹' + rev.toLocaleString('en-IN');
        document.getElementById('total-orders').innerText = count;
        document.getElementById('pending-count').innerText = pending;
        document.getElementById('avg-order').innerText = '₹' + (count ? Math.round(rev / count) : 0);

        // 6. Update Charts
        updateCharts(salesMap, prodMap, timeframe, paymentStats);
    });
}

function updateCharts(salesMap, prodMap, timeframe, paymentStats) {
    // --- Sales Chart (Line) ---
    const ctx1 = document.getElementById('salesChart').getContext('2d');

    // Destroy old instance if exists
    if (window.salesChartInstance) window.salesChartInstance.destroy();

    window.salesChartInstance = new Chart(ctx1, {
        type: 'line',
        data: {
            labels: Object.keys(salesMap),
            datasets: [{
                label: `Revenue (${timeframe})`,
                data: Object.values(salesMap),
                borderColor: '#e85d04',
                backgroundColor: 'rgba(232,93,4,0.1)',
                fill: true,
                tension: 0.3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { y: { beginAtZero: true } }
        }
    });

    // --- Product Chart (Doughnut) ---
    const ctx2 = document.getElementById('productChart').getContext('2d');

    if (window.productChartInstance) window.productChartInstance.destroy();

    // Sort products by popularity (Top 5)
    const topP = Object.entries(prodMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    window.productChartInstance = new Chart(ctx2, {
        type: 'doughnut',
        data: {
            labels: topP.map(x => x[0]),
            datasets: [{
                data: topP.map(x => x[1]),
                backgroundColor: ['#e85d04', '#2980b9', '#27ae60', '#f1c40f', '#8e44ad']
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom' }
            }
        }
    });

    // --- NEW: Payment Chart ---
    const ctx3 = document.getElementById('paymentChart').getContext('2d');
    if (window.paymentChartInstance) window.paymentChartInstance.destroy();

    window.paymentChartInstance = new Chart(ctx3, {
        type: 'pie',
        data: {
            labels: ['Online (Paid)', 'Cash (COD)'],
            datasets: [{
                data: [paymentStats['Online'], paymentStats['COD']],
                backgroundColor: ['#2ecc71', '#e74c3c']
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: { display: true, text: 'Revenue Source' },
                legend: { position: 'bottom' }
            }
        }
    });
}

// --- 2. INVENTORY ---
function loadInventory() {
    db.collection("products").orderBy("id").onSnapshot(snap => {
        let total = 0, inStock = 0, outStock = 0;
        state.inventory.data = [];

        // Arrays for Low Stock Logic
        const lowStockItems = [];

        snap.forEach(doc => {
            const p = doc.data();
            p.docId = doc.id;
            total++;

            if (p.in_stock) {
                inStock++;
                // Optional: If you had a 'stockQty' field, you would check it here.
                // For now, we only check if it is explicitly marked OUT of stock via the toggle
            } else {
                outStock++;
                lowStockItems.push(p.name);
            }
            state.inventory.data.push(p);
        });

        // Update Stats
        document.getElementById('inv-total').innerText = total;
        document.getElementById('inv-stock').innerText = inStock;
        document.getElementById('inv-out').innerText = outStock;

        // Update Table
        renderTable('inventory');

        // --- NEW: UPDATE DASHBOARD ALERT ---
        updateLowStockUI(lowStockItems);
    });
}

// Add this helper function
function updateLowStockUI(items) {
    const alertBox = document.getElementById('low-stock-alert');
    const list = document.getElementById('low-stock-list');

    if (!alertBox || !list) return; // In case we are not on dashboard view

    if (items.length > 0) {
        alertBox.style.display = 'flex';
        list.innerHTML = items.map(name =>
            `<span style="background:white; padding:4px 10px; border-radius:15px; font-weight:600; border:1px solid #ddd; font-size:0.8rem;">${name}</span>`
        ).join('');
    } else {
        alertBox.style.display = 'none';
    }
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
        // 1. Check High Value (> ₹350)
        const isHighValue = o.total > 350 ? 'high-value-row' : '';

        // 2. Create Clickable Address
        const addressHtml = `<span class="copy-addr" onclick="copyToClipboard('${escapeHtml(o.userAddress)}')" title="Click to Copy">${escapeHtml(o.userAddress)}</span>`;

        // Add Cancel Button to Actions if Pending
        const cancelBtn = (o.status === 'Pending') ?
            `<button class="icon-btn btn-danger" onclick="adminCancelOrder('${o.docId}')" title="Cancel/Spam"><i class="fas fa-ban"></i></button>` : '';
        tbody.innerHTML += `
            <tr class="${isHighValue}">
                <td><input type="checkbox" class="order-check" value="${o.docId}" onchange="updateBulkUI()"></td>
                <td><strong>#${o.id}</strong><br><small style="color:#888">${d}</small></td>
                <td>
                    <div style="font-weight:600;">${escapeHtml(o.userName)}</div>
                    <div style="font-size:0.85rem; color:#666;">${o.userPhone}</div>
                </td>
                <td>${itemCount} Items</td>
                <td style="font-weight:bold;">₹${o.total}</td>
                <td>${addressHtml}</td>
                <td><span class="status-pill ${statusClass}">${o.status}</span></td>
                <td>
                    <button class="icon-btn btn-blue" onclick="viewOrder('${o.docId}')" title="View"><i class="fas fa-eye"></i></button>
                    <button class="icon-btn" style="background:#555;" onclick="printPackingSlip('${o.docId}')"><i class="fas fa-print"></i></button>
            ${cancelBtn} </td>
                    <button class="icon-btn" style="background:#555;" onclick="printPackingSlip('${o.docId}')" title="Print"><i class="fas fa-print"></i></button>
                    
                    ${o.status === 'Pending' ?
                `<button class="icon-btn btn-green" onclick="setStatus('${o.docId}', 'Packed')" title="Mark Packed"><i class="fas fa-box"></i></button>`
                : ''}
                </td>
            </tr>`;
    });
}

// 3. Add Helper Function (Bottom of file)
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        // Simple visual feedback
        const oldActive = document.querySelector(':focus');
        if (oldActive) oldActive.blur(); // Remove focus

        // Show a mini toast/alert (or use your existing showToast if available in admin)
        alert("Address Copied! ✅");
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
    // 1. Use Filtered Data if active, otherwise All Data
    const dataToExport = state.orders.filteredData || state.orders.data;

    if (!dataToExport || dataToExport.length === 0) return alert("No data to export");

    let csv = "Date,Order ID,Customer,Phone,Address,Items,Total,Payment,Status\n";

    dataToExport.forEach(o => {
        const d = o.timestamp ? new Date(o.timestamp.seconds * 1000).toLocaleDateString() : '-';
        // Clean up strings for CSV (remove commas/newlines)
        const addr = o.userAddress ? o.userAddress.replace(/(\r\n|\n|\r|,)/gm, " ") : "";
        const items = o.items.map(i => `${i.name} (${i.qty})`).join(' | ');

        csv += `"${d}","${o.id}","${escapeHtml(o.userName)}","${o.userPhone}","${addr}","${items}",${o.total},"${o.paymentMethod}",${o.status}\n`;
    });

    // 2. Generate Filename with Date
    const dateStr = new Date().toLocaleDateString().replace(/\//g, '-');
    downloadCSV(csv, `Namo_Orders_${dateStr}.csv`);
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

function deleteCoupon(id) { if (showConfirm("Delete?")) db.collection("coupons").doc(id).delete(); }
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
        if (order && showConfirm(`Updated to ${status}. Notify customer?`)) {
            let msg = `Hello ${escapeHtml(order.userName)}, your Namo Namkeen order #${order.id} is now *${status}*.`;
            window.open(`https://wa.me/91${escapeHtml(order.userPhone.replace(/\D/g, ''))}?text=${encodeURIComponent(msg)}`, '_blank');
        }
    });
}

// --- ADMIN: EDIT ORDER LOGIC ---

// 1. Replace the existing viewOrder function
function viewOrder(id) {
    const o = state.orders.data.find(x => x.docId === id);
    if (!o) return;

    // Generate Editable Items List
    let itemsHtml = '';
    o.items.forEach((item, idx) => {
        itemsHtml += `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; border-bottom:1px solid #eee; padding-bottom:5px;">
            <div style="flex:1;">
                <strong>${item.name}</strong> <small>(${item.weight})</small><br>
                <small style="color:#666;">₹${item.price} x ${item.qty} = <strong>₹${item.price * item.qty}</strong></small>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
                <button class="btn btn-outline btn-sm" onclick="adminUpdateQty('${id}', ${idx}, -1)" style="padding:2px 8px;">-</button>
                <span style="font-weight:600; width:20px; text-align:center;">${item.qty}</span>
                <button class="btn btn-outline btn-sm" onclick="adminUpdateQty('${id}', ${idx}, 1)" style="padding:2px 8px;">+</button>
                <button class="icon-btn btn-danger" onclick="adminRemoveItem('${id}', ${idx})" style="width:28px; height:28px; margin-left:5px;"><i class="fas fa-trash"></i></button>
            </div>
        </div>`;
    });

    // Discount Display
    let discountHtml = '';
    if (o.discount && o.discount.value > 0) {
        discountHtml = `<div style="display:flex; justify-content:space-between; color:green; margin-top:5px; font-size:0.9rem;">
            <span>Discount (${o.discount.code}):</span>
            <span>-₹${o.discount.type === 'percent' ? Math.round((o.total / (1 - o.discount.value / 100)) - o.total) : o.discount.value}</span>
        </div>`;
    }

    const html = `
        <div style="background:#f9fafb; padding:15px; border-radius:10px; margin-bottom:20px; border:1px solid #e5e7eb;">
            <h4 style="margin:0 0 10px 0; color:var(--dark);">Customer Details</h4>
            <p style="margin:5px 0;"><strong>Name:</strong> ${escapeHtml(o.userName)}</p>
            <p style="margin:5px 0;"><strong>Phone:</strong> ${escapeHtml(o.userPhone)}</p>
            <p style="margin:5px 0;"><strong>Address:</strong> ${escapeHtml(o.userAddress)}</p>
        </div>
        
        <h4 style="margin-bottom:15px; display:flex; justify-content:space-between; align-items:center;">
            Order Items 
            <span style="font-size:0.75rem; font-weight:normal; color:#666; background:#eee; padding:2px 8px; border-radius:10px;">Edit Mode Active</span>
        </h4>
        
        <div id="admin-order-items" style="max-height:300px; overflow-y:auto; padding-right:5px;">${itemsHtml}</div>
        
        <div style="margin-top:20px; border-top:2px dashed #ddd; padding-top:15px;">
            ${discountHtml}
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <h3>Total: ₹${o.total}</h3>
            </div>
        </div>

        <div style="margin-top:20px; display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
            <button class="btn btn-outline" onclick="closeModal('order-modal')">Close</button>
            <button class="btn btn-green" onclick="sendUpdateNotification('${id}')">
                <i class="fab fa-whatsapp"></i> Send Updated Receipt
            </button>
        </div>
    `;

    document.getElementById('order-detail-content').innerHTML = html;
    document.getElementById('order-modal').style.display = 'flex';
}

// 2. Add these NEW Helper Functions

function adminUpdateQty(orderId, itemIdx, change) {
    const orderDoc = state.orders.data.find(x => x.docId === orderId);
    if (!orderDoc) return;

    // Clone items array to avoid direct mutation issues
    let newItems = JSON.parse(JSON.stringify(orderDoc.items));
    let item = newItems[itemIdx];

    item.qty += change;

    if (item.qty < 1) {
        // If qty goes to 0, ask to remove
        adminRemoveItem(orderId, itemIdx);
        return;
    }

    recalculateAndSave(orderId, newItems, orderDoc);
}

async function adminRemoveItem(orderId, itemIdx) {
    // 1. Robust Confirmation Logic
    let confirmed = false;
    if (typeof showConfirm === 'function') {
        confirmed = await showConfirm("Remove this item from the order?");
    } else {
        confirmed = confirm("Remove this item from the order?"); // Fallback
    }

    if (!confirmed) return;

    // 2. Safety Check: Find Order
    const orderDoc = state.orders.data.find(x => x.docId === orderId);
    if (!orderDoc) {
        console.error("Error: Order not found in local state", orderId);
        showToast("Error: Order data missing. Please refresh the page.", "error");
        return;
    }

    // 3. Clone Items Safely
    let newItems = [];
    if (orderDoc.items && Array.isArray(orderDoc.items)) {
        newItems = JSON.parse(JSON.stringify(orderDoc.items));
    }

    // 4. Safety Check: Item Index
    if (itemIdx < 0 || itemIdx >= newItems.length) {
        console.error("Error: Invalid Item Index", itemIdx);
        return;
    }

    // 5. Remove & Save
    newItems.splice(itemIdx, 1); // Remove item at index
    recalculateAndSave(orderId, newItems, orderDoc);
}

function recalculateAndSave(orderId, newItems, orderDoc) {
    // 1. Calculate New Item Total
    let newItemTotal = newItems.reduce((sum, i) => sum + (i.price * i.qty), 0);

    // 2. Re-apply Discount logic
    let discountVal = 0;

    if (orderDoc.discount && orderDoc.discount.value > 0) {
        // Validation: If new total is 0 or very low, remove discount
        if (newItemTotal === 0) {
            discountVal = 0; // No discount on empty order
        } else if (orderDoc.discount.type === 'percent') {
            discountVal = Math.round(newItemTotal * (orderDoc.discount.value / 100));
        } else {
            // Flat discount
            discountVal = orderDoc.discount.value;

            // LOGIC FIX: Don't let flat discount exceed 50% of the order value 
            // (Prevents giving free items if admin reduces qty drastically)
            if (discountVal > (newItemTotal * 0.5)) {
                discountVal = Math.floor(newItemTotal * 0.5);
                // Optional: Alert admin that discount was adjusted
                console.log("Discount capped at 50% of value");
            }
        }
    }

    const finalTotal = Math.max(0, newItemTotal - discountVal);

    // 3. Update Firebase
    db.collection("orders").doc(orderId).update({
        items: newItems,
        total: finalTotal
        // Note: We don't update the 'discount' object itself, just the final math
    }).then(() => {
        // ... (existing update UI logic)
        orderDoc.items = newItems;
        orderDoc.total = finalTotal;
        viewOrder(orderId);
    }).catch(err => alert("Update failed: " + err.message));
}

// 3. The Notification Function
function sendUpdateNotification(orderId) {
    const o = state.orders.data.find(x => x.docId === orderId);
    if (!o) return;

    let itemsList = "";
    o.items.forEach(i => {
        itemsList += `- ${i.name} (${i.weight}) x ${i.qty}\n`;
    });

    let msg = `*Order Update #${o.id}*\n\nHello ${escapeHtml(o.userName)}, per your request, we have updated your order.\n\n*New Summary:*\n${itemsList}\n*New Total: ₹${o.total}*\n\nThank you for choosing Namo Namkeen!`;

    // Open WhatsApp
    const phone = o.userPhone.replace(/\D/g, '');
    window.open(`https://wa.me/91${phone}?text=${encodeURIComponent(msg)}`, '_blank');
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
function delProduct(id) { if (showConfirm("Delete?")) db.collection("products").doc(id).delete(); }
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
    if (!showConfirm("Overwrite product data?")) return;
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
                            if (showConfirm("New Admin Dashboard version available! Refresh now?")) {
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
    if (!showConfirm(`Mark ${checked.length} orders as ${newStatus}?`)) return;

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

// --- POS SYSTEM LOGIC ---

function switchView(v) {
    // ... existing switchView code ...
    // Add this inside the function:
    if (v === 'pos') renderPosProducts();
}

function renderPosProducts() {
    const grid = document.getElementById('pos-grid');
    const query = document.getElementById('pos-search').value.toLowerCase();
    grid.innerHTML = '';

    state.inventory.data.forEach(p => {
        // Search Filter
        if (!p.name.toLowerCase().includes(query)) return;

        // Determine price logic (Default to first variant or base price)
        let price = p.price;
        let weight = 'Standard';

        if (p.variants && p.variants.length > 0) {
            price = p.variants[0].price;
            weight = p.variants[0].weight;
        }

        // Generate Card
        grid.innerHTML += `
        <div class="pos-card" onclick="addToAdminCart('${p.id}', '${escapeHtml(p.name)}', ${price}, '${weight}', '${p.image}')">
            <img src="${p.image}" onerror="this.src='logo.jpg'">
            <h4>${p.name}</h4>
            <small>${weight} - ₹${price}</small>
        </div>`;
    });
}

function addToAdminCart(id, name, price, weight, image) {
    const existing = adminCart.find(i => i.productId == id);

    if (existing) {
        existing.qty++;
    } else {
        adminCart.push({
            productId: id,
            name: name,
            price: parseInt(price),
            weight: weight,
            image: image,
            qty: 1
        });
    }
    renderAdminCart();
}

function renderAdminCart() {
    const list = document.getElementById('pos-cart-list');
    list.innerHTML = '';
    let total = 0;

    adminCart.forEach((item, idx) => {
        total += item.price * item.qty;
        list.innerHTML += `
        <div class="pos-cart-item">
            <div style="flex:1">
                <strong>${item.name}</strong><br>
                <small>₹${item.price} x ${item.qty}</small>
            </div>
            <div style="display:flex; align-items:center; gap:5px;">
                <button class="pos-qty-btn" onclick="updatePosQty(${idx}, -1)">-</button>
                <span>${item.qty}</span>
                <button class="pos-qty-btn" onclick="updatePosQty(${idx}, 1)">+</button>
            </div>
            <div style="font-weight:bold; margin-left:10px;">₹${item.price * item.qty}</div>
        </div>`;
    });

    if (adminCart.length === 0) list.innerHTML = '<p style="color:#888; text-align:center; padding:10px;">Empty Cart</p>';

    document.getElementById('pos-total-display').innerText = `₹${total}`;
}

function updatePosQty(idx, change) {
    adminCart[idx].qty += change;
    if (adminCart[idx].qty <= 0) adminCart.splice(idx, 1);
    renderAdminCart();
}

async function submitPosOrder() {
    const name = document.getElementById('pos-name').value.trim();
    const phone = document.getElementById('pos-phone').value.trim();
    const address = document.getElementById('pos-address').value.trim() || "Walk-in Customer";
    const status = document.getElementById('pos-status').value;

    if (!name || !phone) return showToast("Please enter Name and Phone Number", "error");
    if (adminCart.length === 0) return showToast("Cart is empty", "error");

    // Calculate Total
    const total = adminCart.reduce((sum, i) => sum + (i.price * i.qty), 0);
    const orderId = 'POS-' + Date.now().toString().slice(-6);

    try {
        await db.collection("orders").add({
            id: orderId,
            userId: 'admin_entry', // Mark as internally created
            userName: name,
            userPhone: phone,
            userAddress: address,
            items: adminCart,
            total: total,
            status: status,
            paymentMethod: 'Cash/UPI (POS)',
            paymentStatus: 'Paid', // Assuming POS is paid immediately
            timestamp: new Date(),
            source: 'Admin POS'
        });

        showToast("Order Placed Successfully!", "success");

        // Reset Form
        adminCart = [];
        renderAdminCart();
        document.getElementById('pos-name').value = '';
        document.getElementById('pos-phone').value = '';
        document.getElementById('pos-address').value = '';

        // Go back to orders
        switchView('orders');

    } catch (e) {
        console.error(e);
        showToast("Error placing order: " + e.message);
    }
}

async function adminCancelOrder(docId) {
    if (!await showConfirm("Mark this order as Cancelled/Spam?")) return;

    try {
        await db.collection("orders").doc(docId).update({
            status: "Cancelled",
            cancelledBy: "Admin",
            cancelledAt: new Date()
        });
        showToast("Order Cancelled", "success");
    } catch (e) {
        showToast("Error: " + e.message);
    }
}

// --- REVIEW MANAGEMENT ---

function loadReviews() {
    db.collection("reviews").orderBy("timestamp", "desc").limit(50).onSnapshot(snap => {
        const tbody = document.getElementById('reviews-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (snap.empty) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">No reviews yet</td></tr>';
            return;
        }

        snap.forEach(doc => {
            const r = doc.data();
            const date = r.timestamp ? r.timestamp.toDate().toLocaleDateString() : '-';

            // Get Product Name (from Inventory state for speed)
            const product = state.inventory.data.find(p => p.id === r.productId);
            const pName = product ? product.name : `ID: ${r.productId}`;
            const pImg = product ? product.image : 'logo.jpg';

            // Star Visuals
            let stars = '';
            for (let i = 0; i < 5; i++) {
                stars += `<i class="fas fa-star" style="color: ${i < r.rating ? '#ffc107' : '#ddd'}; font-size:0.8rem;"></i>`;
            }

            tbody.innerHTML += `
            <tr>
                <td><small>${date}</small></td>
                <td>
                    <div style="display:flex; align-items:center; gap:10px;">
                        <img src="${pImg}" style="width:30px; height:30px; border-radius:4px; object-fit:cover;" onerror="this.src='logo.jpg'">
                        <span>${pName}</span>
                    </div>
                </td>
                <td>${escapeHtml(r.userName)}</td>
                <td>${stars}</td>
                <td style="max-width:300px; white-space:normal; color:#555;">${escapeHtml(r.comment)}</td>
                <td>
                    <button class="icon-btn btn-danger" onclick="deleteReview('${doc.id}', ${r.productId}, ${r.rating})" title="Delete Review">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>`;
        });
    });
}

async function deleteReview(reviewId, productId, rating) {
    if (!await showConfirm("Delete this review permanently?")) return;

    try {
        // 1. Delete the Review Document
        await db.collection("reviews").doc(reviewId).delete();

        // 2. Update Product Stats (Atomic Decrement)
        // We need to remove this rating from the product's average
        const productRef = db.collection("products").doc(String(productId));

        await productRef.update({
            ratingSum: firebase.firestore.FieldValue.increment(-rating),
            ratingCount: firebase.firestore.FieldValue.increment(-1)
        });

        showToast("Review Deleted", "success");
    } catch (e) {
        console.error(e);
        showToast("Error deleting review: " + e.message);
    }
}

// --- MASTER SETTINGS ---

function loadStoreConfig() {
    db.collection("settings").doc("config").onSnapshot(doc => {
        if (doc.exists) {
            const data = doc.data();
            if (document.getElementById('conf-phone')) {
                document.getElementById('conf-phone').value = data.adminPhone || '';
                document.getElementById('conf-upi').value = data.upiId || '';
                document.getElementById('conf-del-charge').value = data.deliveryCharge || 0;
                document.getElementById('conf-free-ship').value = data.minFreeShipping || 0;
            }
        }
    });

    // NEW: Load Layout
    db.collection("settings").doc("layout").onSnapshot(doc => {
        if (doc.exists) {
            const data = doc.data();
            if (document.getElementById('layout-title')) {
                document.getElementById('layout-title').value = data.heroTitle || '';
                document.getElementById('layout-subtitle').value = data.heroSubtitle || '';
                document.getElementById('layout-bg').value = data.heroImage || '';
            }
        }
    });
}

function saveStoreConfig() {
    const adminPhone = document.getElementById('conf-phone').value.trim();
    const upiId = document.getElementById('conf-upi').value.trim();
    const deliveryCharge = parseInt(document.getElementById('conf-del-charge').value) || 0;
    const minFreeShipping = parseInt(document.getElementById('conf-free-ship').value) || 0;

    if (!adminPhone || !upiId) return showToast("Phone and UPI ID are required.", "error");

    db.collection("settings").doc("config").set({
        adminPhone, upiId, deliveryCharge, minFreeShipping
    }, { merge: true })
        .then(() => showToast("Store Configuration Saved!", "success"))
        .catch(e => showToast("Error: " + e.message));
}

// --- CUSTOMER INSIGHTS ---

function viewCustomer(uid) {
    const user = state.customers.data.find(u => u.uid === uid);
    if (!user) return;

    const content = document.getElementById('cust-profile-content');
    content.innerHTML = '<p>Loading order history...</p>';
    document.getElementById('customer-modal').style.display = 'flex';

    // Fetch Orders for this user
    db.collection("orders").where("userId", "==", uid).orderBy("timestamp", "desc").get().then(snap => {
        let totalSpent = 0;
        let orderCount = 0;
        let ordersHtml = '';

        snap.forEach(doc => {
            const o = doc.data();
            // Ignore Cancelled in Total
            if (o.status !== 'Cancelled') {
                totalSpent += o.total;
                orderCount++;
            }

            const date = o.timestamp ? o.timestamp.toDate().toLocaleDateString() : '-';
            const statusColor = o.status === 'Delivered' ? 'green' : (o.status === 'Cancelled' ? 'red' : 'orange');

            ordersHtml += `
            <div style="display:flex; justify-content:space-between; padding:10px; border-bottom:1px solid #eee; align-items:center;">
                <div>
                    <strong>#${o.id}</strong> <span style="font-size:0.8rem; color:#888;">(${date})</span><br>
                    <small>${o.items.length} Items</small>
                </div>
                <div style="text-align:right;">
                    <div style="font-weight:bold;">₹${o.total}</div>
                    <span style="font-size:0.75rem; color:${statusColor}; font-weight:600;">${o.status}</span>
                </div>
            </div>`;
        });

        if (ordersHtml === '') ordersHtml = '<p style="text-align:center; padding:20px; color:#999;">No orders found.</p>';

        // Render Profile
        content.innerHTML = `
            <div style="display:flex; gap:20px; align-items:center; background:#f9f9f9; padding:20px; border-radius:10px; margin-bottom:20px;">
                <div style="width:60px; height:60px; background:#e85d04; color:white; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:1.5rem; font-weight:bold;">
                    ${user.name ? user.name.charAt(0).toUpperCase() : 'U'}
                </div>
                <div>
                    <h2 style="margin:0;">${user.name || 'Guest'}</h2>
                    <p style="margin:5px 0; color:#666;"><i class="fas fa-phone"></i> ${user.phone || '-'} <br> <i class="fas fa-envelope"></i> ${user.email || '-'}</p>
                </div>
                <div style="margin-left:auto; text-align:right;">
                    <div style="font-size:0.9rem; color:#666;">Lifetime Value</div>
                    <h2 style="margin:0; color:#2ecc71;">₹${totalSpent}</h2>
                    <small>${orderCount} Orders</small>
                </div>
            </div>
            
            <h4>Order History</h4>
            <div style="max-height:300px; overflow-y:auto; border:1px solid #eee; border-radius:8px;">
                ${ordersHtml}
            </div>
        `;
    });
}

function saveLayoutConfig() {
    const heroTitle = document.getElementById('layout-title').value.trim();
    const heroSubtitle = document.getElementById('layout-subtitle').value.trim();
    const heroImage = document.getElementById('layout-bg').value.trim();

    db.collection("settings").doc("layout").set({
        heroTitle, heroSubtitle, heroImage
    }, { merge: true })
        .then(() => showToast("Storefront Updated!", "success"))
        .catch(e => showToast("Error: " + e.message));
}

// --- ADMIN PWA INSTALLATION ---
let adminPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // Prevent automatic browser banner
    adminPrompt = e;

    const btn = document.getElementById('admin-install-btn');
    if (btn) {
        btn.style.display = 'flex'; // Show the button
        btn.onclick = () => {
            btn.style.display = 'none';
            adminPrompt.prompt();
            adminPrompt.userChoice.then((result) => {
                if (result.outcome === 'accepted') {
                    console.log('Admin App Installed');
                }
                adminPrompt = null;
            });
        };
    }
});

registerAdminServiceWorker();