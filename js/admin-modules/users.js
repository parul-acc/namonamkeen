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
