// ── Firebase Cloud Functions for Rizz Park Push Notifications ───────────────
// Monitors parking slot changes and sends push notifications via FCM

const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

const db = admin.database();
const messaging = admin.messaging();

const TOKEN_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days

function getStatus(slot) {
  return slot?.status?.toLowerCase() || slot?.manualStatus?.toLowerCase();
}

// Returns tokens that are unexpired, not suppressed, and subscribed to pinCode (or 'all').
// Pass pinCode=null for the legacy /parking path (only 'all' subscribers).
function filterValidTokens(tokens, pinCode) {
  return Object.keys(tokens).filter(token => {
    const data = tokens[token];
    if (Date.now() - (data.timestamp || 0) >= TOKEN_MAX_AGE) return false;
    if (data.suppressed === true) return false;
    const subs = data.subscribedPins;
    if (!subs || subs.includes('all')) return true;
    return pinCode ? subs.includes(pinCode) : false;
  });
}

// Sends a multicast message in ≤500-token batches, cleans up invalid tokens, returns counts.
async function sendBatched(validTokens, message, logTag) {
  const batchSize = 500;
  const batches = [];
  for (let i = 0; i < validTokens.length; i += batchSize) {
    batches.push(validTokens.slice(i, i + batchSize));
  }

  const results = await Promise.allSettled(
    batches.map(batch => messaging.sendEachForMulticast({ tokens: batch, ...message }))
  );

  let successCount = 0;
  let failureCount = 0;
  const invalidTokens = [];

  results.forEach((result, batchIndex) => {
    if (result.status === 'fulfilled') {
      successCount += result.value.successCount;
      failureCount += result.value.failureCount;
      result.value.responses.forEach((resp, tokenIndex) => {
        if (!resp.success) {
          const token = batches[batchIndex][tokenIndex];
          invalidTokens.push(token);
          console.log(`${logTag} failed token ...${token.slice(-8)}: ${resp.error?.code}`);
        }
      });
    } else {
      failureCount += batches[batchIndex].length;
      console.error(`${logTag} batch ${batchIndex} rejected:`, result.reason);
    }
  });

  if (invalidTokens.length > 0) {
    await Promise.allSettled(invalidTokens.map(t => db.ref(`fcm_tokens/${t}`).remove()));
  }

  return { successCount, failureCount };
}

// ── Main lot: slot-available + parking-full (consolidated from 2 → 1) ────────
exports.onSlotChange = functions.database
  .ref('/parking/slots/{slotId}')
  .onUpdate(async (change, context) => {
    const { slotId } = context.params;
    const before = change.before.val();
    const after  = change.after.val();

    const beforeStatus = getStatus(before);
    const afterStatus  = getStatus(after);

    const slotFreed        = beforeStatus === 'occupied' && afterStatus === 'vacant';
    const slotBecameOccupied = afterStatus === 'occupied' && beforeStatus !== 'occupied';

    if (!slotFreed && !slotBecameOccupied) return null;

    const tokensSnap = await db.ref('fcm_tokens').once('value');
    const tokens = tokensSnap.val() || {};
    const validTokens = filterValidTokens(tokens, null);
    if (validTokens.length === 0) return null;

    if (slotFreed) {
      const row   = after.row || slotId.charAt(0) || 'Unknown';
      const title = 'Rizz Park — Slot Available!';
      const body  = `Slot ${slotId} (Row ${row}) just opened up.`;
      const tag   = `slot-${slotId}`;

      const { successCount, failureCount } = await sendBatched(validTokens, {
        notification: { title, body },
        webpush: {
          notification: { title, body, icon: '/logo192.png', badge: '/favicon.ico', tag, requireInteraction: true },
          fcmOptions: { link: 'https://rizzpark.vercel.app/' },
        },
        data: { slotId, row, type: 'slot_available', timestamp: Date.now().toString() },
      }, `[main/${slotId}]`);

      console.log(`Slot ${slotId} freed: ${successCount} sent, ${failureCount} failed`);

      await db.ref('notification_logs').push({
        slotId, row, type: 'slot_available',
        sentCount: successCount, failedCount: failureCount,
        timestamp: admin.database.ServerValue.TIMESTAMP,
      });

    } else {
      // slotBecameOccupied — check if entire lot is now full
      const allSlotsSnap = await db.ref('/parking/slots').once('value');
      const allSlots = Object.values(allSlotsSnap.val() || {});
      if (allSlots.length === 0 || !allSlots.every(s => getStatus(s) === 'occupied')) return null;

      console.log('All main lot slots occupied — sending parking full notification');
      const title = 'Rizz Park — Parking Full!';
      const body  = 'Ground Floor is completely full — no slots available.';

      await sendBatched(validTokens, {
        notification: { title, body },
        webpush: {
          notification: { title, body, icon: '/logo192.png', badge: '/favicon.ico', tag: 'full-ground-floor', requireInteraction: false },
          fcmOptions: { link: 'https://rizzpark.vercel.app/' },
        },
        data: { type: 'parking_full', timestamp: Date.now().toString() },
      }, '[main/full]');
    }

    return null;
  });

// ── Pin lot: slot-available + parking-full (consolidated from 2 → 1) ─────────
exports.onPinSlotChange = functions.database
  .ref('/locations/{pinCode}/slots/{slotId}')
  .onUpdate(async (change, context) => {
    const { pinCode, slotId } = context.params;
    const before = change.before.val();
    const after  = change.after.val();

    const beforeStatus = getStatus(before);
    const afterStatus  = getStatus(after);

    const slotFreed          = beforeStatus === 'occupied' && afterStatus === 'vacant';
    const slotBecameOccupied = afterStatus === 'occupied' && beforeStatus !== 'occupied';

    if (!slotFreed && !slotBecameOccupied) return null;

    const tokensSnap = await db.ref('fcm_tokens').once('value');
    const tokens = tokensSnap.val() || {};
    const validTokens = filterValidTokens(tokens, pinCode);
    if (validTokens.length === 0) return null;

    if (slotFreed) {
      const row   = after.row || slotId.charAt(0) || 'Unknown';
      const title = 'Rizz Park — Slot Available!';
      const body  = `[${pinCode}] Slot ${slotId} (Row ${row}) just opened up.`;
      const tag   = `slot-${pinCode}-${slotId}`;

      const { successCount, failureCount } = await sendBatched(validTokens, {
        notification: { title, body },
        webpush: {
          notification: { title, body, icon: '/logo192.png', badge: '/favicon.ico', tag, requireInteraction: true },
          fcmOptions: { link: `https://rizzpark.vercel.app/${pinCode}` },
        },
        data: { slotId, row, pinCode, type: 'slot_available', timestamp: Date.now().toString() },
      }, `[${pinCode}/${slotId}]`);

      console.log(`[${pinCode}] Slot ${slotId} freed: ${successCount} sent, ${failureCount} failed`);

    } else {
      // slotBecameOccupied — check if entire pin lot is now full
      const allSlotsSnap = await db.ref(`/locations/${pinCode}/slots`).once('value');
      const allSlots = Object.values(allSlotsSnap.val() || {});
      if (allSlots.length === 0 || !allSlots.every(s => getStatus(s) === 'occupied')) return null;

      console.log(`[${pinCode}] All slots occupied — sending parking full notification`);
      const title = 'Rizz Park — Parking Full!';
      const body  = `[${pinCode}] All parking slots are now occupied.`;

      await sendBatched(validTokens, {
        notification: { title, body },
        webpush: {
          notification: { title, body, icon: '/logo192.png', badge: '/favicon.ico', tag: `full-${pinCode}`, requireInteraction: false },
          fcmOptions: { link: `https://rizzpark.vercel.app/${pinCode}` },
        },
        data: { pinCode, type: 'parking_full', timestamp: Date.now().toString() },
      }, `[${pinCode}/full]`);
    }

    return null;
  });

// ── Cleanup Expired Tokens ────────────────────────────────────────────────────
exports.cleanupExpiredTokens = functions.pubsub
  .schedule('0 2 * * *')
  .timeZone('UTC')
  .onRun(async () => {
    console.log('Starting expired token cleanup');

    try {
      const tokensSnapshot = await db.ref('fcm_tokens').once('value');
      const tokens = tokensSnapshot.val() || {};

      const now = Date.now();
      const expiredTokens = Object.entries(tokens)
        .filter(([, data]) => now - (data.timestamp || 0) > TOKEN_MAX_AGE)
        .map(([token]) => token);

      if (expiredTokens.length > 0) {
        await Promise.allSettled(expiredTokens.map(token => db.ref(`fcm_tokens/${token}`).remove()));
        console.log(`Cleaned up ${expiredTokens.length} expired tokens`);
      } else {
        console.log('No expired tokens found');
      }

      return { cleanedUp: expiredTokens.length };
    } catch (error) {
      console.error('Error during token cleanup:', error);
      throw error;
    }
  });

// ── Test Notification ─────────────────────────────────────────────────────────
exports.sendTestNotification = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const { slotId = 'A1', row = 'A' } = data;

  try {
    const tokensSnapshot = await db.ref('fcm_tokens').once('value');
    const tokens = tokensSnapshot.val() || {};
    const validTokens = Object.keys(tokens);

    if (validTokens.length === 0) {
      return { success: false, error: 'No FCM tokens found' };
    }

    const title = 'Rizz Park — Test Notification';
    const body  = `Test: Slot ${slotId} (Row ${row}) is now available!`;
    const tag   = `test-${Date.now()}`;

    const response = await messaging.sendEachForMulticast({
      tokens: validTokens,
      notification: { title, body },
      webpush: {
        notification: { title, body, icon: '/logo192.png', badge: '/favicon.ico', tag, requireInteraction: false },
        fcmOptions: { link: '/' },
      },
      data: { slotId, row, type: 'test_notification', timestamp: Date.now().toString() },
    });

    return { success: true, successCount: response.successCount, failureCount: response.failureCount };
  } catch (error) {
    console.error('Error sending test notification:', error);
    throw new functions.https.HttpsError('internal', 'Failed to send test notification');
  }
});
