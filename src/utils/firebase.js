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
  // Only databaseURL is strictly needed for Realtime Database reads.
  // Add the rest if you use Auth, Storage, etc.
  databaseURL: "https://automapping-parking-slot-default-rtdb.asia-southeast1.firebasedatabase.app",
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
export async function requestFCMToken() {
  try {
    const token = await getToken(messaging, {
      vapidKey: 'BM_9z_XZPL1A-NT1Qe7-m6LLTo0hlwbWBmNUsj0zZTiCtuKI3iMLl5k06XuD08yQobDL1i5vmeXnxIMWjQICcms', // Replace with your VAPID key from Firebase console
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
