// ── Notification Debugging Tools ─────────────────────────────────────────────

/**
 * Comprehensive notification system diagnostic
 */
export async function runNotificationDiagnostic() {
  console.group('🔍 Notification System Diagnostic');
  
  const results = {
    timestamp: new Date().toISOString(),
    serviceWorker: await diagnoseServiceWorker(),
    notifications: await diagnoseNotifications(),
    fcm: await diagnoseFCM(),
    firebase: await diagnoseFirebaseConfig(),
    overall: { status: 'unknown', issues: [] }
  };

  // Analyze overall status
  const issues = [];
  if (!results.serviceWorker.registered) issues.push('Service worker not registered');
  if (!results.serviceWorker.controller) issues.push('Service worker not controlling page');
  if (!results.notifications.supported) issues.push('Notifications not supported');
  if (!results.notifications.granted) issues.push('Notification permission not granted');
  if (!results.fcm.supported) issues.push('FCM not supported');
  if (!results.fcm.token) issues.push('No FCM token available');
  if (!results.firebase.valid) issues.push('Firebase configuration invalid');

  results.overall.status = issues.length === 0 ? 'healthy' : 'issues_found';
  results.overall.issues = issues;

  logDiagnosticResults(results);
  console.groupEnd();
  
  return results;
}

/**
 * Diagnose service worker status
 */
async function diagnoseServiceWorker() {
  console.log('🔧 Checking service worker...');
  
  const result = {
    supported: 'serviceWorker' in navigator,
    registered: false,
    controller: false,
    state: null,
    scope: null,
    errors: []
  };

  if (!result.supported) {
    result.errors.push('Service workers not supported');
    return result;
  }

  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration) {
      result.registered = true;
      result.scope = registration.scope;
      result.controller = !!navigator.serviceWorker.controller;
      
      if (registration.active) {
        result.state = registration.active.state;
      } else if (registration.installing) {
        result.state = 'installing';
      } else if (registration.waiting) {
        result.state = 'waiting';
      }
    } else {
      result.errors.push('No service worker registration found');
    }
  } catch (error) {
    result.errors.push(`Error checking service worker: ${error.message}`);
  }

  console.log('Service worker result:', result);
  return result;
}

/**
 * Diagnose notification permissions
 */
async function diagnoseNotifications() {
  console.log('🔔 Checking notification permissions...');
  
  const result = {
    supported: 'Notification' in window,
    permission: Notification.permission,
    granted: Notification.permission === 'granted',
    errors: []
  };

  if (!result.supported) {
    result.errors.push('Notifications not supported');
  }

  console.log('Notification result:', result);
  return result;
}

/**
 * Diagnose FCM setup
 */
async function diagnoseFCM() {
  console.log('📱 Checking FCM...');
  
  const result = {
    supported: false,
    token: null,
    errors: []
  };

  try {
    // Check if FCM is available (basic check)
    result.supported = 'serviceWorker' in navigator && 'PushManager' in window;
    
    // Try to get FCM token (this will fail if not properly configured)
    if (result.supported) {
      try {
        // This is a simplified check - in reality you'd use the FCM SDK
        const token = localStorage.getItem('fcm_token');
        if (token) {
          result.token = token;
        } else {
          result.errors.push('No FCM token found in localStorage');
        }
      } catch (error) {
        result.errors.push(`FCM token check failed: ${error.message}`);
      }
    } else {
      result.errors.push('Push notifications not supported');
    }
  } catch (error) {
    result.errors.push(`FCM diagnostic failed: ${error.message}`);
  }

  console.log('FCM result:', result);
  return result;
}

/**
 * Diagnose Firebase configuration
 */
async function diagnoseFirebaseConfig() {
  console.log('🔥 Checking Firebase configuration...');
  
  const result = {
    valid: false,
    issues: [],
    errors: []
  };

  try {
    // Check if Firebase is initialized
    if (typeof firebase !== 'undefined') {
      result.valid = true;
      
      // Check for placeholder values
      const config = {
        apiKey: "your-api-key",
        authDomain: "automapping-parking-slot.firebaseapp.com",
        databaseURL: "https://automapping-parking-slot-default-rtdb.asia-southeast1.firebasedatabase.app",
        projectId: "automapping-parking-slot",
        storageBucket: "automapping-parking-slot.appspot.com",
        messagingSenderId: "your-sender-id",
        appId: "your-app-id"
      };

      Object.entries(config).forEach(([key, value]) => {
        if (value.includes('your-') || value.includes('YOUR_')) {
          result.issues.push(`Firebase ${key} contains placeholder value: ${value}`);
        }
      });

      if (result.issues.length === 0) {
        result.valid = true;
      } else {
        result.valid = false;
      }
    } else {
      result.errors.push('Firebase not initialized');
    }
  } catch (error) {
    result.errors.push(`Firebase diagnostic failed: ${error.message}`);
  }

  console.log('Firebase result:', result);
  return result;
}

/**
 * Log diagnostic results in a readable format
 */
function logDiagnosticResults(results) {
  console.log('📊 Diagnostic Summary:');
  console.log(`Overall Status: ${results.overall.status.toUpperCase()}`);
  
  if (results.overall.issues.length > 0) {
    console.log('Issues Found:');
    results.overall.issues.forEach(issue => console.log(`❌ ${issue}`));
  }

  console.log('\nDetailed Results:');
  console.log('Service Worker:', results.serviceWorker);
  console.log('Notifications:', results.notifications);
  console.log('FCM:', results.fcm);
  console.log('Firebase:', results.firebase);
}

/**
 * Test notification (for debugging)
 */
export async function testNotification() {
  console.log('🧪 Testing notification...');
  
  if (!('Notification' in window)) {
    console.error('Notifications not supported');
    return false;
  }

  if (Notification.permission !== 'granted') {
    console.log('Requesting notification permission...');
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.error('Notification permission denied');
      return false;
    }
  }

  try {
    const notification = new Notification('Test Notification', {
      body: 'This is a test notification from Rizz Park',
      icon: '/logo192.png',
      tag: 'test-notification'
    });

    setTimeout(() => notification.close(), 5000);
    console.log('✅ Test notification sent successfully');
    return true;
  } catch (error) {
    console.error('❌ Failed to send test notification:', error);
    return false;
  }
}

/**
 * Force service worker update
 */
export async function updateServiceWorker() {
  console.log('🔄 Updating service worker...');
  
  if (!('serviceWorker' in navigator)) {
    console.error('Service workers not supported');
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration) {
      await registration.update();
      console.log('✅ Service worker update triggered');
      return true;
    } else {
      console.log('No service worker registration found');
      return false;
    }
  } catch (error) {
    console.error('❌ Failed to update service worker:', error);
    return false;
  }
}
