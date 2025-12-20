import { auth } from './firebase-init.js';
import {
    GoogleAuthProvider,
    signInWithPopup,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { loadUserProfile } from './data.js';
import { showToast, dbg } from './utils.js';

export let currentUser = null;

export function initAuth() {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUser = user;
            loadUserProfile(user.uid);

            // UI Updates
            const loginBtn = document.getElementById('login-btn');
            if (loginBtn) {
                loginBtn.innerHTML = '<i class="fas fa-user"></i>';
                loginBtn.onclick = () => window.location.href = 'profile.html';
            }
            showToast(`Welcome back, ${user.displayName.split(' ')[0]}!`);

            // Check Admin logic if needed here, or handle in profile
        } else {
            currentUser = null;
            const loginBtn = document.getElementById('login-btn');
            if (loginBtn) {
                loginBtn.innerHTML = 'Login';
                loginBtn.onclick = login;
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
