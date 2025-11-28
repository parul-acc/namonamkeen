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
            alert("Access Denied. Admin Only.");
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
        alert("Failed to load customers. Check console.");
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
    if (!state.customers.data || state.customers.data.length === 0) return alert("No data to export");

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
    db.collection("orders").orderBy("timestamp", "desc").limit(200).onSnapshot(snap => {
        let pending = 0, packed = 0, delivered = 0;
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
    items.forEach(o => {
        const d = o.timestamp ? new Date(o.timestamp.seconds * 1000).toLocaleDateString() : '-';
        tbody.innerHTML += `
            <tr>
                <td>${d}<br><small>#${o.id}</small></td>
                <td><strong>${escapeHtml(o.userName)}</strong><br><small>${escapeHtml(o.userPhone)}</small></td>
                <td>₹${o.total}</td>
                <td>
                    <select class="status-select" onchange="setStatus('${o.docId}', this.value)">
                        <option ${o.status === 'Pending' ? 'selected' : ''}>Pending</option>
                        <option ${o.status === 'Packed' ? 'selected' : ''}>Packed</option>
                        <option ${o.status === 'Delivered' ? 'selected' : ''}>Delivered</option>
                    </select>
                </td>
                <td><button class="icon-btn btn-blue" onclick="viewOrder('${o.docId}')"><i class="fas fa-eye"></i></button></td>
            </tr>`;
    });
}

function filterOrdersByStatus() {
    const status = document.getElementById('order-filter').value;
    if (status === 'All') {
        state.orders.filteredData = null;
    } else {
        state.orders.filteredData = state.orders.data.filter(o => o.status === status);
    }
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

    if (!code || !value || !dateStr) return alert("Fill all fields");

    const expiryDate = new Date(dateStr);
    expiryDate.setHours(23, 59, 59);

    db.collection("coupons").add({ code, type, value: parseInt(value), expiryDate, isActive: true })
        .then(() => { alert("Coupon Created!"); document.getElementById('cpn-code').value = ''; })
        .catch(err => alert(err.message));
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

function viewOrder(id) {
    const o = state.orders.data.find(x => x.docId === id);
    let h = `<p><strong>Customer:</strong> ${escapeHtml(o.userName)} (${escapeHtml(o.userPhone)})</p><p><strong>Address:</strong> ${escapeHtml(o.userAddress)}</p><hr style="margin:10px 0;">`;
    o.items.forEach(i => h += `<div>${i.name} x ${i.qty}</div>`);
    if (o.discount) h += `<div style="color:green; margin-top:5px;">Discount: ${o.discount.code} Applied</div>`;
    h += `<h3 style="text-align:right">Total: ₹${o.total}</h3>`;
    document.getElementById('order-detail-content').innerHTML = h;
    document.getElementById('order-modal').style.display = 'flex';
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
    db.collection("settings").doc("announcement").set({ text, active }, { merge: true }).then(() => alert("Saved"));
}

function toggleStock(id, s) { db.collection("products").doc(id).update({ in_stock: s }); }
function delProduct(id) { if (confirm("Delete?")) db.collection("products").doc(id).delete(); }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }
function toggleSidebar() { document.getElementById('sidebar').classList.toggle('active'); }

function switchView(v) {
    document.querySelectorAll('.view-section').forEach(e => e.classList.remove('active'));
    document.querySelectorAll('.nav-links a').forEach(e => e.classList.remove('active'));
    document.getElementById('view-' + v).classList.add('active');
    document.getElementById('nav-' + v).classList.add('active');
    document.getElementById('page-title').innerText = v.charAt(0).toUpperCase() + v.slice(1);
    document.getElementById('sidebar').classList.remove('active');
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
        alert("Import Done");
    } catch (e) { alert("Import Failed: " + e.message); }
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
registerAdminServiceWorker();