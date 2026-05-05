// ── Service Worker Testing Utilities ───────────────────────────────────────

/**
 * Test service worker registration and functionality
 */
export async function testServiceWorker() {
  const results = {
    supported: false,
    registered: false,
    controller: false,
    scope: null,
    state: null,
    errors: []
  };

  try {
    // Check if service workers are supported
    if (!('serviceWorker' in navigator)) {
      results.errors.push('Service workers are not supported in this browser');
      return results;
    }
    results.supported = true;

    // Check if service worker is registered
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) {
      results.errors.push('No service worker registration found');
      return results;
    }
    results.registered = true;
    results.scope = registration.scope;

    // Check if service worker is controlling the page
    if (!navigator.serviceWorker.controller) {
      results.errors.push('Service worker is not controlling the page');
    } else {
      results.controller = true;
    }

    // Get service worker state
    if (registration.active) {
      results.state = registration.active.state;
    } else if (registration.installing) {
      results.state = 'installing';
    } else if (registration.waiting) {
      results.state = 'waiting';
    }

    return results;
  } catch (error) {
    results.errors.push(`Error testing service worker: ${error.message}`);
    return results;
  }
}

/**
 * Test notification permissions
 */
export async function testNotificationPermissions() {
  const results = {
    supported: false,
    permission: 'default',
    granted: false,
    errors: []
  };

  try {
    // Check if notifications are supported
    if (!('Notification' in window)) {
      results.errors.push('Notifications are not supported in this browser');
      return results;
    }
    results.supported = true;

    // Get current permission
    results.permission = Notification.permission;
    results.granted = Notification.permission === 'granted';

    return results;
  } catch (error) {
    results.errors.push(`Error testing notifications: ${error.message}`);
    return results;
  }
}

/**
 * Test FCM functionality
 */
export async function testFCM() {
  const results = {
    supported: false,
    token: null,
    errors: []
  };

  try {
    // Check if FCM is supported
    if (!import.meta.env || !import.meta.env.DEV) {
      // This is a basic check - in production, you'd use the actual FCM SDK
      results.supported = 'serviceWorker' in navigator && 'PushManager' in window;
    } else {
      results.supported = true;
    }

    return results;
  } catch (error) {
    results.errors.push(`Error testing FCM: ${error.message}`);
    return results;
  }
}

/**
 * Run all tests and return comprehensive results
 */
export async function runAllTests() {
  const swTest = await testServiceWorker();
  const notifTest = await testNotificationPermissions();
  const fcmTest = await testFCM();

  return {
    serviceWorker: swTest,
    notifications: notifTest,
    fcm: fcmTest,
    overall: {
      success: swTest.registered && swTest.controller && notifTest.granted,
      readyForPush: swTest.registered && swTest.controller && notifTest.granted && fcmTest.supported
    }
  };
}

/**
 * Log test results to console
 */
export function logTestResults(results) {
  console.group('🧪 Service Worker Test Results');
  
  console.log('Service Worker:', {
    supported: results.serviceWorker.supported,
    registered: results.serviceWorker.registered,
    controller: results.serviceWorker.controller,
    state: results.serviceWorker.state,
    scope: results.serviceWorker.scope
  });

  console.log('Notifications:', {
    supported: results.notifications.supported,
    permission: results.notifications.permission,
    granted: results.notifications.granted
  });

  console.log('FCM:', {
    supported: results.fcm.supported
  });

  console.log('Overall:', {
    success: results.overall.success,
    readyForPush: results.overall.readyForPush
  });

  // Log any errors
  const allErrors = [
    ...results.serviceWorker.errors,
    ...results.notifications.errors,
    ...results.fcm.errors
  ];

  if (allErrors.length > 0) {
    console.group('❌ Errors');
    allErrors.forEach(error => console.error(error));
    console.groupEnd();
  }

  console.groupEnd();
}
