const CACHE_NAME = 'namo-admin-v2'; // Incremented version to force update
const urlsToCache = [
  '/admin.html',
  '/admin.css', // Important: Cache the new styles
  '/admin.js',  // Important: Cache the new logic
  '/logo.jpg'
];

// 1. Install: Force new SW to activate immediately
self.addEventListener('install', event => {
  self.skipWaiting(); // Kick out the old SW immediately
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

// 2. Activate: Clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old admin cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim(); // Take control of the page immediately
});

// 3. Fetch: Network First, Fallback to Cache
// This ensures you ALWAYS get the latest dashboard if you are online.
self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request)
      .then(response => {
        return response; // Return fresh data from network
      })
      .catch(() => {
        return caches.match(event.request); // Fallback to cache if offline
      })
  );
});