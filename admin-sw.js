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

messaging.onBackgroundMessage(function (payload) {
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/logo.jpg',
    badge: '/logo.jpg',
    data: payload.data
  };
  self.registration.showNotification(notificationTitle, notificationOptions);
});

const CACHE_NAME = 'namo-admin-v26';
const urlsToCache = [
  '/admin.html',
  '/admin.css',
  '/admin.js',
  '/logo.jpg',
  '/admin-manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache)));
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

self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

// 3. Handle Notification Click (THE FIX)
self.addEventListener('notificationclick', function(event) {
  console.log('[Admin SW] Notification Clicked');
  event.notification.close();

  // Default to admin dashboard, or use specific link from payload
  let urlToOpen = (event.notification.data && event.notification.data.url) ? event.notification.data.url : '/admin.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      // Check if Admin Panel is already open
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        // Match base URL
        if (client.url.includes('admin.html') && 'focus' in client) {
          return client.focus().then(c => c.navigate(urlToOpen));
        }
      }
      // If not open, open new window
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});