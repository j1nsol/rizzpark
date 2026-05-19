// ── Service Worker for Rizz Park PWA ────────────────────────────────────────
// Handles Firebase Cloud Messaging and background notifications

importScripts('https://www.gstatic.com/firebasejs/9.22.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.1/firebase-messaging-compat.js');

// ── Cache Configuration ───────────────────────────────────────────────────────
const CACHE_NAME = 'rizzpark-v2';
const urlsToCache = [
  '/',
  '/static/js/bundle.js',
  '/static/css/main.css',
  '/logo192.png',
  '/logo512.png',
  '/favicon.ico'
];

// Firebase configuration (same as in firebase.js)
const firebaseConfig = {
  apiKey: "AIzaSyAQdadrOY92XZKyEWHDkwglxT7taiGWJhE",
  authDomain: "automapping-parking-slot.firebaseapp.com",
  databaseURL: "https://automapping-parking-slot-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "automapping-parking-slot",
  storageBucket: "automapping-parking-slot.firebasestorage.app",
  messagingSenderId: "743840389881",
  appId: "1:743840389881:web:9d395e61f3299511752028"
};

// Initialize Firebase in service worker
firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// ── FCM Background Message Handler ───────────────────────────────────────
messaging.onBackgroundMessage((payload) => {
  console.log('Received background message:', payload);

  try {
    // Extract notification data safely
    const notification = payload.notification || {};
    const data = payload.data || {};
    
    const title = notification.title || 'Rizz Park — Slot Available!';
    const body = notification.body || `Slot ${data.slotId || 'Unknown'} is now available!`;
    const icon = notification.icon || '/logo192.png';
    const tag = notification.tag || `slot-${data.slotId || 'unknown'}`;
    
    // Create notification options with safe defaults
    const notificationOptions = {
      body: body,
      icon: icon,
      badge: '/favicon.ico',
      tag: tag,
      requireInteraction: true,
      silent: false,
      data: {
        slotId: data.slotId,
        row: data.row,
        type: data.type || 'slot_available',
        timestamp: data.timestamp || Date.now().toString()
      }
    };

    // Add actions only if supported
    if ('actions' in Notification.prototype) {
      notificationOptions.actions = [
        {
          action: 'view-slot',
          title: 'View Slot',
          icon: '/favicon.ico'
        },
        {
          action: 'dismiss',
          title: 'Dismiss'
        }
      ];
    }

    // Show the notification with error handling
    self.registration.showNotification(title, notificationOptions)
      .then(() => {
        console.log('Notification shown successfully');
      })
      .catch((error) => {
        console.error('Error showing notification:', error);
        // Fallback: try showing a simple notification
        self.registration.showNotification(title, {
          body: body,
          icon: icon,
          tag: tag,
          data: notificationOptions.data
        });
      });
      
  } catch (error) {
    console.error('Error processing background message:', error);
    // Emergency fallback
    self.registration.showNotification('Rizz Park', {
      body: 'A parking slot is now available!',
      icon: '/logo192.png'
    });
  }
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

  // Open or focus the app with better error handling
  event.waitUntil(
    clients.matchAll({ 
      type: 'window', 
      includeUncontrolled: true,
      url: self.registration.scope 
    })
      .then((clientList) => {
        console.log('Found clients:', clientList.length);
        
        // Check if app is already open
        for (const client of clientList) {
          console.log('Checking client URL:', client.url);
          if (client.url && client.url.includes(self.registration.scope.replace(/\/$/, ''))) {
            console.log('Focusing existing client');
            return client.focus()
              .then(() => client.navigate ? client.navigate(url) : null)
              .catch(err => console.log('Focus error:', err));
          }
        }
        
        // Open new window if app is not open
        console.log('Opening new window with URL:', url);
        if (clients.openWindow) {
          return clients.openWindow(url)
            .catch(err => {
              console.error('Error opening window:', err);
              // Fallback: try opening just the root
              return clients.openWindow('/');
            });
        }
      })
      .catch(err => {
        console.error('Error in notification click handler:', err);
        // Final fallback - try to open root
        return clients.openWindow('/');
      })
  );
});

// ── Push Event Handler ────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  console.log('Push event received:', event);
  
  if (!event.data) {
    console.log('Push event has no data - showing default notification');
    event.waitUntil(
      self.registration.showNotification('Rizz Park', {
        body: 'A parking slot is now available!',
        icon: '/logo192.png',
        badge: '/favicon.ico',
        tag: 'default-notification'
      })
    );
    return;
  }

  try {
    const data = event.data.json();
    const { title, body, icon, tag, slotId, row } = data;

    const notificationOptions = {
      body: body || `Slot ${slotId || 'Unknown'} (Row ${row || 'Unknown'}) just opened up.`,
      icon: icon || '/logo192.png',
      badge: '/favicon.ico',
      tag: tag || `slot-${slotId || 'unknown'}`,
      requireInteraction: true,
      data: { slotId, row, type: 'slot_available' }
    };

    // Add actions only if supported
    if ('actions' in Notification.prototype) {
      notificationOptions.actions = [
        {
          action: 'view-slot',
          title: 'View Slot',
          icon: '/favicon.ico'
        },
        {
          action: 'dismiss',
          title: 'Dismiss'
        }
      ];
    }

    event.waitUntil(
      self.registration.showNotification(
        title || 'Rizz Park — Slot Available!',
        notificationOptions
      ).catch(error => {
        console.error('Error showing push notification:', error);
        // Fallback notification
        return self.registration.showNotification('Rizz Park', {
          body: 'A parking slot is now available!',
          icon: '/logo192.png',
          tag: 'fallback-notification'
        });
      })
    );
  } catch (error) {
    console.error('Error parsing push data:', error);
    event.waitUntil(
      self.registration.showNotification('Rizz Park', {
        body: 'A parking slot is now available!',
        icon: '/logo192.png',
        badge: '/favicon.ico',
        tag: 'error-notification'
      })
    );
  }
});

// ── Service Worker Lifecycle ───────────────────────────────────────────────
self.addEventListener('install', (event) => {
  console.log('Service worker installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Caching app shell');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('Skip waiting for new service worker');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('Error during install:', error);
      })
  );
});

self.addEventListener('activate', (event) => {
  console.log('Service worker activating...');
  event.waitUntil(
    Promise.all([
      // Clean up old caches
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              console.log('Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      // Claim all clients
      self.clients.claim()
    ]).then(() => {
      console.log('Service worker activated and claimed clients');
    }).catch((error) => {
      console.error('Error during activation:', error);
    })
  );
});

// ── Error Handling ───────────────────────────────────────────────────────
self.addEventListener('error', (event) => {
  console.error('Service worker error:', event.error);
});

self.addEventListener('unhandledrejection', (event) => {
  console.error('Service worker unhandled rejection:', event.reason);
});

// ── Cache Management for PWA ───────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Cache hit - return response
        if (response) {
          return response;
        }

        // Clone the request
        const fetchRequest = event.request.clone();

        return fetch(fetchRequest).then(
          (response) => {
            // Check if valid response
            if(!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // Clone the response
            const responseToCache = response.clone();

            caches.open(CACHE_NAME)
              .then((cache) => {
                cache.put(event.request, responseToCache);
              });

            return response;
          }
        ).catch(() => {
          // If fetch fails, try to serve from cache
          return caches.match(event.request);
        });
      })
  );
});
