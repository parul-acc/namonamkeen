
import * as utils from './admin-modules/utils.js';
import * as dbInit from './admin-modules/firebase-init.js';
import * as dashboard from './admin-modules/dashboard.js';
import * as products from './admin-modules/products.js';
import * as orders from './admin-modules/orders.js';
import * as users from './admin-modules/users.js';
import * as coupons from './admin-modules/coupons.js';
import * as settings from './admin-modules/settings.js';
import * as analytics from './admin-modules/analytics.js';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

const auth = dbInit.auth;

window.adminApp = {
    ...utils,
    ...dashboard,
    ...products,
    ...orders,
    ...users,
    ...coupons,
    ...settings,
    ...analytics
};

Object.assign(window, window.adminApp);

document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, user => {
        document.body.classList.remove('loading');
        if (user) {
            const email = user.email;
            const ADMIN_EMAILS = ["parul19.accenture@gmail.com", "namonamkeens@gmail.com", "soramjain2297@gmail.com", "ajmera.nidhishree@gmail.com"];

            user.getIdTokenResult().then(token => {
                if (ADMIN_EMAILS.includes(email) || token.claims.admin) {
                    document.getElementById('login-overlay').style.display = 'none';
                    document.getElementById('admin-user-info').innerText = user.displayName || 'Admin';
                    dashboard.initDashboard();
                } else {
                    utils.showToast("Access Denied. Admins Only.", "error");
                    signOut(auth);
                }
            });
        } else {
            document.getElementById('login-overlay').style.display = 'flex';
        }
    });
});

window.switchView = function (viewId) {
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-links a').forEach(el => el.classList.remove('active'));

    const target = document.getElementById(`view-${viewId}`);
    if (target) target.classList.add('active');

    const navItem = document.getElementById(`nav-${viewId}`);
    if (navItem) navItem.classList.add('active');

    document.getElementById('page-title').innerText = viewId.charAt(0).toUpperCase() + viewId.slice(1);

    if (window.innerWidth < 768) {
        document.getElementById('sidebar').classList.remove('active');
        document.getElementById('sidebar-overlay').style.display = 'none';
    }

    if (viewId === 'inventory') products.loadInventory();
    if (viewId === 'orders') orders.loadOrders();
    if (viewId === 'customers') users.loadCustomers();
    if (viewId === 'coupons') coupons.loadCoupons();
    if (viewId === 'settings') settings.loadSettings();
}

window.toggleSidebar = function () {
    const s = document.getElementById('sidebar');
    const o = document.getElementById('sidebar-overlay');
    s.classList.toggle('active');
    o.style.display = s.classList.contains('active') ? 'block' : 'none';
}

window.logout = function () {
    signOut(auth).then(() => window.location.reload());
}

window.adminLogin = function () {
    const provider = new GoogleAuthProvider();
    signInWithPopup(auth, provider).catch(e => utils.showToast(e.message, 'error'));
}
