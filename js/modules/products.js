import { sanitizeHTML } from './utils.js';
import { products, subscribeToRestock } from './data.js'; // Imports shared state
import { openModal } from './ui.js';
import { addToCart } from './cart.js'; // Added import

let currentCategory = 'all';
let searchQuery = '';
let currentSort = 'default';
let currentLang = 'en';

// --- FILTERING & SORTING ---
export function setCategory(cat) {
    currentCategory = cat;
    renderMenu();
}

export function setSearchQuery(q) {
    searchQuery = q.toLowerCase();
    renderMenu();
}

export function setSort(sortVal) {
    currentSort = sortVal;
    renderMenu();
}

// --- RENDERING ---
export function renderMenu() {
    const grid = document.getElementById('menu-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const filtered = products.filter(p => {
        const name = (p.name + (p.nameHi || '')).toLowerCase();
        const matchesCat = currentCategory === 'all' || p.category === currentCategory;
        const matchesSearch = name.includes(searchQuery);
        return matchesCat && matchesSearch;
    });

    // Sort Logic
    filtered.sort((a, b) => {
        if (a.isFeatured && !b.isFeatured) return -1;
        if (!a.isFeatured && b.isFeatured) return 1;
        if (a.bestseller && !b.bestseller) return -1;
        if (!a.bestseller && b.bestseller) return 1;
        return 0;
    });

    if (currentSort === 'price-low') filtered.sort((a, b) => a.price - b.price);
    else if (currentSort === 'price-high') filtered.sort((a, b) => b.price - a.price);
    else if (currentSort === 'rating') {
        const getRating = (p) => p.ratingCount ? (p.ratingSum / p.ratingCount) : 0;
        filtered.sort((a, b) => getRating(b) - getRating(a));
    }

    if (filtered.length === 0) {
        grid.innerHTML = '<p style="text-align:center; grid-column:1/-1;">No products found.</p>';
        return;
    }

    filtered.forEach(p => {
        const name = currentLang === 'en' ? p.name : (p.nameHi || p.name);
        const desc = currentLang === 'en' ? p.desc : (p.descHi || p.desc);
        const ribbonHTML = p.bestseller ? `<div class="ribbon">Bestseller</div>` : '';

        // Variants and Availability logic simplified for the snippet
        let isAvailable = p.in_stock;
        let displayPrice = p.price;
        let variantHtml = '';

        if (p.variants && p.variants.length > 0) {
            const firstActive = p.variants.find(v => v.inStock !== false);
            displayPrice = firstActive ? firstActive.price : p.variants[0].price;
            if (!firstActive) isAvailable = false;

            // Added ID to select
            variantHtml = `<select class="variant-select" id="variant-select-${p.id}" onchange="window.app.updateCardPrice(${p.id}, this.value)" onclick="event.stopPropagation()">`;
            p.variants.forEach((v, index) => {
                const stockStatus = (v.inStock !== false);
                const disabledAttr = stockStatus ? '' : 'disabled';
                const label = v.weight + (stockStatus ? '' : ' (Out of Stock)');
                const selectedAttr = (v.price === displayPrice && stockStatus) ? 'selected' : '';
                variantHtml += `<option value="${index}" ${disabledAttr} ${selectedAttr}>${label}</option>`;
            });
            variantHtml += `</select>`;
        }

        let btnAction = isAvailable ? `window.app.addToCartFromGrid(${p.id})` : '';
        let btnText = isAvailable ? (currentLang === 'en' ? 'Add' : 'जोड़ें') : 'Sold Out';
        let cardClass = isAvailable ? '' : 'sold-out';

        // Rating Stars
        const reviewCount = p.ratingCount || 0;
        const avgRating = p.ratingCount ? (p.ratingSum / p.ratingCount).toFixed(1) : 0;
        let starHTML = reviewCount > 0 ? `<div class="star-display">★ ${avgRating} (${reviewCount})</div>` : '';

        const oneClickBtn = isAvailable
            ? `<button class="buy-now-btn" onclick="event.stopPropagation(); window.app.buyNow(${p.id})" title="Buy Now"><i class="fas fa-bolt"></i></button>`
            : '';

        const itemHtml = `
        <div class="product-card ${cardClass}" onclick="window.app.openProductDetail(${p.id})">
            ${ribbonHTML}
            <img src="${p.image}" class="product-img" loading="lazy" onload="this.classList.add('loaded')" onerror="this.src='logo.jpg'">
            <div class="product-info">
                <h3>${sanitizeHTML(name)}</h3>
                ${starHTML}
                <p class="product-desc">${sanitizeHTML(desc)}</p>
                <div style="margin-bottom:10px; min-height:30px;">${variantHtml}</div>
                
                <div class="price-row">
                    <span class="price" id="price-${p.id}">₹${displayPrice}</span>
                    <div style="display:flex; gap:5px;">
                        ${oneClickBtn}
                        <button class="add-btn" 
                            onclick="event.stopPropagation(); ${btnAction}" 
                            ${!isAvailable ? 'disabled style="background:#ccc; cursor:not-allowed;"' : ''}>
                            ${btnText}
                        </button>
                    </div>
                </div>
            </div>
        </div>`;
        grid.innerHTML += itemHtml;
    });
}

export function updateCardPrice(id, index) {
    const p = products.find(x => x.id === id);
    if (p && p.variants && p.variants[index]) {
        const priceEl = document.getElementById(`price-${id}`);
        if (priceEl) priceEl.innerText = `₹${p.variants[index].price}`;
    }
}

export function addToCartFromGrid(id) {
    const p = products.find(x => x.id === id);
    if (!p) return;

    let v = null;
    const select = document.getElementById(`variant-select-${id}`);

    if (select) {
        v = p.variants[select.value];
    } else if (p.variants && p.variants.length > 0) {
        v = p.variants.find(vars => vars.inStock !== false) || p.variants[0];
    } else {
        v = { weight: 'Standard', price: p.price };
    }

    addToCart(p, v, 1);
}

export function buyNow(id) {
    addToCartFromGrid(id); // Partial fallback
    window.app.toggleCart(); // Open cart
}


let currentModalQty = 1;

export function openProductDetail(id) {
    const p = products.find(x => x.id === id);
    if (!p) return;

    currentModalQty = 1;

    // Check if openModal is available from imports, or manually set display
    const m = document.getElementById('product-modal');
    if (m) m.style.display = 'flex';

    const name = currentLang === 'en' ? p.name : (p.nameHi || p.name);
    const desc = currentLang === 'en' ? p.desc : (p.descHi || p.desc);
    const category = p.category ? p.category.charAt(0).toUpperCase() + p.category.slice(1) : "Snacks";

    let variantHtml = '';
    let initialPrice = p.price;
    let isAvailable = p.in_stock;

    if (p.variants && p.variants.length > 0) {
        const firstActive = p.variants.find(v => v.inStock !== false);
        initialPrice = firstActive ? firstActive.price : p.variants[0].price;
        if (!firstActive) isAvailable = false;

        variantHtml = `<select id="modal-variant-select" class="pm-select" onchange="window.app.updateModalPrice(this)" style="margin-top:10px; width:100%; padding:8px; border-radius:5px; border:1px solid #ddd;">`;
        p.variants.forEach((v, idx) => {
            const stockStatus = (v.inStock !== false);
            const disabledAttr = stockStatus ? '' : 'disabled';
            const label = v.weight + (stockStatus ? '' : '');
            const selectedAttr = (v.price === initialPrice && stockStatus) ? 'selected' : '';
            variantHtml += `<option value="${idx}" data-price="${v.price}" ${disabledAttr} ${selectedAttr}>${label}</option>`;
        });
        variantHtml += `</select>`;
    }

    const shareUrl = `${window.location.origin}/?pid=${p.id}`;
    let shareBtnHtml = '';
    if (navigator.share) {
        shareBtnHtml = `<button onclick="window.app.shareNative('${name.replace(/'/g, "\\'")}', '${shareUrl}')" style="background:none; border:none; color:var(--primary); font-size:1.2rem; cursor:pointer;" title="Share"><i class="fas fa-share-alt"></i></button>`;
    }

    const html = `
        <div style="display: flex; flex-direction: column; height: 100%;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                ${shareBtnHtml}
                <button onclick="window.app.closeProductModal()" style="background:none; border:none; color:#e85d04; font-size:1.8rem; cursor:pointer; line-height:1;">&times;</button>
            </div>
            <div style="text-align: center; margin-bottom: 15px;">
                <img src="${p.image}" style="width: 200px; height: 200px; object-fit: cover; border-radius: 50%; box-shadow: 0 5px 15px rgba(0,0,0,0.1);" onerror="this.src='logo.jpg'">
            </div>
            <div style="flex-grow: 1;">
                <h2 style="margin: 0; font-size: 1.6rem; color: #333;">${name}</h2>
                <p style="color: #999; font-size: 0.85rem; margin: 2px 0 10px;">Category: ${category}</p>
                <p style="color: #666; font-size: 0.95rem; line-height: 1.5;">${desc}</p>
                ${variantHtml}
                <h3 id="modal-price-display" style="color: #2ecc71; font-size: 1.8rem; margin: 15px 0 0;">₹${initialPrice}</h3>
            </div>
            <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 20px; gap: 15px;">
                <div style="display: flex; align-items: center; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; height: 45px;">
                    <button onclick="window.app.updateModalQty(-1)" style="width: 40px; height: 100%; border:none; background: #fff; font-size: 1.2rem; color: #666;">-</button>
                    <span id="modal-qty-display" style="min-width: 30px; text-align: center; font-weight: bold; font-size: 1.1rem;">1</span>
                    <button onclick="window.app.updateModalQty(1)" style="width: 40px; height: 100%; border:none; background: #fff; font-size: 1.2rem; color: #666;">+</button>
                </div>
                <button onclick="window.app.addToCartFromModal(${p.id})" 
                    style="flex: 1; height: 45px; background: #e85d04; color: white; border: none; border-radius: 8px; font-size: 1.1rem; font-weight: 600; cursor: pointer;"
                    ${!isAvailable ? 'disabled style="background:#ccc; cursor:not-allowed; flex:1; height:45px; border:none; border-radius:8px;"' : ''}>
                    ${isAvailable ? 'Add' : 'Sold Out'}
                </button>
            </div>
        </div>
    `;

    const body = document.getElementById('p-modal-body');
    if (body) body.innerHTML = html;
}

export function closeProductModal() {
    const m = document.getElementById('product-modal');
    if (m) m.style.display = 'none';
}

export function updateModalQty(change) {
    let newQty = currentModalQty + change;
    if (newQty < 1) newQty = 1;
    currentModalQty = newQty;
    const d = document.getElementById('modal-qty-display');
    if (d) d.innerText = currentModalQty;
}

export function updateModalPrice(selectElem) {
    const price = selectElem.options[selectElem.selectedIndex].getAttribute('data-price');
    const d = document.getElementById('modal-price-display');
    if (d) d.innerText = `₹${price}`;
}

export function addToCartFromModal(id) {
    const p = products.find(x => x.id === id);
    if (!p) return;

    let v = null;
    const select = document.getElementById('modal-variant-select');
    if (select) {
        v = p.variants[select.value];
    } else if (p.variants && p.variants.length > 0) {
        v = p.variants.find(vars => vars.inStock !== false) || p.variants[0];
    } else {
        v = { weight: 'Standard', price: p.price };
    }

    addToCart(p, v, currentModalQty);
    closeProductModal();
}

export function shareNative(title, url) {
    if (navigator.share) {
        navigator.share({ title: title, url: url }).catch(console.error);
    }
}
