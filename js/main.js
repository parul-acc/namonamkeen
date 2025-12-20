
// Import everything
import * as utils from './modules/utils.js';
import * as data from './modules/data.js';
import * as ui from './modules/ui.js';
import * as products from './modules/products.js';
import * as cart from './modules/cart.js';
import * as checkout from './modules/checkout.js';
import * as orders from './modules/orders.js';
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
    ...auth,
    ...checkout,
    ...orders,
    ...profile,

    // Aliases for compatibility with old HTML onclicks
    filterMenu: products.setCategory,
    openProductDetail: products.openProductDetail,
    closeProductModal: products.closeProductModal,
    updateModalPrice: products.updateModalPrice,
    updateModalQty: products.updateModalQty,
    addToCartFromModal: products.addToCartFromModal,
    shareNative: products.shareNative,
    playVideo: ui.playVideo
};

Object.assign(window, window.app);

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    // 1. Auth Subscription
    auth.initAuth();
    auth.subscribeUser(profile => {
        const nameDisplay = document.getElementById('user-name');
        if (nameDisplay && profile) nameDisplay.innerText = profile.name || 'User';

        const picDisplay = document.getElementById('user-pic');
        if (picDisplay && profile && profile.photoURL) picDisplay.src = profile.photoURL;
    });

    // 2. Load Data
    data.fetchData({
        onProductsLoaded: (allProducts) => {
            products.renderMenu();

            // --- SEO: Check for Shared Link ---
            const params = new URLSearchParams(window.location.search);
            const pid = params.get('pid');
            if (pid) {
                // Determine if ID is string or int. JSON IDs are ints usually.
                // We'll try parsing.
                const id = parseInt(pid);
                if (!isNaN(id)) products.openProductDetail(id);
            }
        },
        onConfigLoaded: (config) => {
            cart.updateCartUI(); // Update fees
        }
    });

    // 3. Load Cart
    cart.loadCartLocal();
});
