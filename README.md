# Namo Namkeen E-commerce Website

> **The Royal Taste of Indore** - Authentic Indian sweets and snacks delivered to your doorstep

A full-featured Progressive Web App (PWA) for Namo Namkeen, specializing in traditional Indian namkeen and sweets with modern e-commerce capabilities.

![Version](https://img.shields.io/badge/version-1.0.0-orange) ![Firebase](https://img.shields.io/badge/Firebase-v9.23.0-yellow) ![Status](https://img.shields.io/badge/status-production-green)

---

## 📋 Table of Contents

- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Getting Started](#-getting-started)
- [Configuration](#-configuration)
- [Deployment](#-deployment)
- [Admin Panel](#-admin-panel)
- [Contributing](#-contributing)
- [License](#-license)

---

## ✨ Features

### Customer Features

#### 🛍️ **Shopping Experience**
- **Product Catalog**: Browse extensive collection of authentic Indian snacks and sweets
- **Advanced Search**: Fuzzy search with autocomplete suggestions and synonyms support (e.g., "kaju" → "cashew")
- **Smart Filtering**: Filter by categories (Spicy, Sweet, Premium, All)
- **Sorting Options**: Sort by price (low to high, high to low) and customer ratings
- **Product Details**: Detailed product modals with images, descriptions, nutritional info, and customer reviews

#### 🛒 **Cart & Checkout**
- **Dynamic Cart**: Real-time cart updates with quantity adjustments
- **Multiple Payment Methods**:
  - Razorpay integration (UPI, Cards, Net Banking)
  - Cash on Delivery (COD)
- **Coupon System**: Apply discount codes and promo offers
- **Loyalty Rewards**: Wallet system for returning customers
- **Delivery Management**: Address saving, delivery note options
- **Free Shipping**: Free delivery on orders above ₹250
- **Invoice Generation**: PDF invoice with QR code for instant payment

#### 👤 **User Account Management**
- **Authentication**: 
  - Google Sign-In
  - Mobile OTP verification with Firebase
- **User Profile**: Edit name, email, phone, address, and profile picture
- **Order History**: View past orders with reorder functionality
- **Wallet History**: Track loyalty points and transactions
- **Referral System**: Refer & earn ₹50 per successful referral

#### 🎁 **Special Features**
- **Custom Hamper Builder**: Create gift hampers by selecting any 3 packs for ₹250
- **Snack Finder Quiz**: Interactive quiz to discover new snacks based on preferences
- **Exit Intent Popup**: Special discount offer when user attempts to leave
- **Announcement Bar**: Admin-controlled announcements for special offers
- **Product Reviews**: Submit reviews with ratings and photos (max 500KB)
- **Video Testimonials**: Customer testimonials with video playback

#### 📱 **Progressive Web App (PWA)**
- **Installable**: Add to home screen on mobile devices
- **Offline Support**: Service worker for offline functionality
- **Push Notifications**: Firebase Cloud Messaging for order updates
- **Responsive Design**: Fully responsive across all devices
- **Mobile Navigation**: Hamburger menu with smooth animations

#### 📄 **Content Pages**
- **Our Story**: Brand narrative and founder's message
- **Blog**: Dynamic blog system with rich content support
- **FAQ**: Frequently asked questions
- **Price List**: Comprehensive product pricing
- **Privacy Policy & Terms**: Legal documentation

---

### Admin Features

#### 📊 **Dashboard & Analytics**
- **Sales Overview**: Real-time sales data with date filters (Daily, Weekly, Monthly, All)
- **Charts & Graphs**: 
  - Sales trends (Chart.js integration)
  - Top-selling products
  - Payment method distribution
- **Key Metrics**: Total revenue, orders count, customer statistics
- **Low Stock Alerts**: Automatic notifications for products running low

#### 📦 **Inventory Management**
- **Product CRUD**: Create, Read, Update, Delete products
- **Rich Product Editor**: 
  - Multiple images upload
  - Nutritional information
  - Category assignment
  - Stock tracking
  - Featured product toggle
- **Bulk Operations**: Export inventory to CSV
- **Search & Filter**: Quick product search with real-time results

#### 🛍️ **Order Management**
- **Order List**: View all orders with status filters
- **Order Details**: Complete order information with customer details
- **Status Updates**: Mark orders as Pending/Processing/Delivered/Cancelled
- **Order Editing**: Modify quantities and recalculate totals
- **WhatsApp Integration**: Direct WhatsApp links for customer communication
- **Export**: Export orders to CSV for reporting

#### 👥 **Customer Management**
- **Customer Database**: View all registered users
- **Customer Details**: Contact information, order history, wallet balance
- **Search & Filter**: Find customers quickly
- **Export**: Export customer list to CSV

#### 💰 **Promotions & Coupons**
- **Coupon Creation**: 
  - Percentage or flat discounts
  - Minimum order requirements
  - Usage limits
  - Expiry dates
- **Coupon Management**: Enable/disable, edit, delete coupons
- **Loyalty Programs**: Configure wallet rewards

#### 📝 **Content Management**
- **Blog Editor**: Create and manage blog posts with rich text editor
- **Announcement Bar**: Update promotional messages
- **Review Moderation**: Approve or delete customer reviews
- **Config Management**: Update delivery charges, free shipping thresholds, store hours

#### 🔒 **Security & Access**
- **Email Whitelist**: Admin access restricted to authorized emails
- **Local Admin Mode**: Development testing without authentication
- **Secure Session**: Firebase authentication
- **XSS Prevention**: Input sanitization on all user data

---

## 🛠️ Tech Stack

### Frontend
- **HTML5**: Semantic markup
- **CSS3**: Custom styling with CSS variables
- **JavaScript (ES6+)**: Vanilla JS with modern features
- **Fonts**: Google Fonts (Playfair Display, Poppins)
- **Icons**: Font Awesome 6.4.0

### Backend & Services
- **Firebase**:
  - Firestore: NoSQL database for products, orders, users, reviews, blogs, coupons
  - Authentication: Google OAuth & Phone OTP
  - Cloud Functions: Email notifications, payment processing
  - Cloud Messaging: Push notifications
  - Hosting: Static website hosting

### Libraries & APIs
- **Razorpay**: Payment gateway integration
- **Nodemailer**: Email service for order confirmations
- **Fuse.js**: Fuzzy search functionality
- **Chart.js**: Analytics visualization
- **html2pdf.js**: Invoice generation
- **Canvas Confetti**: Celebration animations

### Development Tools
- **Firebase CLI**: Deployment and functions management
- **Git**: Version control
- **ESLint**: Code quality (configured for admin)

---

## 📁 Project Structure

```
Website/
├── index.html              # Main landing page
├── style.css               # Global stylesheet (80KB)
├── script.js               # Main application logic (3273 lines)
│
├── admin.html              # Admin panel interface
├── admin.css               # Admin-specific styles
├── admin.js                # Admin functionality (2300 lines)
├── admin-local.html        # Local development admin panel
│
├── blog.html               # Blog listing page
├── story.html              # Brand story page
├── faq.html                # FAQ page
├── pricelist.html          # Product price list
├── privacy.html            # Privacy policy
├── terms.html              # Terms of service
├── 404.html                # Error page
│
├── manifest.json           # PWA manifest
├── admin-manifest.json     # Admin PWA manifest
├── sw.js                   # Service worker
├── admin-sw.js             # Admin service worker
├── firebase-messaging-sw.js # FCM service worker
│
├── assets/
│   ├── images/             # Product images and thumbnails
│   └── videos/             # Customer testimonial videos
│
├── functions/
│   ├── index.js            # Cloud Functions (email, payment)
│   ├── package.json        # Functions dependencies
│   └── .env                # Environment variables
│
├── logo.jpg                # Brand logo
├── namkeen.png             # Product showcase image
├── Robots.txt              # SEO crawling rules
├── firebase.json           # Firebase configuration
├── .firebaserc             # Firebase project alias
└── .gitignore              # Git ignore rules
```

---

## 🚀 Getting Started

### Prerequisites

- Node.js (v14 or higher)
- Firebase CLI: `npm install -g firebase-tools`
- Firebase project with the following services enabled:
  - Firestore
  - Authentication (Google & Phone)
  - Cloud Functions
  - Hosting
  - Cloud Messaging

### Installation

1. **Clone the Repository**
   ```bash
   git clone https://github.com/parul-acc/namonamkeen.git
   cd namonamkeen
   ```

2. **Install Firebase CLI** (if not already installed)
   ```bash
   npm install -g firebase-tools
   firebase login
   ```

3. **Install Cloud Functions Dependencies**
   ```bash
   cd functions
   npm install
   cd ..
   ```

4. **Configure Firebase**
   
   Update Firebase configuration in `script.js` and `admin.js`:
   ```javascript
   const firebaseConfig = {
       apiKey: "YOUR_API_KEY",
       authDomain: "YOUR_PROJECT.firebaseapp.com",
       projectId: "YOUR_PROJECT_ID",
       storageBucket: "YOUR_PROJECT.firebasestorage.app",
       messagingSenderId: "YOUR_SENDER_ID",
       appId: "YOUR_APP_ID"
   };
   ```

5. **Configure Cloud Functions Environment**
   
   In `functions/.env`:
   ```
   RAZORPAY_KEY_ID=your_razorpay_key_id
   RAZORPAY_KEY_SECRET=your_razorpay_secret
   ```

6. **Update Admin Email Whitelist**
   
   In `admin.js`, line 3:
   ```javascript
   const ADMIN_EMAILS = ["your.email@example.com"];
   ```

### Local Development

1. **Run Locally**
   ```bash
   firebase serve
   ```
   Open `http://localhost:5000` in your browser

2. **Test Admin Panel Locally**
   - Open `admin-local.html` directly in browser
   - No authentication required for local testing

3. **Test Cloud Functions Locally**
   ```bash
   cd functions
   firebase emulators:start
   ```

---

## ⚙️ Configuration

### Firestore Collections Structure

```
products/           # Product catalog
  ├── {productId}
      ├── name
      ├── price
      ├── images[]
      ├── category
      ├── stock
      ├── featured
      └── reviews[]

orders/             # Customer orders
  ├── {orderId}
      ├── userId
      ├── items[]
      ├── total
      ├── status
      ├── timestamp
      └── paymentMethod

users/              # User profiles
  ├── {userId}
      ├── displayName
      ├── email
      ├── phone
      ├── addresses[]
      ├── walletBalance
      └── referralCode

coupons/            # Discount coupons
  ├── {couponId}
      ├── code
      ├── discountValue
      ├── type
      ├── minOrder
      └── expiryDate

blogs/              # Blog posts
reviews/            # Product reviews
config/             # Global configuration
  └── settings
      ├── deliveryCharge
      ├── freeShippingThreshold
      └── announcement
```

### Firebase Security Rules

Ensure proper security rules are configured in Firestore for data protection.

---

## 🚀 Deployment

### Deploy to Firebase Hosting

1. **Build the Project** (if applicable)
   ```bash
   # No build step required for vanilla JS
   ```

2. **Deploy**
   ```bash
   firebase deploy
   ```

3. **Deploy Only Hosting**
   ```bash
   firebase deploy --only hosting
   ```

4. **Deploy Only Functions**
   ```bash
   firebase deploy --only functions
   ```

### Post-Deployment Checklist

- [ ] Test Google Sign-In
- [ ] Test Phone OTP authentication
- [ ] Verify Razorpay test payment
- [ ] Check email notifications
- [ ] Test PWA installation
- [ ] Verify admin panel access
- [ ] Test all CRUD operations

---

## 🔐 Admin Panel

### Access

**Production**: `https://your-domain.com/admin.html`
**Local Testing**: Open `admin-local.html` directly

### Admin Credentials

Only whitelisted email addresses can access the admin panel. Update the `ADMIN_EMAILS` array in `admin.js`.

### Admin Features Overview

1. **Dashboard**: Sales analytics, charts, and KPIs
2. **Inventory**: Manage products, stock, and images
3. **Orders**: Process and track customer orders
4. **Customers**: View and manage user database
5. **Coupons**: Create and manage discount codes
6. **Reviews**: Moderate customer reviews
7. **Blogs**: Publish and edit blog content
8. **Config**: Update global settings

---

## 🔧 Troubleshooting

### Common Issues

**Issue**: Firebase authentication not working
- **Solution**: Check Firebase console for correct OAuth settings and authorized domains

**Issue**: Payment failing
- **Solution**: Verify Razorpay API keys in Cloud Functions `.env` file

**Issue**: Service worker not registering
- **Solution**: Ensure you're testing on HTTPS or localhost

**Issue**: Admin panel not accessible
- **Solution**: Verify your email is in the `ADMIN_EMAILS` whitelist

---

## 📧 Contact & Support

- **Email**: contact@namonamkeen.shop
- **Phone**: +91 98266 98822
- **Location**: 131, Keshav Park, Mhow (M.P.)
- **Developer**: Parul Gangwal

---

## 📄 License

© 2025 Namo Namkeen. All Rights Reserved.

---

## 🙏 Acknowledgements

- Firebase for backend infrastructure
- Razorpay for payment processing
- Font Awesome for iconography
- Google Fonts for typography
- All customers and supporters of Namo Namkeen!

---

**Made with ❤️ by Parul Gangwal**
