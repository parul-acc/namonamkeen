// --- ADMIN UTILITIES ---

// Debug helper
export const IS_DEV = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
window.DEBUG = (window.DEBUG === true) || IS_DEV;

export function dbg(...args) {
    if (window.DEBUG) console.log(...args);
}

// Toast Notification (Reused logic for consistency)
export function showToast(msg, type = 'info') {
    // Check if toast container exists, if not create it (admin.css might handle this)
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.position = 'fixed';
        container.style.bottom = '20px';
        container.style.right = '20px';
        container.style.zIndex = '9999';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`; // Assumes admin.css has these classes
    toast.style.background = type === 'error' ? '#e74c3c' : (type === 'success' ? '#2ecc71' : '#333');
    toast.style.color = 'white';
    toast.style.padding = '12px 24px';
    toast.style.borderRadius = '4px';
    toast.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
    toast.style.marginBottom = '10px';
    toast.style.minWidth = '250px';
    toast.style.transition = 'opacity 0.3s, transform 0.3s';
    toast.textContent = msg;

    container.appendChild(toast);

    // Animation
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Safe Call Wrapper for legacy/optional functions
export function safeCall(fn, ...args) {
    if (typeof fn === 'function') {
        try {
            return fn(...args);
        } catch (e) {
            console.warn("SafeCall Error:", e);
        }
    }
}

// Escape CSV fields
export function safeCSV(str) {
    if (str === null || str === undefined) return '';
    str = String(str).replace(/"/g, '""'); // Escape quotes
    return `"${str}"`;
}

// Format Date
export function formatDate(timestamp) {
    if (!timestamp) return '-';
    // Handle Firestore Timestamp or standard Date
    const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return d.toLocaleString('en-IN', {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
    });
}

// Modal Helpers
export function openModal(id) {
    const m = document.getElementById(id);
    if (m) m.style.display = 'flex';
}

export function closeModal(id) {
    const m = document.getElementById(id);
    if (m) m.style.display = 'none';
}
