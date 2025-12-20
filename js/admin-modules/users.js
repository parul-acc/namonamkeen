import { db } from './firebase-init.js';
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

let customers = [];

export function loadCustomers() {
    getDocs(collection(db, "users")).then(snap => {
        customers = [];
        snap.forEach(doc => {
            const d = doc.data();
            d.uid = doc.id;
            customers.push(d);
        });

        customers.forEach(c => c.totalSpent = c.totalSpent || 0);

        document.getElementById('cust-total').innerText = customers.length;
        renderCustomerRows(customers);
    });
}

function renderCustomerRows(list) {
    const tbody = document.getElementById('customers-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    list.slice(0, 50).forEach(c => {
        tbody.innerHTML += `
            <tr>
                <td>${c.name || 'N/A'}</td>
                <td>${c.phone || c.email || '-'}</td>
                <td style="font-size:12px; max-width:200px; overflow:hidden;">${c.address || '-'}</td>
                <td><span class="badge badge-secondary">${c.segment || 'New'}</span></td>
                <td>${c.lastLogin ? new Date(c.lastLogin.toDate()).toLocaleDateString() : '-'}</td>
                <td><a href="https://wa.me/${c.phone ? c.phone.replace('+', '') : ''}" target="_blank"><i class="fab fa-whatsapp text-green"></i></a></td>
            </tr>
        `;
    });
}

// --- MISSING FUNCTIONS ---

export function filterCustomers() {
    const q = document.getElementById('custSearch').value.toLowerCase();
    const filtered = customers.filter(c =>
        (c.name && c.name.toLowerCase().includes(q)) ||
        (c.phone && c.phone.includes(q)) ||
        (c.email && c.email.toLowerCase().includes(q))
    );
    renderCustomerRows(filtered);
}

export function exportCustomersToCSV() {
    if (customers.length === 0) return alert("No data to export");

    let csv = "Name,Phone,Email,Address,Segment,Total Spent\n";
    customers.forEach(c => {
        csv += `"${c.name || ''}","${c.phone || ''}","${c.email || ''}","${c.address || ''}","${c.segment || ''}","${c.totalSpent || 0}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `customers_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
}

export function calculateSegments() {
    // Placeholder for complex cloud function logic
    alert("Segment calculation requested. This runs on the server daily.");
}

export function viewLeaderboard() {
    // Basic sort by spend
    const top = [...customers].sort((a, b) => (b.totalSpent || 0) - (a.totalSpent || 0)).slice(0, 20);
    renderCustomerRows(top);
    document.getElementById('custSearch').value = ''; // Clear search when showing top 20
}
