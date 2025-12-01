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
const ADMIN_EMAILS = ["parul19.accenture@gmail.com", "namonamkeens@gmail.com", "soramjain2297@gmail.com"];

let previousOrderCount = 0;
const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');

let adminCart = [];
let ordersUnsubscribe = null;
let dashboardUnsubscribe = null;

let salesChartInstance, productChartInstance, paymentChartInstance;
const ITEMS_PER_PAGE = 10;
let state = {
    inventory: { data: [], filteredData: null, page: 1 },
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
    // Listener for Blog Image Upload
    document.addEventListener('change', function (e) {
        if (e.target && e.target.id === 'blog-image-file') {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function (evt) {
                    // Save the Base64 string to the hidden input
                    document.getElementById('blog-image-base64').value = evt.target.result;
                };
                reader.readAsDataURL(file);
            }
        }
    });
    // FIX: Reveal the UI now that we know the user is an Admin
    document.body.classList.remove('loading');
    loadDashboardData('All');
    loadInventory();
    loadOrders();
    loadCustomers();
    loadSettings();
    loadCoupons();
    // FIX: Ensure this function is defined below
    if (typeof loadReviews === 'function') loadReviews();
    loadStoreConfig();
}

// --- PAGINATION & RENDERING ---
function renderTable(type) {
    const s = state[type];
    const dataToRender = s.filteredData ? s.filteredData : s.data;

    if (!dataToRender) return;

    const totalItems = dataToRender.length;
    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE) || 1;

    if (s.page > totalPages) s.page = totalPages;
    if (s.page < 1) s.page = 1;

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

// --- REVIEW MANAGEMENT (FIXED: Added missing function) ---
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

            // Check for image
            let reviewImageHtml = '';
            if (r.imageUrl) {
                reviewImageHtml = `<br><img src="${r.imageUrl}" style="width:50px; height:50px; object-fit:cover; border-radius:4px; margin-top:5px; cursor:pointer;" onclick="window.open(this.src)">`;
            }

            // In loadReviews loop:
            const isPending = r.status === 'pending';
            const actionBtn = isPending
                ? `<button class="btn btn-success btn-sm" onclick="approveReview('${doc.id}')">Approve</button>`
                : `<button class="icon-btn btn-danger" onclick="deleteReview(...)"><i class="fas fa-trash"></i></button>`;

            tbody.innerHTML += `
            <tr>
                <td><small>${date}</small></td>
                <td>
                    <div style="display:flex; align-items:center; gap:10px;">
                        <img src="${pImg}" style="width:30px; height:30px; border-radius:4px; object-fit:cover;" onerror="this.onerror=null; this.src='logo.jpg';">
                        <span>${pName}</span>
                    </div>
                </td>
                <td>${escapeHtml(r.userName)}</td>
                <td>${stars}</td>
                <td style="max-width:300px; white-space:normal; color:#555;">${escapeHtml(r.comment)}
                ${reviewImageHtml} </td></td>
                <td>${actionBtn}</td>
            </tr>`;
        });
    });
}

function approveReview(id) {
    db.collection("reviews").doc(id).update({ status: 'approved' })
        .then(() => showToast("Review Approved", "success"));
}

async function deleteReview(reviewId, productId, rating) {
    if (!await showConfirm("Delete this review permanently?")) return;

    try {
        await db.collection("reviews").doc(reviewId).delete();

        // Update Product Stats
        const productRef = db.collection("products").doc(String(productId));

        await productRef.update({
            ratingSum: firebase.firestore.FieldValue.increment(-rating),
            ratingCount: firebase.firestore.FieldValue.increment(-1)
        });

        showToast("Review Deleted", "success");
    } catch (e) {
        console.error(e);
        showToast("Error deleting review: " + e.message, "error");
    }
}

// --- CUSTOMERS ---
function loadCustomers() {
    db.collection("users").limit(200).get().then(snap => {
        let count = 0, today = 0;
        state.customers.data = [];

        snap.forEach(doc => {
            const u = doc.data();
            u.uid = doc.id;
            count++;

            let last = null;
            if (u.lastLogin) {
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

        if (document.getElementById('cust-total')) document.getElementById('cust-total').innerText = count;
        if (document.getElementById('cust-active')) document.getElementById('cust-active').innerText = today;

        renderTable('customers');
    }).catch(err => {
        console.error("Error loading customers:", err);
        showToast("Failed to load customers.", "error");
    });
}

function renderCustomerRows(tbody, items) {
    if (items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No customers found</td></tr>';
        return;
    }

    items.forEach(u => {
        const name = u.name || 'Guest';
        const email = u.email || '';
        const phone = u.phone || '-';
        let address = u.address ? String(u.address).substring(0, 20) + (String(u.address).length > 20 ? '...' : '') : '-';
        const date = u.displayDate || '-';

        let waBtn = '-';
        if (u.phone) {
            const cleanPhone = String(u.phone).replace(/\D/g, '');
            waBtn = `<button class="icon-btn btn-green" onclick="window.open('https://wa.me/91${cleanPhone}', '_blank')"><i class="fab fa-whatsapp"></i></button>`;
        }

        tbody.innerHTML += `
            <tr>
                <td>${u.segment}<strong>${name}</strong><br><small>${email}</small></td>
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

// In admin.js inside exportCustomersToCSV()

function exportCustomersToCSV() {
    const dataToExport = state.customers.filteredData || state.customers.data;
    if (!dataToExport || dataToExport.length === 0) return showToast("No data to export", "error");

    // Helper to safely escape CSV fields (wraps in quotes, handles inner quotes)
    const safeCSV = (str) => {
        if (!str) return '""';
        return '"' + String(str).replace(/"/g, '""').replace(/\n/g, ' ') + '"';
    };

    let csv = "Name,Email,Phone,Address,Last Login\n";

    dataToExport.forEach(u => {
        csv += `${safeCSV(u.name)},${safeCSV(u.email)},${safeCSV(u.phone)},${safeCSV(u.address)},"${u.displayDate}"\n`;
    });

    downloadCSV(csv, "namo_customers.csv");
}

// --- DASHBOARD ---
function updateDashboardFilter(timeframe) {
    loadDashboardData(timeframe);
}

function loadDashboardData(timeframe = 'All') {
    let startDate = null;
    const now = new Date();

    if (timeframe === 'Today') {
        startDate = new Date(now.setHours(0, 0, 0, 0));
    } else if (timeframe === 'Week') {
        const day = now.getDay();
        const diff = now.getDate() - day;
        startDate = new Date(now.setDate(diff));
        startDate.setHours(0, 0, 0, 0);
    } else if (timeframe === 'Month') {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (timeframe === 'Year') {
        startDate = new Date(now.getFullYear(), 0, 1);
    }

    let query = db.collection("orders");
    if (startDate) {
        query = query.where("timestamp", ">=", startDate);
    }
    query = query.orderBy("timestamp", "asc");

    if (dashboardUnsubscribe) dashboardUnsubscribe();

    dashboardUnsubscribe = query.onSnapshot(snap => {
        let salesTrend = {};
        let rev = 0, count = 0, pending = 0;
        let salesMap = {}, prodMap = {};
        let paymentStats = { 'Online': 0, 'COD': 0 };



        // Init last 30 days with 0
        for (let i = 29; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const key = d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
            salesTrend[key] = 0;
        }

        snap.forEach(doc => {
            const o = doc.data();
            if (o.status === 'Cancelled') return;

            const d = o.timestamp ? o.timestamp.toDate() : new Date();
            rev += o.total;
            count++;
            if (o.status === 'Pending') pending++;

            let label;
            if (timeframe === 'Today') {
                label = d.toLocaleString('en-US', { hour: 'numeric', hour12: true });
            } else if (timeframe === 'Year') {
                label = d.toLocaleString('default', { month: 'short' });
            } else {
                label = `${d.getDate()}/${d.getMonth() + 1}`;
            }

            salesMap[label] = (salesMap[label] || 0) + o.total;
            if (o.items) {
                o.items.forEach(i => prodMap[i.name] = (prodMap[i.name] || 0) + i.qty);
            }

            // Fill Trend Data
            const key = d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
            if (salesTrend[key] !== undefined) {
                salesTrend[key] += o.total;
            }

            const method = (o.paymentMethod === 'COD') ? 'COD' : 'Online';
            paymentStats[method] += o.total;
        });

        document.getElementById('today-rev').innerText = '₹' + rev.toLocaleString('en-IN');
        document.getElementById('total-orders').innerText = count;
        document.getElementById('pending-count').innerText = pending;
        document.getElementById('avg-order').innerText = '₹' + (count ? Math.round(rev / count) : 0);

        updateCharts(salesMap, prodMap, timeframe, paymentStats);
    });
}

function updateCharts(salesMap, prodMap, timeframe, paymentStats) {
    const ctx1 = document.getElementById('salesChart').getContext('2d');
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
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
    });

    const ctx2 = document.getElementById('productChart').getContext('2d');
    if (window.productChartInstance) window.productChartInstance.destroy();

    const topP = Object.entries(prodMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
    window.productChartInstance = new Chart(ctx2, {
        type: 'doughnut',
        data: {
            labels: topP.map(x => x[0]),
            datasets: [{
                data: topP.map(x => x[1]),
                backgroundColor: ['#e85d04', '#2980b9', '#27ae60', '#f1c40f', '#8e44ad']
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });

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
        options: { responsive: true, maintainAspectRatio: false, plugins: { title: { display: true, text: 'Revenue Source' }, legend: { position: 'bottom' } } }
    });
}

// --- INVENTORY ---
function loadInventory() {
    db.collection("products").orderBy("id").onSnapshot(snap => {
        let total = 0, inStock = 0, outStock = 0;
        state.inventory.data = [];
        const lowStockItems = [];

        snap.forEach(doc => {
            const p = doc.data(); p.docId = doc.id;
            total++;
            if (p.in_stock) {
                inStock++;
            } else {
                outStock++;
                lowStockItems.push(p.name);
            }
            state.inventory.data.push(p);
        });

        document.getElementById('inv-total').innerText = total;
        document.getElementById('inv-stock').innerText = inStock;
        document.getElementById('inv-out').innerText = outStock;

        renderTable('inventory');
        updateLowStockUI(lowStockItems);
    });
}

function updateLowStockUI(items) {
    const alertBox = document.getElementById('low-stock-alert');
    const list = document.getElementById('low-stock-list');
    if (!alertBox || !list) return;

    if (items.length > 0) {
        alertBox.style.display = 'flex';
        list.innerHTML = items.map(name => `<span style="background:white; padding:4px 10px; border-radius:15px; font-weight:600; border:1px solid #ddd; font-size:0.8rem;">${name}</span>`).join('');
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
                <td><img src="${p.image}" width="40" height="40" style="border-radius:5px; object-fit:cover;" onerror="this.onerror=null; this.src='logo.jpg';"></td>
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

// 1. Add this variable at the top of admin.js with other state variables
let inventorySearchTimeout;

// 2. Replace the existing filterInventory function with this:
function filterInventory() {
    clearTimeout(inventorySearchTimeout);

    // Wait for 300ms pause in typing before actually filtering
    inventorySearchTimeout = setTimeout(() => {
        const query = document.getElementById('inv-search').value.toLowerCase();
        const filtered = state.inventory.data.filter(p =>
            (p.name && p.name.toLowerCase().includes(query)) ||
            (p.category && p.category.toLowerCase().includes(query))
        );
        state.inventory.filteredData = filtered;
        state.inventory.page = 1;
        renderTable('inventory');
    }, 300);
}

// --- ORDERS ---
function loadOrders() {
    // 1. Unsubscribe from previous listener if it exists
    if (ordersUnsubscribe) {
        ordersUnsubscribe();
    }

    const query = db.collection("orders").orderBy("timestamp", "desc").limit(100);

    // 2. Assign the new listener to the global variable
    ordersUnsubscribe = query.onSnapshot(snap => {
        let pending = 0, packed = 0, delivered = 0;

        // Sound & Notification Logic
        if (previousOrderCount > 0 && snap.size > previousOrderCount) {
            if (soundEnabled) {
                orderSound.play().catch(e => console.log("Sound blocked:", e));
            }
            showToast("New Order Received!", "success");
            vibrate(200);
        }
        previousOrderCount = snap.size;

        state.orders.data = [];
        snap.forEach(doc => {
            const o = doc.data();
            o.docId = doc.id;

            if (o.status === 'Pending') pending++;
            else if (o.status === 'Packed') packed++;
            else if (o.status === 'Delivered') delivered++;

            state.orders.data.push(o);
        });

        // Update Stats Counters
        const pEl = document.getElementById('ord-pending');
        const kEl = document.getElementById('ord-packed');
        const dEl = document.getElementById('ord-delivered');

        if (pEl) pEl.innerText = pending;
        if (kEl) kEl.innerText = packed;
        if (dEl) dEl.innerText = delivered;

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
        const isHighValue = o.total > 350 ? 'high-value-row' : '';

        // Check if COD and Unpaid
        const isCodUnpaid = o.paymentMethod === 'COD' && o.paymentStatus !== 'Paid';
        const payBtn = isCodUnpaid ?
            `<button class="icon-btn btn-green" onclick="markOrderPaid('${o.docId}')" title="Mark Payment Received"><i class="fas fa-money-bill-wave"></i></button>`
            : '';

        // FIX: Use data attributes to store messy strings (addresses with quotes/newlines)
        // instead of passing them directly into the onclick function which breaks syntax.
        const safeAddress = escapeHtml(o.userAddress);

        const cancelBtn = (o.status === 'Pending' || o.status === 'Packed') ?
            `<button class="icon-btn btn-danger" onclick="adminCancelOrder('${o.docId}')" title="Cancel Order"><i class="fas fa-ban"></i></button>` : '';

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
                
                <td>
                    <span class="copy-addr" 
                          data-addr="${safeAddress}" 
                          onclick="copyToClipboard(this.getAttribute('data-addr'))" 
                          title="Click to Copy">
                        ${safeAddress.substring(0, 25)}${safeAddress.length > 25 ? '...' : ''}
                    </span>
                </td>
                
                <td><span class="status-pill ${statusClass}">${o.status}</span></td>
                <td>
                    <button class="icon-btn btn-blue" onclick="viewOrder('${o.docId}')" title="View"><i class="fas fa-eye"></i></button>
                    ${payBtn}
                    <button class="icon-btn" style="background:#555;" onclick="printPackingSlip('${o.docId}')" title="Print"><i class="fas fa-print"></i></button>
                    ${cancelBtn}
                    ${o.status === 'Pending' ? `<button class="icon-btn btn-green" onclick="setStatus('${o.docId}', 'Packed')" title="Mark Packed"><i class="fas fa-box"></i></button>` : ''}
                </td>
            </tr>`;
    });
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showToast("Address Copied! ✅", "success");
    });
}

function filterOrders() {
    const status = document.getElementById('order-filter').value;
    const query = document.getElementById('order-search').value.toLowerCase();
    const dateStart = document.getElementById('date-start').value;
    const dateEnd = document.getElementById('date-end').value;

    state.orders.filteredData = state.orders.data.filter(o => {
        const matchesStatus = (status === 'All') || (o.status === status);
        const str = (o.id + o.userName + o.userPhone).toLowerCase();
        const matchesSearch = str.includes(query);

        let matchesDate = true;
        if (dateStart || dateEnd) {
            const orderDate = o.timestamp ? new Date(o.timestamp.seconds * 1000) : new Date();
            orderDate.setHours(0, 0, 0, 0);
            if (dateStart) { const start = new Date(dateStart); if (orderDate < start) matchesDate = false; }
            if (dateEnd) { const end = new Date(dateEnd); if (orderDate > end) matchesDate = false; }
        }
        return matchesStatus && matchesSearch && matchesDate;
    });

    state.orders.page = 1;
    renderTable('orders');
}

function exportOrdersToCSV() {
    const dataToExport = state.orders.filteredData || state.orders.data;
    if (!dataToExport || dataToExport.length === 0) return showToast("No data to export", "error");

    let csv = "Date,Order ID,Customer,Phone,Address,Items,Total,Payment,Status\n";
    dataToExport.forEach(o => {
        const d = o.timestamp ? new Date(o.timestamp.seconds * 1000).toLocaleDateString() : '-';
        const addr = o.userAddress ? o.userAddress.replace(/"/g, '""') : "";
        const items = o.items.map(i => `${i.name} (${i.qty})`).join(' | ');
        csv += `"${d}","${o.id}","${escapeHtml(o.userName)}","${o.userPhone}","${addr}","${items}",${o.total},"${o.paymentMethod}",${o.status}\n`;
    });

    const dateStr = new Date().toLocaleDateString().replace(/\//g, '-');
    downloadCSV(csv, `Namo_Orders_${dateStr}.csv`);
}

// --- COUPONS ---
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

// In admin.js inside saveCoupon()

function saveCoupon() {
    const code = document.getElementById('cpn-code').value.toUpperCase().trim();
    const type = document.getElementById('cpn-type').value;
    const value = document.getElementById('cpn-value').value;
    const dateStr = document.getElementById('cpn-expiry').value;
    // FIX: Parse as Float to allow decimals (e.g. 500)
    const minOrder = parseFloat(document.getElementById('cpn-min').value) || 0;

    if (!code || !value || !dateStr) return showToast("Fill all fields", "error");

    const expiryDate = new Date(dateStr);
    expiryDate.setHours(23, 59, 59);

    db.collection("coupons").add({
        code,
        type,
        value: parseFloat(value), // FIX: Changed from parseInt to parseFloat
        expiryDate,
        isActive: true,
        minOrder: minOrder
    })
        .then(() => {
            showToast("Coupon Created!", "success");
            // Clear inputs
            document.getElementById('cpn-code').value = '';
            document.getElementById('cpn-value').value = '';
            document.getElementById('cpn-min').value = '';
        })
        .catch(err => showToast(err.message, "error"));
}

async function deleteCoupon(id) { if (await showConfirm("Delete coupon?")) db.collection("coupons").doc(id).delete(); }
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
    db.collection("orders").doc(id).update({ status: status }).then(async () => {
        const order = state.orders.data.find(o => o.docId === id);
        if (order && await showConfirm(`Updated to ${status}. Notify customer?`)) {
            let msg = `Hello ${escapeHtml(order.userName)}, your Namo Namkeen order #${order.id} is now *${status}*.`;
            window.open(`https://wa.me/91${escapeHtml(order.userPhone.replace(/\D/g, ''))}?text=${encodeURIComponent(msg)}`, '_blank');
        }
    });
}

// --- ADMIN: EDIT ORDER LOGIC ---
function viewOrder(id) {
    const o = state.orders.data.find(x => x.docId === id);
    if (!o) return;

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

    let discountHtml = '';
    if (o.discount && o.discount.value > 0) {
        discountHtml = `<div style="display:flex; justify-content:space-between; color:green; margin-top:5px; font-size:0.9rem;">
            <span>Discount (${o.discount.code}):</span>
            <span>-₹${o.discount.type === 'percent' ? Math.round((o.total / (1 - o.discount.value / 100)) - o.total) : o.discount.value}</span>
        </div>`;
    }

    // --- ADD THIS BLOCK ---
    let shippingHtml = '';
    if (o.shippingCost > 0) {
        shippingHtml = `<div style="display:flex; justify-content:space-between; color:#666; margin-top:5px; font-size:0.9rem;">
            <span>Delivery Charge:</span>
            <span>₹${o.shippingCost}</span>
        </div>`;
    }

    const html = `
        <div style="background:#f9fafb; padding:15px; border-radius:10px; margin-bottom:20px; border:1px solid #e5e7eb;">
            <h4 style="margin:0 0 10px 0; color:var(--dark);">Customer Details</h4>
            <p style="margin:5px 0;"><strong>Name:</strong> ${escapeHtml(o.userName)}</p>
            <p style="margin:5px 0;"><strong>Phone:</strong> ${escapeHtml(o.userPhone)}</p>
            <p style="margin:5px 0;"><strong>Address:</strong> ${escapeHtml(o.userAddress)}</p>
            ${o.deliveryNote ? `<p style="margin:5px 0; color:#d35400;"><strong>Note:</strong> ${escapeHtml(o.deliveryNote)}</p>` : ''}
        </div>
        
        <h4 style="margin-bottom:15px; display:flex; justify-content:space-between; align-items:center;">
            Order Items <span style="font-size:0.75rem; font-weight:normal; color:#666; background:#eee; padding:2px 8px; border-radius:10px;">Edit Mode Active</span>
        </h4>
        <div id="admin-order-items" style="max-height:300px; overflow-y:auto; padding-right:5px;">${itemsHtml}</div>
        
        <div style="margin-top:20px; border-top:2px dashed #ddd; padding-top:15px;">
            ${shippingHtml} 
            ${discountHtml}
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px;"><h3>Total: ₹${o.total}</h3></div>
        </div>

        <div style="margin-top:20px; display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
            <button class="btn btn-outline" onclick="closeModal('order-modal')">Close</button>
            <button class="btn btn-green" onclick="sendUpdateNotification('${id}')"><i class="fab fa-whatsapp"></i> Send Updated Receipt</button>
        </div>
    `;
    document.getElementById('order-detail-content').innerHTML = html;
    document.getElementById('order-modal').style.display = 'flex';
}

function adminUpdateQty(orderId, itemIdx, change) {
    const orderDoc = state.orders.data.find(x => x.docId === orderId);
    if (!orderDoc) return;
    let newItems = JSON.parse(JSON.stringify(orderDoc.items));
    let item = newItems[itemIdx];
    item.qty += change;
    if (item.qty < 1) { adminRemoveItem(orderId, itemIdx); return; }
    recalculateAndSave(orderId, newItems, orderDoc);
}

async function adminRemoveItem(orderId, itemIdx) {
    if (!await showConfirm("Remove this item from the order?")) return;
    const orderDoc = state.orders.data.find(x => x.docId === orderId);
    let newItems = JSON.parse(JSON.stringify(orderDoc.items));
    newItems.splice(itemIdx, 1);
    recalculateAndSave(orderId, newItems, orderDoc);
}

// FIND THIS FUNCTION IN admin.js
function recalculateAndSave(orderId, newItems, orderDoc) {
    let newItemTotal = newItems.reduce((sum, i) => sum + (i.price * i.qty), 0);
    let discountVal = 0;

    if (orderDoc.discount && orderDoc.discount.value > 0) {
        if (newItemTotal === 0) {
            discountVal = 0;
        } else if (orderDoc.discount.type === 'percent') {
            discountVal = Math.round(newItemTotal * (orderDoc.discount.value / 100));
        } else {
            // Flat discount logic
            discountVal = orderDoc.discount.value;
            if (discountVal > newItemTotal) {
                discountVal = newItemTotal;
            }
        }
    }

    // --- FIX STARTS HERE ---
    // Retrieve shipping cost (default to 0 if missing)
    const shipping = orderDoc.shippingCost || 0;

    // Calculate Final Total including Shipping
    const finalTotal = Math.max(0, newItemTotal - discountVal) + shipping;
    // --- FIX ENDS HERE ---

    db.collection("orders").doc(orderId).update({
        items: newItems,
        total: finalTotal
    }).then(() => {
        orderDoc.items = newItems;
        orderDoc.total = finalTotal;
        viewOrder(orderId); // Refresh view
        showToast("Order updated. Total: ₹" + finalTotal, "success");
    }).catch(err => showToast("Update failed: " + err.message));
}

function sendUpdateNotification(orderId) {
    const o = state.orders.data.find(x => x.docId === orderId);
    if (!o) return;
    let itemsList = "";
    o.items.forEach(i => { itemsList += `- ${i.name} (${i.weight}) x ${i.qty}\n`; });
    let msg = `*Order Update #${o.id}*\n\nHello ${escapeHtml(o.userName)}, we have updated your order.\n\n*New Summary:*\n${itemsList}\n*New Total: ₹${o.total}*`;
    window.open(`https://wa.me/91${o.userPhone.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`, '_blank');
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
async function delProduct(id) { if (await showConfirm("Delete?")) db.collection("products").doc(id).delete(); }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }
// FIX: Toggle Overlay with Sidebar
function toggleSidebar() {
    const sb = document.getElementById('sidebar');
    const ov = document.getElementById('sidebar-overlay');
    sb.classList.toggle('active');

    if (sb.classList.contains('active')) {
        if (ov) ov.style.display = 'block';
    } else {
        if (ov) ov.style.display = 'none';
    }
}
function switchView(v) {
    console.log("Switching view to:", v);
    // 1. Hide all sections
    document.querySelectorAll('.view-section').forEach(e => {
        e.style.display = 'none';
        e.classList.remove('active');
    });

    // 2. Deactivate all nav links
    document.querySelectorAll('.nav-links a').forEach(e => e.classList.remove('active'));

    // 3. Show target section
    const targetSection = document.getElementById('view-' + v);
    if (targetSection) {
        targetSection.style.display = 'block';
        targetSection.classList.add('active');
    } else {
        console.error("View not found:", v);
        return;
    }

    const targetNav = document.getElementById('nav-' + v);
    if (targetNav) targetNav.classList.add('active');

    const titleEl = document.getElementById('page-title');
    if (titleEl) titleEl.innerText = v === 'pos' ? 'New Order (POS)' : v.charAt(0).toUpperCase() + v.slice(1);

    // Mobile fix
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
        sidebar.classList.remove('active');
        // FIX: Also hide overlay
        const ov = document.getElementById('sidebar-overlay');
        if (ov) ov.style.display = 'none';
    }

    // Load data
    if (v === 'orders') loadOrders();
    if (v === 'pos' && typeof renderPosProducts === 'function') renderPosProducts();
    if (v === 'reviews' && typeof loadReviews === 'function') loadReviews();
}

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
        document.getElementById('p-featured').checked = p.isFeatured || false;
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
        if (name && price) vs.push({ weight: name, price: price, inStock: inStock });
    });
    if (vs.length === 0) vs.push({ weight: 'Standard', price: 0, inStock: true });
    const activeVariants = vs.filter(v => v.inStock);
    const basePrice = activeVariants.length > 0 ? Math.min(...activeVariants.map(v => v.price)) : (vs[0].price || 0);

    const logEntry = {
        productId: id,
        productName: document.getElementById('p-name').value,
        action: 'Update/Edit',
        updatedBy: 'Admin',
        timestamp: new Date()
    };
    db.collection("inventory_logs").add(logEntry);

    db.collection("products").doc(id).set({
        id: parseInt(id) || id,
        name: document.getElementById('p-name').value,
        nameHi: document.getElementById('p-nameHi').value,
        category: document.getElementById('p-category').value,
        image: document.getElementById('p-image').value,
        in_stock: document.getElementById('p-stock').checked,
        bestseller: document.getElementById('p-bestseller').checked,
        variants: vs,
        price: basePrice,
        isFeatured: document.getElementById('p-featured').checked
    }, { merge: true }).then(() => closeModal('product-modal'));
}

function handleFileUpload(input) {
    const file = input.files[0];
    if (!file) return;

    if (!confirm("This will overwrite/update products. Continue?")) {
        input.value = ''; // Reset
        return;
    }

    const reader = new FileReader();
    reader.onload = async function (e) {
        const text = e.target.result;
        await processCSV(text);
        input.value = ''; // Reset for next use
    };
    reader.readAsText(file);
}

async function processCSV(csvText) {
    try {
        const rows = csvText.split("\n").slice(1); // Skip header
        const batch = db.batch();
        let count = 0;

        rows.forEach(rw => {
            if (!rw.trim()) return;
            // Handle CSV parsing (simple regex for quotes)
            const c = rw.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g).map(x => x.replace(/^"|"$/g, ''));

            const id = c[0];
            if (!id || id === '999') return;

            // ... (Keep your existing parsing logic for variants/prices) ...
            let v = [], rp = c[3];
            if (rp.includes('|')) rp.split('|').forEach(x => { let [s, p] = x.split('='); if (s) v.push({ weight: s.trim(), price: parseInt(p) }) });
            else v.push({ weight: 'Standard', price: parseInt(rp) || 0 });

            const docRef = db.collection("products").doc(id);
            batch.set(docRef, {
                id: parseInt(id),
                name: c[1],
                nameHi: c[2] || '',
                price: Math.min(...v.map(z => z.price)),
                variants: v,
                desc: c[4] || '',
                category: c[6] || 'other',
                image: c[7] || '',
                in_stock: (c[10] && c[10].toUpperCase() === 'TRUE')
            }, { merge: true });

            count++;
        });

        await batch.commit();
        showToast(`Successfully imported ${count} products`, "success");
    } catch (e) {
        console.error(e);
        showToast("Error parsing CSV: " + e.message, "error");
    }
}

async function importFromSheet() {
    if (!await showConfirm("Overwrite product data?")) return;
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
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function registerAdminServiceWorker() {
    if ('serviceWorker' in navigator && (window.location.protocol === 'http:' || window.location.protocol === 'https:')) {
        navigator.serviceWorker.register('/admin-sw.js').then(reg => {
            console.log('Admin SW Registered');
            reg.onupdatefound = () => {
                const newWorker = reg.installing;
                newWorker.onstatechange = () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        if (confirm("New Admin Dashboard version available! Refresh now?")) window.location.reload();
                    }
                };
            };
        }).catch(err => console.log("Admin SW Failed:", err));
    }
}

function printPackingSlip(docId) {
    const order = state.orders.data.find(o => o.docId === docId);
    if (!order) return;
    const itemsHtml = order.items.map(i => `<tr><td style="padding:5px; border-bottom:1px solid #eee;">${i.name} <br><small>${i.weight}</small></td><td style="padding:5px; border-bottom:1px solid #eee; text-align:center;">${i.qty}</td></tr>`).join('');
    const slipWindow = window.open('', '_blank', 'width=400,height=600');
    slipWindow.document.write(`<html><head><title>Slip #${order.id}</title><style>body { font-family: monospace; padding: 20px; max-width: 300px; margin: 0 auto; } h2 { margin: 0 0 10px; text-align: center; border-bottom: 2px dashed #000; padding-bottom: 10px; } .meta { margin-bottom: 15px; font-size: 0.9rem; } table { width: 100%; border-collapse: collapse; margin-bottom: 20px; } .footer { text-align: center; margin-top: 20px; font-size: 0.8rem; border-top: 2px dashed #000; padding-top: 10px; }</style></head><body><h2>NAMO NAMKEEN</h2><div class="meta"><strong>Order:</strong> #${order.id}<br><strong>Date:</strong> ${new Date(order.timestamp.seconds * 1000).toLocaleDateString()}<br><br><strong>Customer:</strong> ${order.userName}<br><strong>Phone:</strong> ${order.userPhone}<br><strong>Address:</strong><br> ${order.userAddress}</div><table><thead><tr style="border-bottom:2px solid #000;"><th style="text-align:left;">Item</th><th>Qty</th></tr></thead><tbody>${itemsHtml}</tbody></table><h3 style="text-align:right;">Total: ₹${order.total}</h3><div style="text-align:center;">[ ${order.paymentMethod} ]</div><div class="footer">Thank you for your order!<br>www.namonamkeen.shop</div><script>window.print(); window.onafterprint = function(){ window.close(); }</script></body></html>`);
    slipWindow.document.close();
}

function toggleAllOrders(source) {
    const checkboxes = document.querySelectorAll('.order-check');
    checkboxes.forEach(c => c.checked = source.checked);
    updateBulkUI();
}

function updateBulkUI() {
    const checked = document.querySelectorAll('.order-check:checked');
    const toolbar = document.getElementById('bulk-toolbar');
    const countSpan = document.getElementById('selected-count');
    if (checked.length > 0) { toolbar.classList.add('active'); countSpan.innerText = `${checked.length} Selected`; }
    else { toolbar.classList.remove('active'); }
}

async function bulkUpdateStatus(newStatus) {
    const checked = document.querySelectorAll('.order-check:checked');
    if (checked.length === 0) return;
    if (!await showConfirm(`Mark ${checked.length} orders as ${newStatus}?`)) return;
    const batch = db.batch();
    checked.forEach(c => { const docRef = db.collection("orders").doc(c.value); batch.update(docRef, { status: newStatus }); });
    batch.commit().then(() => { showToast("Bulk Update Successful", "success"); document.querySelectorAll('.order-check').forEach(c => c.checked = false); updateBulkUI(); }).catch(err => showToast("Error: " + err.message));
}

function bulkPrintSlips() {
    const checked = document.querySelectorAll('.order-check:checked');
    if (checked.length === 0) return;
    showToast("Printing " + checked.length + " slips...", "success");
    checked.forEach(c => printPackingSlip(c.value));
}

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

// --- POS LOGIC ---
function addToAdminCart(id, name, price, weight, image) {
    vibrate(50);

    // FIX: Generate a unique ID based on Product ID AND Weight
    const uniqueKey = `${id}-${weight}`;

    const existing = adminCart.find(i => i.uniqueKey === uniqueKey);

    if (existing) {
        existing.qty++;
        showToast(`Updated: ${name} (+1)`, "success");
    } else {
        adminCart.push({
            uniqueKey: uniqueKey, // Store the key
            productId: id,
            name: name,
            price: parseInt(price),
            weight: weight,
            image: image,
            qty: 1
        });
        showToast(`Added: ${name}`, "success");
    }

    renderAdminCart();
}

function addToAdminCart(id, name, price, weight, image) {
    vibrate(50); // <--- TACTILE FEEDBACK

    const existing = adminCart.find(i => i.productId == id);
    if (existing) {
        existing.qty++;
        showToast(`Updated: ${name} (+1)`, "success"); // Optional: Small toast
    } else {
        adminCart.push({
            productId: id,
            name: name,
            price: parseInt(price),
            weight: weight,
            image: image,
            qty: 1
        });
        showToast(`Added: ${name}`, "success");
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
                <div style="font-weight:600; font-size:0.9rem;">${item.name}</div>
                <div style="font-size:0.8rem; color:#666;">₹${item.price} x ${item.qty}</div>
            </div>
            
            <div class="pos-cart-controls">
                <button class="pos-qty-btn" onclick="updatePosQty(${idx}, -1)">-</button>
                <span style="font-weight:600; font-size:0.9rem; min-width:15px; text-align:center;">${item.qty}</span>
                <button class="pos-qty-btn" onclick="updatePosQty(${idx}, 1)">+</button>
            </div>
            
            <div style="font-weight:bold; margin-left:15px; min-width:50px; text-align:right; font-size:0.95rem;">
                ₹${item.price * item.qty}
            </div>
        </div>`;
    });

    if (adminCart.length === 0) {
        list.innerHTML = `
            <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; color:#999;">
                <i class="fas fa-shopping-basket" style="font-size:2rem; margin-bottom:10px; opacity:0.3;"></i>
                <p>Cart is Empty</p>
            </div>`;
    }

    document.getElementById('pos-total-display').innerText = `₹${total.toLocaleString('en-IN')}`;
    list.scrollTop = list.scrollHeight;
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
    const uid = `guest_${phone}`;
    if (!name || !phone) return showToast("Enter Name & Phone", "error");
    if (adminCart.length === 0) return showToast("Cart Empty", "error");
    const total = adminCart.reduce((sum, i) => sum + (i.price * i.qty), 0);
    // Generates a 6-character ID like "7X9-A2B"
    const generateShortId = () => {
        const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
        let result = '';
        for (let i = 0; i < 6; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result.slice(0, 3) + '-' + result.slice(3);
    };

    const orderId = 'ORD-' + generateShortId();
    try {
        const userSnapshot = await db.collection("users").where("phone", "==", phone).limit(1).get();
        if (!userSnapshot.empty) {
            uid = userSnapshot.docs[0].id; // Use existing User ID
        }
        const batch = db.batch();
        batch.set(db.collection("orders").doc(orderId), {
            id: orderId, userId: uid, userName: name, userPhone: phone, userAddress: address,
            items: adminCart, total: total, status: status, paymentMethod: 'Cash/UPI (POS)', paymentStatus: 'Paid', timestamp: new Date(), source: 'Admin POS'
        });
        batch.set(db.collection("users").doc(uid), { name: name, phone: phone, address: address, lastOrder: new Date(), type: 'POS Customer' }, { merge: true });
        await batch.commit();
        showToast("Order Placed!", "success");
        adminCart = []; renderAdminCart(); document.getElementById('pos-name').value = ''; document.getElementById('pos-phone').value = '';
        switchView('orders');
    } catch (e) { console.error(e); showToast("Error: " + e.message, "error"); }
}

async function adminCancelOrder(docId) {
    if (!await showConfirm("Mark Cancelled/Spam?")) return;
    try {
        await db.collection("orders").doc(docId).update({ status: "Cancelled", cancelledBy: "Admin", cancelledAt: new Date() });
        showToast("Order Cancelled", "success");
    } catch (e) { showToast("Error: " + e.message); }
}

// --- CONFIRMATION HELPER (ADMIN SIDE) ---
function showConfirm(message) {
    return new Promise((resolve) => {
        if (!document.getElementById('custom-confirm-modal')) {
            const modalHtml = `<div id="custom-confirm-modal" class="modal-overlay"><div class="confirm-box"><h3 style="margin-bottom:10px;">Confirm Action</h3><p id="custom-confirm-msg" style="color:#666;"></p><div class="confirm-actions"><button id="btn-confirm-no" class="btn-confirm-no">Cancel</button><button id="btn-confirm-yes" class="btn-confirm-yes">Yes, Proceed</button></div></div></div>`;
            document.body.insertAdjacentHTML('beforeend', modalHtml);
        }
        document.getElementById('custom-confirm-msg').innerText = message;
        const modal = document.getElementById('custom-confirm-modal');
        modal.style.display = 'flex';
        const btnYes = document.getElementById('btn-confirm-yes');
        const btnNo = document.getElementById('btn-confirm-no');
        const newYes = btnYes.cloneNode(true); const newNo = btnNo.cloneNode(true);
        btnYes.parentNode.replaceChild(newYes, btnYes); btnNo.parentNode.replaceChild(newNo, btnNo);
        newYes.onclick = () => { modal.style.display = 'none'; resolve(true); };
        newNo.onclick = () => { modal.style.display = 'none'; resolve(false); };
    });
}

// --- PWA INSTALL ---
let adminPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); adminPrompt = e;
    const btn = document.getElementById('admin-install-btn');
    if (btn) {
        btn.style.display = 'flex';
        btn.onclick = () => {
            btn.style.display = 'none'; adminPrompt.prompt();
            adminPrompt.userChoice.then((r) => { if (r.outcome === 'accepted') console.log('Installed'); adminPrompt = null; });
        };
    }
});

let searchTimeout;
function debouncedPosSearch() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => { renderPosProducts(); }, 300);
}

// 1. Add Vibrate Helper (if not already there)
function vibrate(ms) {
    if (navigator.vibrate) navigator.vibrate(ms);
}

// In admin.js

// 1. Add this new function
async function performGlobalSearch() {
    const query = document.getElementById('order-search').value.trim();

    // If empty, reload default view (recent 20)
    if (!query) {
        loadOrders();
        return;
    }

    showToast("Searching server...", "neutral");

    try {
        let results = [];

        // Strategy 1: Search by Exact Order ID (e.g., "ORD-123456")
        const idSnap = await db.collection("orders").where("id", "==", query).get();
        idSnap.forEach(doc => { let d = doc.data(); d.docId = doc.id; results.push(d); });

        // Strategy 2: If no ID found, Search by Phone Number
        if (results.length === 0) {
            // Note: This requires the phone number to match exactly how it's stored
            const phoneSnap = await db.collection("orders").where("userPhone", "==", query).get();
            phoneSnap.forEach(doc => { let d = doc.data(); d.docId = doc.id; results.push(d); });
        }

        if (results.length > 0) {
            state.orders.data = results; // Replace current table data with search results
            state.orders.filteredData = null;
            state.orders.page = 1;
            renderTable('orders');
            showToast(`Found ${results.length} orders.`, "success");
        } else {
            showToast("No matching order found in database.", "error");
        }
    } catch (e) {
        console.error(e);
        showToast("Search failed: " + e.message, "error");
    }
}

// 2. BIND THE ENTER KEY (Add this listener at the bottom of admin.js)
const orderSearchInput = document.getElementById('order-search');
if (orderSearchInput) {
    orderSearchInput.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            performGlobalSearch();
        }
    });
}

// 2. Bind 'Enter' key to this function
document.getElementById('order-search').addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
        performGlobalSearch();
    }
});

// --- STORE CONFIGURATION FUNCTIONS (Add this to admin.js) ---

function loadStoreConfig() {
    // 1. Load General Store Config
    db.collection("settings").doc("config").get().then(doc => {
        if (doc.exists) {
            const data = doc.data();
            if (document.getElementById('conf-phone')) document.getElementById('conf-phone').value = data.adminPhone || '';
            if (document.getElementById('conf-upi')) document.getElementById('conf-upi').value = data.upiId || '';
            if (document.getElementById('conf-del-charge')) document.getElementById('conf-del-charge').value = data.deliveryCharge || '';
            if (document.getElementById('conf-free-ship')) document.getElementById('conf-free-ship').value = data.freeShippingThreshold || '';
        }
    }).catch(err => console.log("Config load error (first run?):", err));

    // 2. Load Layout/Banner Config
    db.collection("settings").doc("layout").get().then(doc => {
        if (doc.exists) {
            const data = doc.data();
            if (data.banners && Array.isArray(data.banners)) {
                document.getElementById('banner-container').innerHTML = ''; // Clear default
                data.banners.forEach(url => addBannerInput(url));
            } else if (data.heroImage) {
                addBannerInput(data.heroImage); // Fallback for old single image
            } else {
                addBannerInput(); // Empty start
            }
            if (data.heroTitle) document.getElementById('layout-title').value = data.heroTitle;
            if (data.heroSubtitle) document.getElementById('layout-subtitle').value = data.heroSubtitle;
        }
    });
}

function addBannerInput(value = '') {
    const container = document.getElementById('banner-container');
    const div = document.createElement('div');
    div.className = 'banner-row';
    div.style.cssText = "display:flex; gap:10px; margin-bottom:10px;";
    div.innerHTML = `
        <input type="text" class="form-control banner-url" placeholder="Image URL (1920x600)" value="${value}">
        <button class="btn btn-danger" onclick="this.parentElement.remove()">X</button>
    `;
    container.appendChild(div);
}

function saveStoreConfig() {
    const adminPhone = document.getElementById('conf-phone').value.trim();
    const upiId = document.getElementById('conf-upi').value.trim();
    const deliveryCharge = parseFloat(document.getElementById('conf-del-charge').value) || 0;
    const freeShippingThreshold = parseFloat(document.getElementById('conf-free-ship').value) || 0;

    db.collection("settings").doc("config").set({
        adminPhone,
        upiId,
        deliveryCharge,
        freeShippingThreshold
    }, { merge: true })
        .then(() => showToast("Store Config Saved", "success"))
        .catch(err => showToast("Error: " + err.message, "error"));
}

function saveLayoutConfig() {
    const banners = [];
    document.querySelectorAll('.banner-url').forEach(input => {
        if (input.value.trim()) banners.push(input.value.trim());
    });

    const heroTitle = document.getElementById('layout-title').value.trim();
    const heroSubtitle = document.getElementById('layout-subtitle').value.trim();

    db.collection("settings").doc("layout").set({
        banners, heroTitle, heroSubtitle
    }, { merge: true })
        .then(() => showToast("Layout Updated", "success"));
}

let soundEnabled = false;
const orderSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');

function enableSound() {
    // Attempt to play and immediately pause to unlock AudioContext
    orderSound.play().then(() => {
        orderSound.pause();
        orderSound.currentTime = 0;
        soundEnabled = true;

        // Update Button UI
        const btn = document.getElementById('sound-btn');
        if (btn) {
            btn.innerHTML = '<i class="fas fa-volume-up"></i> Sound On';
            btn.classList.remove('btn-outline');
            btn.classList.add('btn-green');
            // Optional: Hide button after enabling if you prefer
            // btn.style.display = 'none'; 
        }
        showToast("Order Notifications Enabled", "success");
    }).catch(e => {
        console.log("Audio unlock failed", e);
        showToast("Could not enable sound", "error");
    });
}

// --- CUSTOMER VIEW LOGIC (Missing Function) ---
function viewCustomer(uid) {
    const u = state.customers.data.find(x => x.uid === uid);
    if (!u) return;

    // Show loading state
    const content = document.getElementById('cust-profile-content');
    content.innerHTML = '<p style="text-align:center; padding:20px;">Loading customer history...</p>';
    document.getElementById('customer-modal').style.display = 'flex';

    // Fetch orders for this user
    db.collection("orders")
        .where("userId", "==", uid)
        .orderBy("timestamp", "desc")
        .limit(20)
        .get()
        .then(snap => {
            let totalSpent = 0;
            let ordersHtml = '';

            if (snap.empty) {
                ordersHtml = '<p style="color:#666; text-align:center; padding:10px;">No orders found for this customer.</p>';
            } else {
                ordersHtml = '<table style="width:100%; border-collapse:collapse; margin-top:10px;"><thead><tr style="background:#f9f9f9; text-align:left;"><th style="padding:8px; font-size:0.85rem;">Date</th><th style="padding:8px; font-size:0.85rem;">Order ID</th><th style="padding:8px; font-size:0.85rem;">Total</th></tr></thead><tbody>';

                snap.forEach(doc => {
                    const o = doc.data();
                    totalSpent += o.total;
                    const date = o.timestamp ? new Date(o.timestamp.seconds * 1000).toLocaleDateString() : '-';

                    ordersHtml += `
                    <tr>
                        <td style="padding:8px; border-bottom:1px solid #eee; font-size:0.9rem;">${date}</td>
                        <td style="padding:8px; border-bottom:1px solid #eee; font-size:0.9rem;">#${o.id}</td>
                        <td style="padding:8px; border-bottom:1px solid #eee; font-weight:bold; font-size:0.9rem;">₹${o.total}</td>
                    </tr>
                `;
                });
                ordersHtml += '</tbody></table>';
            }

            // Build Profile HTML
            const lastLogin = u.lastLogin ? (u.lastLogin.seconds ? new Date(u.lastLogin.seconds * 1000).toLocaleDateString() : new Date(u.lastLogin).toLocaleDateString()) : 'Never';
            const initial = u.name ? u.name.charAt(0).toUpperCase() : 'U';

            const html = `
            <div style="display:flex; gap:20px; align-items:center; margin-bottom:20px; padding-bottom:20px; border-bottom:1px solid #eee;">
                <div style="width:60px; height:60px; background:#e85d04; color:white; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:1.5rem; font-weight:bold;">
                    ${initial}
                </div>
                <div>
                    <h2 style="margin:0; color:var(--dark); font-size:1.4rem;">${u.name || 'Guest User'}</h2>
                    <p style="margin:2px 0; color:#666; font-size:0.9rem;">${u.email || ''}</p>
                    <p style="margin:0; color:#666; font-size:0.9rem;">${u.phone || 'No Phone'}</p>
                </div>
                <div style="margin-left:auto; text-align:right;">
                    <div style="font-size:0.8rem; color:#888;">Lifetime Value</div>
                    <div style="font-size:1.4rem; font-weight:bold; color:#27ae60;">₹${totalSpent.toLocaleString()}</div>
                </div>
            </div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px; margin-bottom:20px;">
                <div style="background:#f9fafb; padding:15px; border-radius:8px;">
                    <strong style="display:block; font-size:0.75rem; color:#888; text-transform:uppercase;">Address</strong>
                    <div style="margin-top:5px; font-size:0.9rem;">${u.address || 'No Address Saved'}</div>
                </div>
                <div style="background:#f9fafb; padding:15px; border-radius:8px;">
                    <strong style="display:block; font-size:0.75rem; color:#888; text-transform:uppercase;">Last Active</strong>
                    <div style="margin-top:5px; font-size:0.9rem;">${lastLogin}</div>
                </div>
            </div>

            <h4 style="margin-bottom:10px; border-bottom:2px solid #eee; padding-bottom:5px;">Recent Orders</h4>
            <div style="max-height:250px; overflow-y:auto;">
                ${ordersHtml}
            </div>
        `;

            content.innerHTML = html;
        }).catch(err => {
            console.error(err);
            content.innerHTML = '<p style="color:red; text-align:center;">Failed to load customer details.</p>';
        });
}

// --- ADD THIS TO THE BOTTOM OF admin.js ---

function renderPosProducts() {
    const grid = document.getElementById('pos-grid');
    if (!grid) return;

    grid.innerHTML = '';
    const query = document.getElementById('pos-search').value.toLowerCase().trim();

    // Use the inventory data already loaded in the 'state' object
    const products = state.inventory.data || [];

    const filtered = products.filter(p => {
        const name = (p.name || '').toLowerCase();
        const id = String(p.id).toLowerCase();
        return name.includes(query) || id.includes(query);
    });

    if (filtered.length === 0) {
        grid.innerHTML = '<p style="color:#999; text-align:center; width:100%;">No products found</p>';
        return;
    }

    filtered.forEach(p => {
        // Determine Price & Weight (Default to first variant or base price)
        let price = p.price;
        let weight = 'Std';

        if (p.variants && p.variants.length > 0) {
            // Find first in-stock variant or just the first one
            const v = p.variants.find(v => v.inStock !== false) || p.variants[0];
            price = v.price;
            weight = v.weight;
        }

        const img = p.image || 'logo.jpg';
        // Sanitize name for the onclick handler to prevent syntax errors
        const safeName = p.name.replace(/'/g, "\\'");

        grid.innerHTML += `
            <div class="pos-card" onclick="addToAdminCart('${p.id}', '${safeName}', ${price}, '${weight}', '${img}')">
                <div class="pos-card-img-wrap">
                    <img src="${img}" onerror="this.src='logo.jpg'" loading="lazy">
                </div>
                <div class="pos-card-info">
                    <h4>${p.name}</h4>
                    <div class="pos-meta">
                        <span class="pos-weight">${weight}</span>
                        <span class="pos-price">₹${price}</span>
                    </div>
                </div>
            </div>
        `;
    });
}


function viewLogs() {
    const con = document.getElementById('logs-body');
    con.innerHTML = 'Loading...';
    document.getElementById('logs-modal').style.display = 'flex';

    db.collection("inventory_logs").orderBy("timestamp", "desc").limit(20).get().then(snap => {
        con.innerHTML = '';
        snap.forEach(doc => {
            const l = doc.data();
            const time = l.timestamp.toDate().toLocaleString();
            con.innerHTML += `<div style="border-bottom:1px solid #eee; padding:10px;">
                <strong>${l.productName}</strong> <span style="font-size:0.8rem; color:#888;">${time}</span><br>
                ${l.action}
            </div>`;
        });
    });
}

async function markOrderPaid(docId) {
    if (!await showConfirm("Confirm payment received for this order?")) return;

    db.collection("orders").doc(docId).update({
        paymentStatus: 'Paid',
        paymentDate: new Date()
    }).then(() => {
        showToast("Payment status updated", "success");
    }).catch(err => showToast("Error: " + err.message, "error"));
}

async function exportAllOrders() {
    if (!await showConfirm("Download FULL order history? This may take time.")) return;

    showToast("Fetching all data...", "neutral");

    try {
        let allOrders = [];
        let lastDoc = null;
        let hasMore = true;

        while (hasMore) {
            let ref = db.collection("orders").orderBy("timestamp", "desc").limit(500);
            if (lastDoc) ref = ref.startAfter(lastDoc);

            const snap = await ref.get();
            if (snap.empty) {
                hasMore = false;
            } else {
                lastDoc = snap.docs[snap.docs.length - 1];
                snap.forEach(doc => allOrders.push(doc.data()));
                showToast(`Fetched ${allOrders.length} records...`, "neutral");
            }
        }

        // Generate CSV
        let csv = "Date,Order ID,Customer,Phone,Address,Items,Total,Payment,Status\n";
        allOrders.forEach(o => {
            const d = o.timestamp ? new Date(o.timestamp.seconds * 1000).toLocaleDateString() : '-';
            const addr = o.userAddress ? o.userAddress.replace(/"/g, '""').replace(/\n/g, ' ') : "";
            const items = o.items ? o.items.map(i => `${i.name} (${i.qty})`).join(' | ') : "";

            csv += `"${d}","${o.id}","${escapeHtml(o.userName)}","${o.userPhone}","${addr}","${items}",${o.total},"${o.paymentMethod}",${o.status}\n`;
        });

        downloadCSV(csv, "FULL_Namo_Orders.csv");
        showToast("Export Complete!", "success");

    } catch (e) {
        console.error(e);
        showToast("Export failed: " + e.message, "error");
    }
}

// --- BLOG CMS LOGIC ---
function loadBlogCMS() {
    const container = document.getElementById('blog-list');
    db.collection("blogs").orderBy("date", "desc").get().then(snap => {
        container.innerHTML = '';
        snap.forEach(doc => {
            const b = doc.data();
            container.innerHTML += `
            <div style="display:flex; justify-content:space-between; border-bottom:1px solid #eee; padding:10px;">
                <div><strong>${b.title}</strong><br><small>${b.date.toDate().toLocaleDateString()}</small></div>
                <div>
                    <button class="btn btn-blue btn-sm" onclick="editBlog('${doc.id}')">Edit</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteBlog('${doc.id}')">Del</button>
                </div>
            </div>`;
        });
    });
}

function openBlogEditor() {
    document.getElementById('blog-id').value = '';
    document.getElementById('blog-title').value = '';
    document.getElementById('blog-image-file').value = ''; // Clear file input
    document.getElementById('blog-image-base64').value = ''; // Clear hidden data
    document.getElementById('blog-content').value = '';
    document.getElementById('blog-editor-modal').style.display = 'flex';
}

function editBlog(id) {
    db.collection("blogs").doc(id).get().then(doc => {
        const b = doc.data();
        document.getElementById('blog-id').value = id;
        document.getElementById('blog-title').value = b.title;
        // Load existing image into hidden field so we don't lose it if we don't upload a new one
        document.getElementById('blog-image-base64').value = b.image || ''; 
        document.getElementById('blog-content').value = b.content;
        document.getElementById('blog-editor-modal').style.display = 'flex';
        
        // Reset file input
        document.getElementById('blog-image-file').value = ''; 
    });
}

function saveBlogPost() {
    const id = document.getElementById('blog-id').value;
    
    const data = {
        title: document.getElementById('blog-title').value,
        // Use the hidden Base64 value
        image: document.getElementById('blog-image-base64').value, 
        content: document.getElementById('blog-content').value,
        date: new Date()
    };
    
    const ref = id ? db.collection("blogs").doc(id) : db.collection("blogs").doc();
    ref.set(data, { merge: true }).then(() => {
        closeModal('blog-editor-modal');
        loadBlogCMS();
        showToast("Blog Published", "success");
    });
}

async function deleteBlog(id) {
    if (await showConfirm("Delete post?")) {
        await db.collection("blogs").doc(id).delete();
        loadBlogCMS();
    }
}

function loadFinance() {
    // 1. Calculate Revenue (From Orders)
    // Note: In a real app, optimize this to not read ALL orders every time.
    db.collection("orders").where("status", "!=", "Cancelled").get().then(snap => {
        let revenue = 0;
        snap.forEach(d => revenue += d.data().total);
        document.getElementById('fin-revenue').innerText = '₹' + revenue.toLocaleString();
        calculateProfit(revenue);
    });

    // 2. Load Expenses
    db.collection("expenses").orderBy("date", "desc").onSnapshot(snap => {
        let expense = 0;
        const tbody = document.getElementById('expense-body');
        tbody.innerHTML = '';

        snap.forEach(doc => {
            const e = doc.data();
            expense += parseFloat(e.amount);
            tbody.innerHTML += `<tr><td>${e.date.toDate().toLocaleDateString()}</td><td>${e.desc}</td><td>${e.category}</td><td style="color:red">-₹${e.amount}</td></tr>`;
        });

        document.getElementById('fin-expense').innerText = '₹' + expense.toLocaleString();
        calculateProfit(null, expense);
    });
}

let globalRev = 0, globalExp = 0;
function calculateProfit(rev, exp) {
    if (rev !== null) globalRev = rev;
    if (exp !== null) globalExp = exp;
    const profit = globalRev - globalExp;
    const el = document.getElementById('fin-profit');
    el.innerText = '₹' + profit.toLocaleString();
    el.style.color = profit >= 0 ? 'green' : 'red';
}

function saveExpense() {
    const desc = document.getElementById('exp-desc').value;
    const cat = document.getElementById('exp-cat').value;
    const amt = parseFloat(document.getElementById('exp-amt').value);

    if (!desc || !amt) return showToast("Invalid Data", "error");

    db.collection("expenses").add({
        desc, category: cat, amount: amt, date: new Date()
    }).then(() => {
        closeModal('expense-modal');
        showToast("Expense Added", "success");
    });
}

async function calculateSegments() {
    showToast("Analyzing customer data...", "neutral");
    const usersSnap = await db.collection("users").get();

    const batch = db.batch();
    let count = 0;

    for (const doc of usersSnap.docs) {
        const u = doc.data();

        // Calculate Total Spend (You might need to query orders for this user if not stored in user doc)
        const ordersSnap = await db.collection("orders").where("userId", "==", doc.id).get();
        let totalSpend = 0;
        ordersSnap.forEach(o => {
            if (o.data().status !== 'Cancelled') totalSpend += o.data().total
        });

        let segment = 'Regular';
        if (totalSpend > 5000) segment = 'Gold';
        else if (totalSpend > 2000) segment = 'Silver';

        if (u.segment !== segment) {
            batch.update(doc.ref, { segment: segment, totalLifetimeSpend: totalSpend });
            count++;
        }
    }

    await batch.commit();
    showToast(`Updated ${count} customer segments!`, "success");
    loadCustomers(); // Refresh table
}

registerAdminServiceWorker();