import { showToast, dbg } from './utils.js';

// --- UI STATE ---
let modalStack = [];

// --- EXPORTED UI FUNCTIONS ---

export function toggleCart() {
    const sidebar = document.getElementById('cart-sidebar');
    const overlay = document.querySelector('.cart-overlay');
    if (sidebar && overlay) {
        sidebar.classList.toggle('active');
        overlay.classList.toggle('active');
        // Prevent body scroll when open
        document.body.style.overflow = sidebar.classList.contains('active') ? 'hidden' : 'auto';
    }
}

export function openModal(id) {
    const m = document.getElementById(id);
    if (!m) return;

    pushModalState();
    m.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

export function closeModal(id) {
    const m = document.getElementById(id);
    if (m) m.style.display = 'none';

    // Check if any other modal is open
    const anyOpen = document.querySelectorAll('.modal-overlay[style*="display: flex"]');
    if (anyOpen.length === 0) document.body.style.overflow = 'auto';
}

export function pushModalState() {
    modalStack.push(window.location.hash);
    window.history.pushState({ modal: true }, '', window.location.pathname + '#modal');
}

export function toggleMobileMenu() {
    const nav = document.getElementById('mobile-nav');
    if (nav) nav.classList.toggle('active');
}

export function toggleUserNotif() {
    const modal = document.getElementById('user-notif-modal');
    if (modal) modal.style.display = (modal.style.display === 'flex' ? 'none' : 'flex');
}

export function closeUserNotif() {
    const modal = document.getElementById('user-notif-modal');
    if (modal) modal.style.display = 'none';
}

// Global Escape Key Listener for Modals
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const openModals = document.querySelectorAll('.modal-overlay');
        openModals.forEach(m => {
            if (m.style.display === 'flex') m.style.display = 'none';
        });
        document.body.style.overflow = 'auto';
    }
});

// Exit Intent Popup Logic
export function triggerExitPopup() {
    if (sessionStorage.getItem('namoExitShown')) return;
    // Implementation can be added if needed, currently just a placeholder in script.js
    // For now we assume the HTML for exit popup exists or is dynamic
    // Logic moved here for consistency
    const popup = document.getElementById('exit-popup'); // Assuming id
    if (popup) {
        popup.style.display = 'flex';
        sessionStorage.setItem('namoExitShown', 'true');
    }
}

export function openLoginChoiceModal() {
    const m = document.getElementById('login-choice-modal');
    if (m) m.style.display = 'flex';
}

export function playVideo(url, el) {
    el.innerHTML = `<video src="${url}" autoplay controls style="width:100%; height:100%; border-radius:20px; object-fit: cover;"></video>`;
}
