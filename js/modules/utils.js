// --- HELPER: Sanitize user/product data to prevent XSS ---
export function sanitizeHTML(str) {
    if (!str) return '';
    const temp = document.createElement('div');
    temp.textContent = str;
    return temp.innerHTML;
}

// Alias for consistency with admin.js
export function escapeHtml(text) {
    return sanitizeHTML(text);
}

// Sanitize/normalize image or user-provided URLs to allow only safe schemes
export function sanitizeUrl(url) {
    if (!url) return '';
    try {
        const parsed = new URL(url);
        // Allow http, https, and data (for base64 images)
        if (['http:', 'https:', 'data:'].includes(parsed.protocol)) {
            return url;
        }
        return '';
    } catch (e) {
        // If URL parsing fails, check if it's a relative path (safe for our app)
        if (url.startsWith('/') || url.startsWith('./') || url.startsWith('assets/')) {
            return url;
        }
        return '';
    }
}

// --- HELPER: Safely set element text content ---
export function safeSetText(element, text) {
    if (element) {
        element.textContent = text || '';
    }
}

// --- HELPER: Safely set element HTML (only trusted sources) ---
export function safeSetHTML(element, html) {
    if (element) {
        element.innerHTML = html || '';
    }
}

export function dbg(...args) {
    if (window.DEBUG) {
        console.log("🐛 [DEBUG]", ...args);
    }
}

// Show Toast Notification
export function showToast(msg, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = msg;
    document.body.appendChild(toast);

    // Trigger reflow
    toast.offsetHeight;

    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(20px)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}
