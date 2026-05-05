/**
 * firebase.js — Firebase client config for the driver-facing Rizz.Park app.
 *
 * This uses the Firebase JS SDK (client-side), NOT the admin SDK.
 * The Pi uses firebase-admin (server-side) to push data.
 * The web app uses this client SDK to read data in real time.
 */

import { initializeApp } from 'firebase/app';
import { getDatabase, ref, remove, update, set } from 'firebase/database';

const firebaseConfig = {
  // Only databaseURL is strictly needed for Realtime Database reads.
  // Add the rest if you use Auth, Storage, etc.
  databaseURL: "https://automapping-parking-slot-default-rtdb.asia-southeast1.firebasedatabase.app",
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);

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
