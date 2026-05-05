// Test script to verify service worker registration and push notification support
// Run this in browser console to test

(async function testServiceWorker() {
  console.log('🔍 Testing Service Worker and Push Notifications...');
  
  try {
    // Check basic support
    if (!('serviceWorker' in navigator)) {
      console.error('❌ Service Worker not supported');
      return;
    }
    
    if (!('PushManager' in window)) {
      console.error('❌ Push notifications not supported');
      return;
    }
    
    console.log('✅ Service Worker and Push API supported');
    
    // Check service worker registration
    const registrations = await navigator.serviceWorker.getRegistrations();
    console.log(`📋 Found ${registrations.length} service worker registrations:`, registrations);
    
    // Check active service worker
    const registration = await navigator.serviceWorker.ready;
    console.log('✅ Service Worker ready:', registration.active);
    
    // Check push subscription
    const subscription = await registration.pushManager.getSubscription();
    console.log('📱 Push subscription:', subscription);
    
    // Check notification permission
    const permission = Notification.permission;
    console.log(`🔔 Notification permission: ${permission}`);
    
    if (permission !== 'granted') {
      console.log('⚠️ Requesting notification permission...');
      const newPermission = await Notification.requestPermission();
      console.log(`🔔 New permission: ${newPermission}`);
    }
    
    // Test notification
    if (Notification.permission === 'granted') {
      console.log('🧪 Testing notification...');
      const testNotification = new Notification('Test Notification', {
        body: 'This is a test notification from Rizz Park',
        icon: '/logo192.png',
        badge: '/favicon.ico',
        tag: 'test-notification'
      });
      
      setTimeout(() => testNotification.close(), 5000);
      console.log('✅ Test notification sent');
    }
    
    console.log('🎉 Service Worker test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
})();
