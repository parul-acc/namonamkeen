
// Import everything
import * as utils from './modules/utils.js';
import * as data from './modules/data.js';
import * as ui from './modules/ui.js';
import * as products from './modules/products.js';
import * as cart from './modules/cart.js';
import * as checkout from './modules/checkout.js';
import * as orders from './modules/orders.js';
import * as profile from './modules/profile.js';
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

// Also expose widely used functions directly if needed (Optional, but safer to namespace)
// For now, we will ask the user to use window.app or update HTML to window.app.
// BUT, to keep existing HTML working without finding/replacing 100s of onclicks:
// We can try to map them to window.
Object.assign(window, window.app);

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    // 1. Auth
    auth.initAuth();

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
