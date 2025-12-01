const CACHE_NAME = 'namo-v8';
const urlsToCache = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/logo.jpg',
  'privacy.html',
  'terms.html',
  'pricelist.html',
  'blog.html', // <--- Added this
  'story.html',
  'faq.html'
];

// 1. Install: Force new SW to activate immediately
self.addEventListener('install', event => {
  self.skipWaiting(); // Crucial: Kick out the old SW
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
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim(); // Take control of the page immediately
});

// 3. Fetch: Network First, Fallback to Cache (Safer for updates)
self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // If network works, return response
        return response;
      })
      .catch(() => {
        // If network fails (offline), try cache
        return caches.match(event.request);
      })
  );
});

self.addEventListener('push', function (event) {
  const data = event.data.json();
  const options = {
    body: data.body,
    icon: '/logo.jpg',
    badge: '/logo.jpg',
    data: { url: data.url || '/' }
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});