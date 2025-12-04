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

self.DEBUG = self.DEBUG === true || false;

messaging.onBackgroundMessage(function (payload) {
  if (self.DEBUG) console.log('[firebase-messaging-sw.js] Received background message ', payload);

  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/logo.jpg',
    badge: '/logo.jpg',
    data: payload.data // Pass data to click handler
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// --- NEW: Handle Notification Clicks ---
self.addEventListener('notificationclick', function (event) {
  console.log('[Service Worker] Notification Clicked');

  // 1. Close the notification
  event.notification.close();

  // 2. Define URL to open
  let urlToOpen = (event.notification.data && event.notification.data.url) ? event.notification.data.url : '/';

  // 3. Open the app or focus existing tab
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url.includes(self.registration.scope) && 'focus' in client) {
          return client.focus().then(c => c.navigate(urlToOpen));
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});