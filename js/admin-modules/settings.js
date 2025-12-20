import { db } from './firebase-init.js';
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { showToast } from './utils.js';

export function loadSettings() {
    getDoc(doc(db, "settings", "config")).then(docSnap => {
        if (docSnap.exists()) {
            const d = docSnap.data();
            if (d.adminPhone) document.getElementById('conf-phone').value = d.adminPhone;
            if (d.upiId) document.getElementById('conf-upi').value = d.upiId;
            if (d.deliveryCharge) document.getElementById('conf-del-charge').value = d.deliveryCharge;
            if (d.freeShippingThreshold) document.getElementById('conf-free-ship').value = d.freeShippingThreshold;
            if (d.minOrder) document.getElementById('conf-min-order').value = d.minOrder;
            if (d.vapidKey) document.getElementById('conf-vapid').value = d.vapidKey;
        }
    });

    getDoc(doc(db, "settings", "announcement")).then(docSnap => {
        if (docSnap.exists()) {
            const d = docSnap.data();
            document.getElementById('setting-announce').value = d.text || '';
            document.getElementById('setting-announce-active').value = d.active ? 'true' : 'false';
        }
    });
}

export function saveStoreConfig() {
    const data = {
        adminPhone: document.getElementById('conf-phone').value,
        upiId: document.getElementById('conf-upi').value,
        deliveryCharge: parseFloat(document.getElementById('conf-del-charge').value),
        freeShippingThreshold: parseFloat(document.getElementById('conf-free-ship').value),
        minOrder: parseFloat(document.getElementById('conf-min-order').value),
        vapidKey: document.getElementById('conf-vapid').value
    };

    setDoc(doc(db, "settings", "config"), data, { merge: true })
        .then(() => showToast("Configuration Saved", "success"))
        .catch(e => showToast("Save Failed", "error"));
}

export function saveSettings() {
    const text = document.getElementById('setting-announce').value;
    const active = document.getElementById('setting-announce-active').value === 'true';

    setDoc(doc(db, "settings", "announcement"), {
        text, active, updatedAt: serverTimestamp()
    }).then(() => showToast("Announcement Updated", "success"));
}
