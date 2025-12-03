importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyB-Ep3yEAzFBlqOVGOxhjbmjwlSH0Xx5qU",
  authDomain: "namo-namkeen-app.firebaseapp.com",
  projectId: "namo-namkeen-app",
  storageBucket: "namo-namkeen-app.firebasestorage.app",
  messagingSenderId: "154786466552",
  appId: "1:154786466552:web:9be55b7b599806f536490d"
});

const messaging = firebase.messaging();

// 1. Background Handler
messaging.onBackgroundMessage(function (payload) {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  // Customize notification here
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/logo.jpg',
    badge: '/logo.jpg',
    data: payload.data // Preserve data payload (contains URL)
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

const CACHE_NAME = 'namo-v21'; // Increment Version
const urlsToCache = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/logo.jpg',
  '/manifest.json',
  'privacy.html',
  'terms.html',
  'pricelist.html',
  'blog.html',
  'story.html',
  'faq.html',
  // Cache FontAwesome (Critical for icons)
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

// 2. Install
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

// 3. Activate
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) return caches.delete(cacheName);
        })
      );
    })
  );
  return self.clients.claim();
});

// 4. Fetch
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});

// 5. Notification Click Handler (THE FIX)
self.addEventListener('notificationclick', function(event) {
  console.log('[Service Worker] Notification click Received.');

  event.notification.close(); // Close the notification

  // Open the app to the specific URL
  let urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      // If tab is already open, focus it
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url.includes(self.registration.scope) && 'focus' in client) {
          return client.focus().then(c => c.navigate(urlToOpen));
        }
      }
      // Otherwise open new tab
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});