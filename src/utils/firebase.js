/**
 * firebase.js — Firebase client config for the driver-facing Rizz.Park app.
 *
 * This uses the Firebase JS SDK (client-side), NOT the admin SDK.
 * The Pi uses firebase-admin (server-side) to push data.
 * The web app uses this client SDK to read data in real time.
 */

import { initializeApp } from 'firebase/app';
import { getDatabase, ref, remove } from 'firebase/database';

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
