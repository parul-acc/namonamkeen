import { db } from './firebase-init.js';
import { collection, getDocs, doc, setDoc, deleteDoc, orderBy, query, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { showToast, safeCall, safeCSV } from './utils.js';

let inventory = [];
let currentInvPage = 1;
const ITEMS_PER_PAGE = 20;

export function loadInventory() {
    const q = query(collection(db, "products"), orderBy("id", "desc"));
    getDocs(q).then(snap => {
        inventory = [];
        snap.forEach(doc => inventory.push(doc.data()));
        inventory = inventory.filter(p => p.id !== 999);

        const inStock = inventory.filter(i => i.in_stock).length;
        document.getElementById('inv-total').innerText = inventory.length;
        document.getElementById('inv-stock').innerText = inStock;
        document.getElementById('inv-out').innerText = inventory.length - inStock;

        renderInventoryTable();
    }).catch(e => {
        console.error(e);
        showToast("Error loading inventory", "error");
    });
}
// ... (Render and modal logic is unchanged as it's pure JS) ...

function renderInventoryTable() {
    const start = (currentInvPage - 1) * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;
    const pageItems = inventory.slice(start, end);

    const tbody = document.getElementById('inventory-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    pageItems.forEach(p => {
        let stockDisplay = '';
        if (p.variants) {
            p.variants.forEach(v => {
                const color = (v.inStock !== false) ? 'green' : 'red';
                stockDisplay += `<div style="font-size:12px;"><span style="color:${color}">●</span> ${v.weight}: ₹${v.price}</div>`;
            });
        } else {
            stockDisplay = `₹${p.price}`;
        }

        tbody.innerHTML += `
            <tr>
                <td><img src="${p.image}" class="table-img" onerror="this.src='logo.jpg'"></td>
                <td>
                    <b>${p.name}</b><br>
                    <small style="color:#666">${p.category || 'Snack'}</small>
                </td>
                <td>${stockDisplay}</td>
                <td>
                    <span class="badge ${p.in_stock ? 'badge-success' : 'badge-danger'}">
                        ${p.in_stock ? 'In Stock' : 'Out'}
                    </span>
                    ${p.stock !== undefined ? `<br><small>${p.stock} units</small>` : ''}
                </td>
                <td>
                    <button class="btn-icon" onclick="window.adminApp.openProductModal(${p.id})"><i class="fas fa-edit"></i></button>
                    ${p.stock !== undefined ? `<button class="btn-icon" onclick="window.adminApp.openStockModal(${p.id})"><i class="fas fa-boxes"></i></button>` : ''}
                    <button class="btn-icon text-red" onclick="window.adminApp.deleteProduct(${p.id})"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `;
    });

    document.getElementById('inventory-page-info').innerText = `Page ${currentInvPage}`;
}

export function changeInventoryPage(diff) {
    const maxPage = Math.ceil(inventory.length / ITEMS_PER_PAGE);
    const newPage = currentInvPage + diff;
    if (newPage > 0 && newPage <= maxPage) {
        currentInvPage = newPage;
        renderInventoryTable();
    }
}

export function openProductModal(id = null) {
    const modal = document.getElementById('product-modal');
    document.querySelectorAll('#product-modal input').forEach(i => i.type !== 'checkbox' ? i.value = '' : i.checked = false);
    document.getElementById('variant-container').innerHTML = '';

    if (id) {
        const p = inventory.find(x => x.id === id);
        if (p) {
            document.getElementById('p-id').value = p.id;
            document.getElementById('p-name').value = p.name;
            document.getElementById('p-nameHi').value = p.nameHi || '';
            document.getElementById('p-image').value = p.image;
            document.getElementById('p-category').value = p.category || 'spicy';
            document.getElementById('p-bestseller').checked = !!p.bestseller;
            document.getElementById('p-featured').checked = !!p.isFeatured;

            if (p.variants) {
                p.variants.forEach(v => addVariantRow(v));
            }
        }
    } else {
        document.getElementById('p-id').value = '';
        addVariantRow();
    }
    modal.style.display = 'flex';
}

export function addVariantRow(data = null) {
    const container = document.getElementById('variant-container');
    const div = document.createElement('div');
    div.className = 'variant-row';
    div.innerHTML = `
        <input placeholder="Weight (e.g. 200g)" value="${data ? data.weight : ''}" class="v-weight">
        <input type="number" placeholder="Price" value="${data ? data.price : ''}" class="v-price">
        <label><input type="checkbox" class="v-stock" ${!data || data.inStock !== false ? 'checked' : ''}> Stock</label>
        <button onclick="this.parentElement.remove()" class="btn-icon text-red">&times;</button>
    `;
    container.appendChild(div);
}

export function saveProduct() {
    const idVal = document.getElementById('p-id').value;
    const isNew = !idVal;

    const variants = [];
    document.querySelectorAll('.variant-row').forEach(row => {
        const w = row.querySelector('.v-weight').value;
        const p = row.querySelector('.v-price').value;
        const s = row.querySelector('.v-stock').checked;
        if (w && p) variants.push({ weight: w, price: parseInt(p), inStock: s });
    });

    if (variants.length === 0) {
        showToast("Add at least one variant", "error");
        return;
    }

    const data = {
        name: document.getElementById('p-name').value,
        nameHi: document.getElementById('p-nameHi').value,
        image: document.getElementById('p-image').value,
        category: document.getElementById('p-category').value,
        bestseller: document.getElementById('p-bestseller').checked,
        isFeatured: document.getElementById('p-featured').checked,
        variants: variants,
        price: variants[0].price,
        in_stock: variants.some(v => v.inStock)
    };

    const docId = isNew ? String(Date.now()) : String(idVal);
    if (isNew) data.id = parseInt(docId);

    setDoc(doc(db, "products", docId), data, { merge: true })
        .then(() => {
            // Touch Sync Doc
            setDoc(doc(db, "settings", "sync"), {
                lastProductUpdate: serverTimestamp()
            }, { merge: true });

            showToast("Product Saved!", "success");
            document.getElementById('product-modal').style.display = 'none';
            loadInventory();
        })
        .catch(e => {
            console.error(e);
            showToast("Save Failed", "error");
        });
}

export function deleteProduct(id) {
    if (confirm("Are you sure? This cannot be undone.")) {
        deleteDoc(doc(db, "products", String(id)))
            .then(() => {
                // Touch Sync Doc
                setDoc(doc(db, "settings", "sync"), {
                    lastProductUpdate: serverTimestamp()
                }, { merge: true });

                showToast("Deleted", "success");
                loadInventory();
            });
    }
}
