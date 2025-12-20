import { db } from './firebase-init.js';
import {
    collection,
    getDocs,
    getDoc,
    doc,
    onSnapshot,
    query,
    where,
    limit,
    setDoc,
    serverTimestamp,
    orderBy
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { showToast, dbg } from './utils.js';

export let products = [];
export let activeCoupons = [];
export let shopConfig = {};
export let userProfile = null;

const unsubscribeListeners = {};

// --- DATA FETCHING ---
export function fetchData(callbacks) {
    const { onProductsLoaded, onConfigLoaded, onCouponsLoaded } = callbacks || {};

    // 1. CACHE FIRST: Load immediately from LocalStorage
    const cached = localStorage.getItem('namo_products');
    let localVersion = 0;

    if (cached) {
        try {
            const parsed = JSON.parse(cached);
            products = parsed.items || [];
            localVersion = parsed.version || 0;
            if (products.length > 0 && onProductsLoaded) {
                console.log("⚡ Loaded from Cache");
                onProductsLoaded(products);
            }
        } catch (e) { console.warn("Cache Parse Error", e); }
    }

    // 2. NETWORK CHECK
    getDoc(doc(db, "settings", "sync")).then(snap => {
        let serverVersion = 0;
        if (snap.exists()) {
            const d = snap.data();
            serverVersion = d.lastProductUpdate ? d.lastProductUpdate.toMillis() : 0;
        }

        // 3. FETCH IF STALE
        if (serverVersion > localVersion || products.length === 0) {
            console.log("🔄 Cache Stale. Fetching new data...");
            getDocs(collection(db, "products")).then(snapshot => {
                products = [];
                snapshot.forEach(d => products.push(d.data()));
                products = products.filter(p => p.id !== 999);

                localStorage.setItem('namo_products', JSON.stringify({
                    items: products,
                    version: serverVersion
                }));

                if (onProductsLoaded) onProductsLoaded(products);
                showToast("Menu Updated", "info");

            }).catch(err => console.error("Products Error:", err));
        } else {
            console.log("✅ Cache is Fresh. No read cost.");
        }
    });

    // Config Listener
    unsubscribeListeners.config = onSnapshot(doc(db, "settings", "config"), (snapshot) => {
        if (snapshot.exists()) {
            shopConfig = snapshot.data();
            if (onConfigLoaded) onConfigLoaded(shopConfig);
        }
    });

    // Coupons Listener (Active only)
    const q = query(collection(db, "coupons"), where("isActive", "==", true));
    unsubscribeListeners.coupons = onSnapshot(q, (snapshot) => {
        activeCoupons = [];
        snapshot.forEach(d => activeCoupons.push(d.data()));
        if (onCouponsLoaded) onCouponsLoaded(activeCoupons);
    });
}

// --- USER PROFILE ---
export function loadUserProfile(uid) {
    const ref = doc(db, "users", uid);
    getDoc(ref).then(snap => {
        if (snap.exists()) {
            userProfile = snap.data();
        } else {
            // Create default profile if new
            const newUser = {
                uid: uid,
                createdAt: serverTimestamp(),
                role: 'customer'
            };
            setDoc(ref, newUser, { merge: true });
            userProfile = newUser;
        }
    });
}

// --- ALERTS ---
export function subscribeToRestock(productId, productName, phone) {
    if (!phone || phone.length < 10) return showToast("Invalid Phone Number", "error");

    // Add to restockAlerts collection
    setDoc(doc(collection(db, "restockAlerts")), {
        productId,
        productName,
        phone,
        active: true,
        timestamp: serverTimestamp(),
        acknowledged: false
    }).then(() => {
        showToast("We will notify you when back in stock!", "success");
        // Close modal if open (requires UI access, or just let UI handle it)
    });
}
