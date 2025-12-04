// firebase-messaging-sw.js
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

// Service Worker debug flag
self.DEBUG = self.DEBUG === true || false;

messaging.onBackgroundMessage(function(payload) {
  if (self.DEBUG) console.log('[firebase-messaging-sw.js] Received background message ', payload);
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/logo.jpg',
    // CRITICAL: Pass data payload so click handler can use it
    data: payload.data
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// CRITICAL FIX: Add Click Handler to Clear Notification & Open App
self.addEventListener('notificationclick', function(event) {
  console.log('[Service Worker] Notification Clicked');
  
  // 1. Close the notification (Clears it from the tray)
  event.notification.close();

  // 2. Open the URL
  let urlToOpen = (event.notification.data && event.notification.data.url) ? event.notification.data.url : '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      // Check if app is already open
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url.includes(self.registration.scope) && 'focus' in client) {
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