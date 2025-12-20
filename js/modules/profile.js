
import { db } from './firebase-init.js';
import { showToast, dbg } from './utils.js';
import { currentUser, userProfile, setUserProfile } from './auth.js';

// --- PROFILE UI FUNCTIONS ---

export function openProfileModal() {
    const modal = document.getElementById('profile-modal');
    if (!modal) return;

    // pushModalState(); // Only if we want history support, otherwise skip for modules for now
    modal.style.display = 'flex';

    if (window.app && typeof window.app.initReferral === 'function') window.app.initReferral();

    // --- GAMIFICATION UI INJECTION ---
    if (userProfile) {
        // 1. Existing Form Fill
        const nameInput = document.getElementById('edit-name');
        if (nameInput) nameInput.value = userProfile.name || (currentUser.displayName || '');

        const phoneInput = document.getElementById('edit-phone');
        if (phoneInput) phoneInput.value = userProfile.phone || '';

        const emailInput = document.getElementById('edit-email');
        if (emailInput) emailInput.value = userProfile.email || '';

        // Address
        if (userProfile.addressDetails) {
            const street = document.getElementById('edit-addr-street');
            const city = document.getElementById('edit-addr-city');
            const pin = document.getElementById('edit-addr-pin');
            if (street) street.value = userProfile.addressDetails.street || '';
            if (city) city.value = userProfile.addressDetails.city || 'Indore';
            if (pin) pin.value = userProfile.addressDetails.pin || '';
        } else {
            const street = document.getElementById('edit-addr-street');
            if (street) street.value = userProfile.address || '';
        }

        const imgEl = document.getElementById('edit-profile-pic');
        if (userProfile.photoURL && imgEl) imgEl.src = userProfile.photoURL;

        // 2. NEW: Loyalty Card Render
        renderLoyaltyCard();
    }
}

export function closeProfileModal() {
    const modal = document.getElementById('profile-modal');
    if (modal) modal.style.display = 'none';
}

function renderLoyaltyCard() {
    const tier = userProfile.loyaltyTier || 'Bronze';
    const spend = userProfile.totalLifetimeSpend || 0;

    // Calculate Progress to next tier
    let nextGoal = 2000;
    let nextTier = 'Silver';
    if (tier === 'Silver') { nextGoal = 5000; nextTier = 'Gold'; }
    else if (tier === 'Gold') { nextGoal = 10000; nextTier = 'Platinum'; }
    else if (tier === 'Platinum') { nextGoal = spend * 1.5; nextTier = 'Max'; } // Cap

    const percent = Math.min(100, (spend / nextGoal) * 100);
    const needed = nextGoal - spend;

    // Insert Card before the form
    const container = document.querySelector('#profile-modal .modal-content');
    if (!container) return;

    // Remove old card if exists
    const oldCard = document.getElementById('loyalty-card-ui');
    if (oldCard) oldCard.remove();

    const cardHTML = `
    <div id="loyalty-card-ui" class="loyalty-card ${tier}">
        <div class="loyalty-header">
            <div>
                <div style="font-size:0.8rem; opacity:0.8;">Current Tier</div>
                <h2 style="margin:0; font-size:1.5rem;">${tier}</h2>
            </div>
            <div class="tier-badge bg-${tier}"><i class="fas fa-crown"></i> ${tier}</div>
        </div>
        
        <div style="display:flex; justify-content:space-between; font-size:0.85rem;">
            <span>₹${spend.toLocaleString()} Spent</span>
            <span>Goal: ₹${nextGoal.toLocaleString()}</span>
        </div>
        <div class="loyalty-progress">
            <div class="progress-bar-fill" style="width: ${percent}%"></div>
        </div>
        <div style="font-size:0.75rem; text-align:center; margin-top:5px; opacity:0.9;">
            ${tier === 'Platinum' ? 'You are a Legend! 🏆' : `Spend ₹${needed.toLocaleString()} more to reach ${nextTier}!`}
        </div>
    </div>

    <div style="margin-bottom:20px;">
        <strong style="display:block; font-size:0.9rem; margin-bottom:10px; color:#555;">Achievements</strong>
        <div class="badges-container">
            ${renderBadges(userProfile.badges || [])}
        </div>
    </div>`;

    // Insert after the close button header (child index 0) usually
    // We check if child 1 exists
    if (container.children.length > 1) {
        container.insertBefore(document.createRange().createContextualFragment(cardHTML), container.children[1]);
    } else {
        container.appendChild(document.createRange().createContextualFragment(cardHTML));
    }
}

function renderBadges(unlockedIds) {
    const allBadges = [
        { id: 'newbie', icon: 'fa-user', name: 'Newbie' },
        { id: 'foodie', icon: 'fa-utensils', name: 'Foodie' },
        { id: 'vip', icon: 'fa-crown', name: 'VIP' },
        { id: 'legend', icon: 'fa-gem', name: 'Legend' },
        { id: 'saver', icon: 'fa-piggy-bank', name: 'Saver' },
        { id: 'monthly_muncher', icon: 'fa-calendar-check', name: 'Monthly Muncher' }
    ];

    return allBadges.map(b => {
        const isUnlocked = unlockedIds.includes(b.id);
        return `
        <div class="badge-item ${isUnlocked ? 'unlocked' : ''}" title="${b.name}">
            <div class="badge-icon"><i class="fas ${b.icon}"></i></div>
            <div class="badge-name">${b.name}</div>
        </div>`;
    }).join('');
}


// Updated saveProfile
export function saveProfile() {
    if (!currentUser) return showToast("Please login first", "error");

    const name = document.getElementById('edit-name').value.trim();
    const phone = document.getElementById('edit-phone').value.trim();
    const email = document.getElementById('edit-email').value.trim();

    // Helper to get address
    const getAddressFromInputs = (prefix) => {
        const street = document.getElementById(`${prefix}-addr-street`).value.trim();
        const city = document.getElementById(`${prefix}-addr-city`).value.trim();
        const pin = document.getElementById(`${prefix}-addr-pin`).value.trim();
        if (!street) return null;
        return { street, city, pin, full: `${street}, ${city} - ${pin}` };
    };

    const addrObj = getAddressFromInputs('edit');

    if (!name) return showToast("Name is required", "error");
    if (!addrObj || !addrObj.street) return showToast("Address is incomplete", "error");

    const updateData = {
        name: name,
        phone: phone,
        email: email,
        address: addrObj.full,
        addressDetails: addrObj,
        lastUpdated: new Date()
    };

    // Photo
    const picBase64Input = document.getElementById('profile-pic-base64');
    const picBase64 = picBase64Input ? picBase64Input.value : null;
    if (picBase64) updateData.photoURL = picBase64;

    const btn = document.querySelector('button[onclick="window.app.saveProfile()"]');
    if (btn) {
        btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Processing...';
        btn.disabled = true;
    }

    db.collection("users").doc(currentUser.uid).set(updateData, { merge: true })
        .then(() => {
            const newProfile = { ...userProfile, ...updateData };
            setUserProfile(newProfile); // Update local state if we exported a setter, or rely on next fetch.
            // Since we imported userProfile as value, we can't mutate it easily unless auth.js exports a mutator.
            // But main app reload will fix it. For now, let's update UI.

            const nameDisplay = document.getElementById('user-name');
            if (nameDisplay) nameDisplay.innerText = name;

            const picDisplay = document.getElementById('user-pic');
            if (picBase64 && picDisplay) picDisplay.src = picBase64;

            closeProfileModal();
            showToast("Profile Saved!", "success");
        })
        .catch(err => {
            console.error(err);
            showToast("Error saving profile", "error");
        })
        .finally(() => {
            if (btn) {
                btn.innerHTML = 'Save Changes';
                btn.disabled = false;
            }
        });
}

// Simple preview function
export function previewProfilePic(input) {
    if (input.files && input.files[0]) {
        var reader = new FileReader();
        reader.onload = function (e) {
            document.getElementById('edit-profile-pic').src = e.target.result;
            document.getElementById('profile-pic-base64').value = e.target.result; // Store base64 for upload
        }
        reader.readAsDataURL(input.files[0]);
    }
}
