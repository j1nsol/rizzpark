// ── Service Worker for Rizz Park PWA ────────────────────────────────────────
// Handles Firebase Cloud Messaging and background notifications

importScripts('https://www.gstatic.com/firebasejs/9.22.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.1/firebase-messaging-compat.js');

// Firebase configuration (same as in firebase.js)
const firebaseConfig = {
  databaseURL: "https://automapping-parking-slot-default-rtdb.asia-southeast1.firebasedatabase.app",
};

// Initialize Firebase in service worker
firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// ── FCM Background Message Handler ───────────────────────────────────────
messaging.onBackgroundMessage((payload) => {
  console.log('Received background message:', payload);

  // Extract notification data
  const { title, body, icon, tag, data } = payload.notification || {};
  const slotData = data || {};

  // Create notification options
  const notificationOptions = {
    body: body || `Slot ${slotData.slotId || 'Unknown'} is now available!`,
    icon: icon || '/logo192.png',
    badge: '/favicon.ico',
    tag: tag || `slot-${slotData.slotId || 'unknown'}`,
    requireInteraction: true,
    actions: [
      {
        action: 'view-slot',
        title: 'View Slot',
        icon: '/favicon.ico'
      },
      {
        action: 'dismiss',
        title: 'Dismiss'
      }
    ],
    data: slotData
  };

  // Show the notification
  self.registration.showNotification(
    title || 'Rizz Park — Slot Available!',
    notificationOptions
  );
});

// ── Notification Click Handler ─────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  console.log('Notification clicked:', event);
  
  // Close the notification
  event.notification.close();

  // Handle different actions
  if (event.action === 'dismiss') {
    return; // Just close the notification
  }

  // Get the slot data from notification
  const slotData = event.notification.data || {};
  const slotId = slotData.slotId;

  // Create URL to open the app with specific slot
  let url = '/';
  if (slotId) {
    url += `?slot=${slotId}`;
  }

  // Open or focus the app
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Check if app is already open
        for (const client of clientList) {
          if (client.url === self.registration.scope && 'focus' in client) {
            return client.focus();
          }
        }
        
        // Open new window if app is not open
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});

// ── Push Event Handler ────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  console.log('Push event received:', event);
  
  if (!event.data) {
    console.log('Push event has no data');
    return;
  }

  const data = event.data.json();
  const { title, body, icon, tag, slotId, row } = data;

  const notificationOptions = {
    body: body || `Slot ${slotId || 'Unknown'} (Row ${row || 'Unknown'}) just opened up.`,
    icon: icon || '/logo192.png',
    badge: '/favicon.ico',
    tag: tag || `slot-${slotId || 'unknown'}`,
    requireInteraction: true,
    actions: [
      {
        action: 'view-slot',
        title: 'View Slot',
        icon: '/favicon.ico'
      },
      {
        action: 'dismiss',
        title: 'Dismiss'
      }
    ],
    data: { slotId, row }
  };

  event.waitUntil(
    self.registration.showNotification(
      title || 'Rizz Park — Slot Available!',
      notificationOptions
    )
  );
});

// ── Service Worker Lifecycle ───────────────────────────────────────────────
self.addEventListener('install', (event) => {
  console.log('Service worker installing...');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('Service worker activating...');
  event.waitUntil(self.clients.claim());
});