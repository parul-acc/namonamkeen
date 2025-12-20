
// Import everything
import * as utils from './modules/utils.js';
import * as data from './modules/data.js';
import * as ui from './modules/ui.js';
import * as products from './modules/products.js';
import * as cart from './modules/cart.js';
import * as auth from './modules/auth.js';
import './modules/firebase-init.js'; // Just Import to run init

// --- EXPOSE TO WINDOW (The Bridge) ---
// This allows onclick="window.app.functionName()" in HTML
window.app = {
    ...utils,
    ...data,
    ...ui,
    ...products,
    ...cart,
    ...auth
};

// Also expose widely used functions directly if needed (Optional, but safer to namespace)
// For now, we will ask the user to use window.app or update HTML to window.app.
// BUT, to keep existing HTML working without finding/replacing 100s of onclicks:
// We can try to map them to window.
Object.assign(window, window.app);

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    // 1. Auth
    auth.initAuthListener({
        onUserChanged: (user) => {
            // Update UI based on user state
            const authSection = document.getElementById('user-auth-section'); // Example
            // Logic to toggle login/profile buttons (simplified)
        }
    });

    // 2. Load Data
    data.fetchData({
        onProductsLoaded: (allProducts) => {
            products.renderMenu();
        },
        onConfigLoaded: (config) => {
            cart.updateCartUI(); // Update fees
        }
    });

    // 3. Load Cart
    cart.loadCartLocal();

    // 4. Global Listeners via UI module
    // ui.setupGlobalListeners();
});
