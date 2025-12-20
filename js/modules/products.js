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
            <img src="${p.image}" class="product-img" loading="lazy" onerror="this.src='logo.jpg'">
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
    // Placeholder for buyNow logic if needed, or implement full logic
    console.log("Buy Now clicked for", id);
    // For now we can at least open product detail or add to cart
    addToCartFromGrid(id); // Partial fallback
    window.app.toggleCart(); // Open cart
}
