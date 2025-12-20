import { auth, db } from './firebase-init.js';
import {
    GoogleAuthProvider,
    signInWithPopup,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { loadUserProfile } from './data.js';
import { showToast, dbg } from './utils.js';

export let currentUser = null;
export let userProfile = null; // Exposed State

const listeners = [];

export function subscribeUser(callback) {
    listeners.push(callback);
    // Immediate callback if we already have data
    if (userProfile) callback(userProfile);
}

export function setUserProfile(profile) {
    userProfile = profile;
    listeners.forEach(cb => cb(profile));
}

export function initAuth() {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUser = user;
            loadUserProfile(user.uid).then(p => {
                setUserProfile(p);
            });

            // Basic button update (legacy specific)
            const loginBtn = document.getElementById('login-btn');
            if (loginBtn) {
                loginBtn.innerHTML = '<i class="fas fa-user"></i>';
                loginBtn.onclick = () => window.app.openProfileModal ? window.app.openProfileModal() : (window.location.href = 'profile.html');
            }
            showToast(`Welcome back, ${user.displayName ? user.displayName.split(' ')[0] : 'User'}!`);

        } else {
            currentUser = null;
            setUserProfile(null);
            const loginBtn = document.getElementById('login-btn');
            if (loginBtn) {
                loginBtn.innerHTML = 'Login';
                loginBtn.onclick = window.app.openLoginChoiceModal;
            }
        }
    });
}

export function login() {
    const provider = new GoogleAuthProvider();
    signInWithPopup(auth, provider)
        .then((result) => {
            // Managed by onAuthStateChanged
        }).catch((error) => {
            console.error(error);
            showToast(error.message, 'error');
        });
}

export function logout() {
    signOut(auth).then(() => {
        showToast("Logged out");
        setTimeout(() => window.location.reload(), 1000);
    });
}

export function handleLoginChoice(method) {
    const m = document.getElementById('login-choice-modal');
    if (m) m.style.display = 'none';

    if (method === 'google') {
        login();
    } else {
        showToast("Method not supported yet", "neutral");
    }
}

// --- GUEST CONVERSION ---
export async function convertGuestToUser(orderId, guestPhone) {
    const provider = new GoogleAuthProvider();
    try {
        const result = await signInWithPopup(auth, provider);
        const user = result.user;

        // Link Guest Data
        const userRef = doc(db, 'users', user.uid);

        const updateData = {
            phone: guestPhone,
            guestOrderId: orderId,
            convertedFromGuest: true,
            conversionDate: new Date()
        };

        await setDoc(userRef, updateData, { merge: true });

        showToast("Account Created! You earned 5% off next time!", "success");
        setTimeout(() => window.location.reload(), 2000);

    } catch (error) {
        console.error("Conversion Error", error);
        showToast(error.message, "error");
    }
}
