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

// Service Worker debug flag (set to true manually in developer tools if needed)
self.DEBUG = self.DEBUG === true || false;

// 1. Background Handler
messaging.onBackgroundMessage(function (payload) {
  if (self.DEBUG) console.log('[firebase-messaging-sw.js] Received background message ', payload);
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

// 2. Handle Notification Click (Opens App)
self.addEventListener('notificationclick', function (event) {
  console.log('[Service Worker] Notification Clicked');
  event.notification.close();

  // Open the URL from the data, or default to home
  let urlToOpen = (event.notification.data && event.notification.data.url) ? event.notification.data.url : '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      // If app is already open, focus it
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url.includes(self.registration.scope) && 'focus' in client) {
          return client.focus().then(c => c.navigate(urlToOpen));
        }
      }
      // If not open, open a new window
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

const CACHE_NAME = 'namo-v51'; // Major Version Update for Freshness
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
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

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

// 4. Fetch Strategy: Network First for Core Files, Cache First for Assets
self.addEventListener('fetch', event => {
  // IGNORE Firestore/Google API requests
  if (event.request.url.includes('firestore.googleapis.com') ||
    event.request.url.includes('googleapis.com')) {
    return;
  }

  const req = event.request;
  const url = new URL(req.url);

  // NETWORK FIRST: HTML, JS, CSS, JSON (Ensure users see latest code/content)
  if (req.mode === 'navigate' ||
    url.pathname.endsWith('.html') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.json')) {

    event.respondWith(
      fetch(req).then(networkRes => {
        // Update cache with new version
        return caches.open(CACHE_NAME).then(cache => {
          cache.put(req, networkRes.clone());
          return networkRes;
        });
      }).catch(() => {
        // Fallback to cache if offline
        return caches.match(req);
      })
    );
  } else {
    // CACHE FIRST: Images, Fonts, etc. (Performance)
    event.respondWith(
      caches.match(req).then(cachedRes => {
        return cachedRes || fetch(req).then(networkRes => {
          return caches.open(CACHE_NAME).then(cache => {
            cache.put(req, networkRes.clone());
            return networkRes;
          });
        });
      })
    );
  }
});