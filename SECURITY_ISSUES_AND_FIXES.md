# Security & Performance Issues - Identified & Fixed

## Summary
Scanned entire codebase for security vulnerabilities, performance issues, and potential bugs. Found **8 critical/high-priority issues**. **5 have been fixed**, **3 require manual configuration**.

---

## ✅ FIXED ISSUES

### 1. **XSS (Cross-Site Scripting) Vulnerability - Product Names & Descriptions**
**Severity:** CRITICAL  
**Location:** `script.js` lines 285-330 (renderMenu function)  
**Problem:** Product names and descriptions from Firebase were inserted directly into HTML via `.innerHTML` without sanitization. Malicious users could inject scripts.

```javascript
// ❌ VULNERABLE:
grid.innerHTML += `<h3>${name}</h3><p>${desc}</p>`;

// ✅ FIXED:
grid.innerHTML += `<h3>${sanitizeHTML(name)}</h3><p>${sanitizeHTML(desc)}</p>`;
```

**Impact:** Prevents code injection attacks through product data.

---

### 2. **XSS in Hamper Options Rendering**
**Severity:** CRITICAL  
**Location:** `script.js` line 372 (renderHamperOptions)  
**Problem:** Product names inserted via innerHTML

```javascript
// ❌ VULNERABLE:
div.innerHTML = `<img src="${p.image}"><h4>${p.name}</h4>`;

// ✅ FIXED:
const h4 = document.createElement('h4');
h4.textContent = p.name; // textContent prevents XSS
```

---

### 3. **Firestore Listener Memory Leaks**
**Severity:** HIGH  
**Location:** `script.js` lines 215-230 (coupons & config onSnapshot)  
**Problem:** `onSnapshot()` listeners never unsubscribed, causing memory leaks over app lifecycle.

```javascript
// ❌ VULNERABLE:
db.collection("coupons").where("isActive", "==", true).onSnapshot(snap => {
    // No unsubscribe = memory leak
});

// ✅ FIXED:
unsubscribeListeners.coupons = db.collection("coupons").where(...).onSnapshot(snap => {
    // ...
});

// Added cleanup on logout:
function logout() {
    cleanupListeners(); // Calls unsubscribe on all listeners
    auth.signOut().then(() => location.reload());
}
```

**Impact:** Prevents app from accumulating memory and slowing down over time.

---

### 4. **Missing Razorpay Library Check**
**Severity:** HIGH  
**Location:** `script.js` line 1595 (openRazorpayModal)  
**Problem:** Code tried to call `new Razorpay()` without checking if library loaded

```javascript
// ❌ VULNERABLE:
var rzp1 = new Razorpay(options); // Crashes if library not loaded

// ✅ FIXED:
if (typeof Razorpay === 'undefined') {
    showToast("Payment system not loaded. Please refresh.", "error");
    return;
}
```

**Impact:** Graceful error handling instead of silent crash.

---

### 5. **Enhanced Phone Number Validation**
**Severity:** MEDIUM  
**Location:** `script.js` lines 72-93  
**Problem:** Phone validation only on input, not on blur (user might tab away)

```javascript
// ✅ ADDED:
phoneField.addEventListener('blur', function() {
    const phone = this.value.trim();
    if (phone.length !== 0 && phone.length !== 10) {
        showToast("Phone must be exactly 10 digits", "error");
        this.focus();
    }
});
```

---

## ⚠️ REQUIRES MANUAL CONFIGURATION

### 6. **Empty Razorpay API Key**
**Severity:** CRITICAL  
**Location:** `script.js` line 38  
**Status:** NEEDS CONFIGURATION  

```javascript
// ❌ CURRENT (Non-functional):
const razorpayKeyId = "";

// ✅ FIX REQUIRED:
// 1. Go to: https://dashboard.razorpay.com/app/keys
// 2. Copy your Key ID (marked as "pk_live_...")
// 3. Paste it:
const razorpayKeyId = "pk_live_YOUR_KEY_HERE";
```

**Impact:** Without this, ALL payment processing will fail silently.

---

### 7. **Missing Firebase Security Rules**
**Severity:** CRITICAL  
**Location:** Firebase Console → Firestore Rules  
**Status:** NOT CONFIGURED  

Your app currently has NO security rules file. This means:
- ❌ Anyone can read/write to any collection
- ❌ Unauthorized users can access all orders & user data
- ❌ Users can delete/modify other users' data

**Required Actions:**

Create a `firestore.rules` file in your project root:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // PUBLIC: Products (read-only)
    match /products/{productId} {
      allow read: if true;
      allow write: if isAdmin();
    }

    // PUBLIC: Settings (read-only)
    match /settings/{doc} {
      allow read: if true;
      allow write: if isAdmin();
    }

    // PRIVATE: User data
    match /users/{userId} {
      allow read, write: if request.auth.uid == userId || isAdmin();
    }

    // PRIVATE: Orders (users can only read their own)
    match /orders/{orderId} {
      allow read: if request.auth != null && 
                     (resource.data.userId == request.auth.uid || isAdmin());
      allow create: if request.auth != null;
      allow update, delete: if isAdmin();
    }

    // PRIVATE: Reviews
    match /reviews/{reviewId} {
      allow read: if true;
      allow create: if request.auth != null;
      allow update, delete: if request.auth.uid == resource.data.userId || isAdmin();
    }

    // PRIVATE: Coupons (read-only for users)
    match /coupons/{couponId} {
      allow read: if true;
      allow write: if isAdmin();
    }

    // Helper function
    function isAdmin() {
      return request.auth.token.email_verified && 
             request.auth.token.email in ['admin@namonamkeen.com', 'parul@namonamkeen.com'];
    }
  }
}
```

Deploy via Firebase CLI:
```bash
firebase deploy --only firestore:rules
```

---

### 8. **Credentials & Sensitive Data**
**Severity:** CRITICAL  
**Location:** Various files  
**Status:** PARTIALLY EXPOSED  

**Current State:**
- ✅ Firebase config is PUBLIC (this is fine - it's meant to be)
- ⚠️ Admin credentials may be hardcoded elsewhere
- ⚠️ UPI ID is hardcoded (consider moving to Firestore settings)

**Recommendations:**
1. Store sensitive admin credentials in Firebase Custom Claims or Cloud Functions
2. Move hardcoded UPI ID to `settings/config` collection (already implemented)
3. Never commit `.env` files with real keys to Git

---

## 🔒 Additional Security Recommendations

### Content Security Policy (CSP)
Add this to `<head>` in all HTML files:
```html
<meta http-equiv="Content-Security-Policy" 
      content="default-src 'self'; 
               script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://checkout.razorpay.com https://www.gstatic.com;
               img-src 'self' data: https:;
               style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com;">
```

### Input Validation
```javascript
// Always validate user inputs server-side
const validatePhone = (phone) => /^[6-9]\d{9}$/.test(phone); // Indian format
const validateEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
```

### Rate Limiting
Implement rate limiting on payment endpoints to prevent abuse:
```javascript
// Example: Max 5 payment attempts per minute
function checkRateLimit(userId) {
    const now = Date.now();
    const window = 60000; // 1 minute
    // Check Firestore for recent attempts
}
```

---

## 🐛 Performance Optimizations

### 1. Lazy Load Images
✅ Already implemented via `loading="lazy"`

### 2. Bundle Optimization
Consider code-splitting:
- Separate admin.js from main script.js
- Lazy load modals only when needed

### 3. Database Query Optimization
```javascript
// ❌ Inefficient: Fetches all products every time
db.collection("products").get()

// ✅ Better: Add pagination
db.collection("products")
    .limit(20)
    .offset(pageNumber * 20)
    .get()
```

---

## 📋 Pre-Deployment Checklist

- [ ] Razorpay Key configured
- [ ] Firebase Rules deployed
- [ ] Admin emails set in Firestore rules
- [ ] CSP meta tags added
- [ ] Tested on mobile & desktop
- [ ] Payment flow tested (COD & UPI)
- [ ] Firebase backup enabled
- [ ] Error logging configured
- [ ] HTTPS enforced
- [ ] API rate limits configured

---

## 🆘 Testing Security

### XSS Test
Try adding a product with name: `<img src=x onerror="alert('XSS')">`
- Should display as text, not execute ✅

### Firebase Rules Test
```javascript
// This should FAIL (unauthorized user accessing other's order):
db.collection("orders").where("userId", "==", "someone_else_uid").get()

// This should SUCCEED (user accessing own order):
db.collection("orders").where("userId", "==", currentUser.uid).get()
```

---

## Contact
For security questions: parul@namonamkeen.com
