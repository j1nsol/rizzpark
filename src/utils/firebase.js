/**
 * firebase.js — Firebase client config for the driver-facing Rizz.Park app.
 *
 * This uses the Firebase JS SDK (client-side), NOT the admin SDK.
 * The Pi uses firebase-admin (server-side) to push data.
 * The web app uses this client SDK to read data in real time.
 */

import { initializeApp } from 'firebase/app';
import { getDatabase, ref, remove, update, set } from 'firebase/database';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';

const firebaseConfig = {
  apiKey: "AIzaSyAQdadrOY92XZKyEWHDkwglxT7taiGWJhE",
  authDomain: "automapping-parking-slot.firebaseapp.com",
  databaseURL: "https://automapping-parking-slot-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "automapping-parking-slot",
  storageBucket: "automapping-parking-slot.firebasestorage.app",
  messagingSenderId: "743840389881",
  appId: "1:743840389881:web:9d395e61f3299511752028",
  measurementId: "G-4N6DTD95WS"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export const messaging = getMessaging(app);

// Permanently removes a slot from Firebase at /parking/slots/{id}.
// Throws on network or permission errors — callers should handle.
export async function deleteSlot(id) {
  await remove(ref(db, `parking/slots/${id}`));
}

// Writes a manual status override for a slot.
// status must be 'Occupied' or 'Vacant' (PascalCase, matching Firebase convention).
// Sets isOverridden: true so detection results are ignored for this slot.
export async function setSlotOverride(id, status) {
  await update(ref(db, `parking/slots/${id}`), {
    manualStatus: status,
    isOverridden: true,
  });
}

// Clears the manual override, returning the slot to detection-driven status.
export async function clearSlotOverride(id) {
  await update(ref(db, `parking/slots/${id}`), {
    manualStatus: null,
    isOverridden: false,
  });
}

// Writes the showSelectedBox setting to /settings/showSelectedBox.
// Controls whether the Selected Box card is visible in the Driver UI.
export async function setShowSelectedBox(value) {
  await set(ref(db, 'settings/showSelectedBox'), value);
}

// ── FCM Push Notification Helpers ────────────────────────────────────────

// Request FCM token and store it in Firebase for push notifications
export async function requestFCMToken(serviceWorkerRegistration) {
  try {
    // Clear any stale push subscription — a leftover subscription with a
    // different VAPID key causes a "push service error" AbortError.
    if (serviceWorkerRegistration) {
      const existing = await serviceWorkerRegistration.pushManager.getSubscription();
      if (existing) await existing.unsubscribe();
    }

    const token = await getToken(messaging, {
      vapidKey: 'BKIbLxlszgR95LOgvBj766-OSlcSJanIlELAJ2UsOv0oZJh-6S5Iww8VWOPPEQT6XyaH9HmQoU0_5S0Lg9IMR1A',
      serviceWorkerRegistration,
    });
    
    if (token) {
      // Store token in Firebase Realtime Database
      await set(ref(db, `fcm_tokens/${token}`), {
        token,
        timestamp: Date.now(),
        userAgent: navigator.userAgent,
      });
      return token;
    }
  } catch (error) {
    console.error('Error getting FCM token:', error);
    throw error;
  }
}

// Handle incoming FCM messages when app is in foreground
export function onFCMMessage(callback) {
  return onMessage(messaging, (payload) => {
    console.log('Received FCM message:', payload);
    callback(payload);
  });
}

// Delete FCM token from Firebase (for cleanup)
export async function deleteFCMToken(token) {
  try {
    await remove(ref(db, `fcm_tokens/${token}`));
  } catch (error) {
    console.error('Error deleting FCM token:', error);
  }
}
