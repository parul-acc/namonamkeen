# Namo Namkeen E-commerce Website

This is a fully-featured e-commerce website for "Namo Namkeen," a brand specializing in authentic Indian sweets and snacks. The website provides a seamless user experience for browsing products, placing orders, and managing user accounts, all powered by Firebase for a robust backend.

## Features

*   **Product Catalog:** Browse a wide range of snacks and sweets with detailed descriptions, images, and pricing.
*   **Search and Filtering:** Easily find products using the search bar or filter by categories like "Spicy," "Sweet," and "Premium."
*   **Shopping Cart:** Add products to the cart, adjust quantities, and view the order summary.
*   **User Authentication:** Secure login and registration using Google Sign-In.
*   **Order History:** Registered users can view their past orders and easily reorder their favorite items.
*   **Custom Hamper Builder:** Create a custom gift hamper by selecting from a range of eligible products.
*   **Snack Finder Quiz:** An interactive quiz to help users discover new snacks based on their preferences.
*   **Coupon and Promo Codes:** Apply discount codes to get special offers on orders.
*   **WhatsApp Integration:** Finalize orders by sending a pre-formatted message to the shop's WhatsApp number.
*   **Responsive Design:** The website is fully responsive and works seamlessly on desktops, tablets, and mobile devices.

## Technologies Used

*   **Frontend:** HTML, CSS, JavaScript
*   **Backend:** Firebase (Firestore, Authentication)
*   **APIs:** Google Fonts, Font Awesome, Canvas Confetti

## Setup and Usage

To run this project locally, you will need to have a Firebase project set up with the following services enabled:

*   **Firestore:** For storing product information, user data, and orders.
*   **Authentication:** For managing user accounts with Google Sign-In.

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/parul-acc/namonamkeen.git
    ```
2.  **Navigate to the project directory:**
    ```bash
    cd namonamkeen
    ```
3.  **Update Firebase configuration:**
    Open `script.js` and replace the `firebaseConfig` object with your own Firebase project's configuration.

4.  **Open `index.html` in your browser:**
    You can open the `index.html` file directly in your web browser to view the website.

## File Structure

*   `index.html`: The main HTML file for the website.
*   `style.css`: The stylesheet for the website.
*   `script.js`: The core JavaScript file containing the application logic.
*   `admin.html`, `admin.css`, `admin.js`: Files for the admin panel to manage products and orders.
*   `assets/`: A directory containing images, videos, and other static assets.
*   `manifest.json`: The web app manifest for PWA features.
*   `sw.js`: The service worker for offline capabilities.
