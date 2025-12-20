import { db } from './firebase-init.js';
import { collection, getDocs, doc, updateDoc, writeBatch, query, where, orderBy, limit, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { showToast, formatDate, safeCSV } from './utils.js';

let orders = [];
let currentOrderPage = 1;
const ITEMS_PER_PAGE = 20;

let orderFilterStatus = 'All';
let orderFilterStart = '';
let orderFilterEnd = '';
let orderSearch = '';

export function loadOrders() {
    const q = query(collection(db, "orders"), orderBy("timestamp", "desc"), limit(200));

    getDocs(q).then(snap => {
        orders = [];
        snap.forEach(doc => {
            const d = doc.data();
            d.id = doc.id;
            orders.push(d);
        });
        filterOrders();
    }).catch(e => {
        console.error(e);
        showToast("Error loading orders", "error");
    });
}
// ... Filtering and Table Rendering logic remains standard JS ...

export function filterOrders() {
    orderSearch = document.getElementById('order-search').value.toLowerCase();
    orderFilterStatus = document.getElementById('order-filter').value;
    orderFilterStart = document.getElementById('date-start').value;
    orderFilterEnd = document.getElementById('date-end').value;

    const filtered = orders.filter(o => {
        // Status
        if (orderFilterStatus !== 'All' && o.status !== orderFilterStatus) return false;

        // Search
        const term = orderSearch;
        const matches = (o.id && o.id.toLowerCase().includes(term)) ||
            (o.customerName && o.customerName.toLowerCase().includes(term)) ||
            (o.userPhone && o.userPhone.includes(term));
        if (term && !matches) return false;

        // Date Range
        if (orderFilterStart) {
            const d = o.timestamp.toDate();
            if (d < new Date(orderFilterStart)) return false;
        }
        if (orderFilterEnd) {
            const d = o.timestamp.toDate();
            const e = new Date(orderFilterEnd); e.setHours(23, 59, 59);
            if (d > e) return false;
        }

        return true;
    });

    renderOrderTable(filtered);
}

function renderOrderTable(items) {
    const start = (currentOrderPage - 1) * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;
    const pageItems = items.slice(start, end);

    const pending = items.filter(i => i.status === 'Pending').length;
    const packed = items.filter(i => i.status === 'Packed').length;
    const delivered = items.filter(i => i.status === 'Delivered').length;

    document.getElementById('ord-pending').innerText = pending;
    document.getElementById('ord-packed').innerText = packed;
    document.getElementById('ord-delivered').innerText = delivered;

    const tbody = document.getElementById('orders-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    pageItems.forEach(o => {
        const dateStr = formatDate(o.timestamp);
        let itemsHtml = '';
        if (o.items) {
            o.items.forEach(i => itemsHtml += `<div>${i.qty} x ${i.name} (${i.weight})</div>`);
        }

        const statusColors = {
            'Pending': 'badge-warning',
            'Packed': 'badge-blue',
            'Shipped': 'badge-purple',
            'Delivered': 'badge-success',
            'Cancelled': 'badge-danger'
        };

        tbody.innerHTML += `
            <tr onclick="window.adminApp.toggleSelection(this, '${o.id}')">
                <td><input type="checkbox" class="order-checkbox" value="${o.id}" onclick="event.stopPropagation()"></td>
                <td>
                    <b>${o.id}</b><br>
                    <small>${dateStr}</small>
                </td>
                <td>
                    <b>${o.customerName || 'Guest'}</b><br>
                    <a href="tel:${o.userPhone}">${o.userPhone}</a>
                </td>
                <td style="font-size:12px;">${itemsHtml}</td>
                <td>
                    ₹${o.total}<br>
                    <small>${o.paymentMethod} ${o.paymentVerified ? '✅' : ''}</small>
                </td>
                <td>
                    <span class="badge ${statusColors[o.status] || 'badge-secondary'}">${o.status}</span>
                </td>
                <td>
                    <select onchange="window.adminApp.updateStatus('${o.id}', this.value)" onclick="event.stopPropagation()">
                        <option value="" disabled selected>Action</option>
                        <option value="Packed">Packed</option>
                        <option value="Shipped">Shipped</option>
                        <option value="Delivered">Delivered</option>
                        <option value="Cancelled">Cancel</option>
                    </select>
                </td>
            </tr>
        `;
    });

    document.getElementById('orders-page-info').innerText = `Page ${currentOrderPage}`;
}

export function updateStatus(orderId, status) {
    if (!confirm(`Mark Order ${orderId} as ${status}?`)) return;

    updateDoc(doc(db, "orders", orderId), {
        status: status,
        updatedAt: serverTimestamp()
    }).then(() => {
        showToast(`Order Updated: ${status}`, "success");
        const ord = orders.find(o => o.id === orderId);
        if (ord) ord.status = status;
        filterOrders();
    });
}

export function bulkUpdateStatus(status) {
    const selected = getSelectedOrderIds();
    if (selected.length === 0) return showToast("No orders selected", "info");
    if (!confirm(`Mark ${selected.length} orders as ${status}?`)) return;

    const batch = writeBatch(db);
    selected.forEach(id => {
        const ref = doc(db, "orders", id);
        batch.update(ref, { status: status, updatedAt: serverTimestamp() });
    });

    batch.commit().then(() => {
        showToast("Bulk Update Success", "success");
        orders.forEach(o => { if (selected.includes(o.id)) o.status = status; });
        filterOrders();
        clearSelection();
    });
}

function getSelectedOrderIds() {
    const checkboxes = document.querySelectorAll('.order-checkbox:checked');
    return Array.from(checkboxes).map(cb => cb.value);
}

function clearSelection() {
    document.querySelectorAll('.order-checkbox').forEach(cb => cb.checked = false);
    document.getElementById('selected-count').innerText = "0 Selected";
}

export function toggleAllOrders(source) {
    document.querySelectorAll('.order-checkbox').forEach(cb => cb.checked = source.checked);
}
// Export logic
// Export logic
export function exportOrdersToCSV() {
    if (orders.length === 0) return showToast("No data", "info");

    let csv = "ID,Date,Name,Phone,Total,Payment,Status\n";
    orders.forEach(o => {
        csv += `${o.id},"${formatDate(o.timestamp)}","${o.customerName || ''}","${o.userPhone}",${o.total},${o.paymentMethod},${o.status}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orders_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
}

export function exportAllOrders() {
    alert("This would trigger a full database export. Feature pending server implementation.");
}

export function bulkPrintSlips() {
    const selected = getSelectedOrderIds();
    if (selected.length === 0) return showToast("Select orders to print", "info");

    const printOrders = orders.filter(o => selected.includes(o.id));
    // Open a new window and write HTML for printing
    const w = window.open('', '_blank');
    w.document.write('<html><head><title>Print Slips</title></head><body>');
    printOrders.forEach(o => {
        w.document.write(`
            <div style="border:1px solid #000; padding:20px; margin-bottom:20px; page-break-after:always;">
                <h2>Packing Slip: ${o.id}</h2>
                <p><strong>Customer:</strong> ${o.customerName}<br>Phone: ${o.userPhone}</p>
                <p><strong>Address:</strong> ${o.userAddress || o.addressDetails?.full || 'N/A'}</p>
                <p><strong>Items:</strong></p>
                <ul>
                    ${o.items.map(i => `<li>${i.qty} x ${i.name} (${i.weight})</li>`).join('')}
                </ul>
                <p><strong>Total:</strong> ₹${o.total} (${o.paymentMethod})</p>
            </div>
        `);
    });
    w.document.write('</body></html>');
    w.document.close();
    w.print();
}

export function changeOrderPage(diff) {
    currentOrderPage += diff;
    if (currentOrderPage < 1) currentOrderPage = 1;
    filterOrders();
}
export function toggleSelection(tr, id) {
    const cb = tr.querySelector('input[type="checkbox"]');
    if (cb) cb.checked = !cb.checked;
}
