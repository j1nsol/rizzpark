importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

// Initialize Firebase in the service worker
firebase.initializeApp({
  apiKey: "your-api-key",
  authDomain: "automapping-parking-slot.firebaseapp.com",
  databaseURL: "https://automapping-parking-slot-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "automapping-parking-slot",
  storageBucket: "automapping-parking-slot.appspot.com",
  messagingSenderId: "your-sender-id",
  appId: "your-app-id"
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