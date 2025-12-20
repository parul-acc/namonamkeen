import { db } from './firebase-init.js';
import { collection, onSnapshot, orderBy, query, addDoc, deleteDoc, doc, serverTimestamp, Timestamp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { showToast, formatDate } from './utils.js';

export function loadCoupons() {
    const tbody = document.getElementById('coupons-body');
    if (!tbody) return;

    const q = query(collection(db, "coupons"), orderBy("createdAt", "desc"));
    onSnapshot(q, snap => {
        tbody.innerHTML = '';
        snap.forEach(docSnap => {
            const c = docSnap.data();
            const isExpired = c.expiryDate.toDate() < new Date();
            tbody.innerHTML += `
                <tr>
                    <td><b>${c.code}</b></td>
                    <td>${c.type === 'percent' ? c.value + '%' : '₹' + c.value}</td>
                    <td>${formatDate(c.expiryDate)}</td>
                    <td><span class="badge ${c.isActive && !isExpired ? 'badge-success' : 'badge-danger'}">
                        ${isExpired ? 'Expired' : (c.isActive ? 'Active' : 'Inactive')}
                    </span></td>
                    <td>
                        <button class="btn-icon text-red" onclick="window.adminApp.deleteCoupon('${docSnap.id}')"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>
            `;
        });
    });
}

export function saveCoupon() {
    const code = document.getElementById('cpn-code').value.toUpperCase();
    const type = document.getElementById('cpn-type').value;
    const val = parseFloat(document.getElementById('cpn-value').value);
    const min = parseFloat(document.getElementById('cpn-min').value);
    const date = document.getElementById('cpn-expiry').value;

    if (!code || !val || !date) return showToast("Fill all fields", "error");

    addDoc(collection(db, "coupons"), {
        code: code,
        type: type,
        value: val,
        minOrder: min || 0,
        expiryDate: Timestamp.fromDate(new Date(date)),
        isActive: true,
        createdAt: serverTimestamp()
    }).then(() => {
        showToast("Coupon Created", "success");
        document.getElementById('cpn-code').value = '';
    });
}

export function deleteCoupon(id) {
    if (confirm("Delete Coupon?")) {
        deleteDoc(doc(db, "coupons", id));
    }
}
