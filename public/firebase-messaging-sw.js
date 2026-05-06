importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// Activate immediately so getToken() never gets an installing/waiting SW
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// Initialize Firebase in the service worker
firebase.initializeApp({
  apiKey: "AIzaSyAQdadrOY92XZKyEWHDkwglxT7taiGWJhE",
  authDomain: "automapping-parking-slot.firebaseapp.com",
  databaseURL: "https://automapping-parking-slot-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "automapping-parking-slot",
  storageBucket: "automapping-parking-slot.firebasestorage.app",
  messagingSenderId: "743840389881",
  appId: "1:743840389881:web:9d395e61f3299511752028"
});

// Retrieve Firebase Messaging object
const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log('Received background message:', payload);
  
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: 'parking-notification',
    requireInteraction: true,
    data: payload.data
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  console.log('Notification click received:', event);
  
  event.notification.close();
  
  // This opens your app when notification is clicked
  event.waitUntil(
    clients.openWindow('/')
  );
});