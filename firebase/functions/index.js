// ── Firebase Cloud Functions for Rizz Park Push Notifications ───────────────
// Monitors parking slot changes and sends push notifications via FCM

const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
admin.initializeApp();

const db = admin.database();
const messaging = admin.messaging();

// ── Push Notification Trigger Function ───────────────────────────────────────
exports.onSlotStatusChange = functions.database
  .ref('/parking/slots/{slotId}')
  .onUpdate(async (change, context) => {
    const { slotId } = context.params;
    const before = change.before.val();
    const after = change.after.val();

    // Only trigger when slot changes from occupied to vacant
    const beforeStatus = before.status?.toLowerCase() || before.manualStatus?.toLowerCase();
    const afterStatus = after.status?.toLowerCase() || after.manualStatus?.toLowerCase();

    if (beforeStatus !== 'occupied' || afterStatus !== 'vacant') {
      console.log(`Slot ${slotId} status change not relevant: ${beforeStatus} → ${afterStatus}`);
      return null;
    }

    console.log(`Slot ${slotId} changed from occupied to vacant - sending push notifications`);

    try {
      // Get all FCM tokens
      const tokensSnapshot = await db.ref('fcm_tokens').once('value');
      const tokens = tokensSnapshot.val() || {};

      if (Object.keys(tokens).length === 0) {
        console.log('No FCM tokens found');
        return null;
      }

      // Row is in the slot data itself
      const row = after.row || slotId.charAt(0) || 'Unknown';

      // Create notification payload
      const payload = {
        notification: {
          title: 'Rizz Park — Slot Available!',
          body: `Slot ${slotId} (Row ${row}) just opened up.`,
          icon: '/logo192.png',
          badge: '/favicon.ico',
          tag: `slot-${slotId}`,
          requireInteraction: true,
        },
        data: {
          slotId,
          row,
          type: 'slot_available',
          timestamp: Date.now().toString(),
        },
      };

      // Send to subscribed tokens only (legacy path treated as pinCode null — 'all' subscribers get it)
      const validTokens = Object.keys(tokens).filter(token => {
        const tokenData = tokens[token];
        const tokenAge = Date.now() - (tokenData.timestamp || 0);
        if (tokenAge >= 30 * 24 * 60 * 60 * 1000) return false;
        if (tokenData.suppressed === true) return false;
        const subs = tokenData.subscribedPins;
        return !subs || subs.includes('all');
      });

      if (validTokens.length === 0) {
        console.log('No valid FCM tokens found');
        return null;
      }

      // Batch send (max 500 tokens per request)
      const batchSize = 500;
      const batches = [];
      
      for (let i = 0; i < validTokens.length; i += batchSize) {
        batches.push(validTokens.slice(i, i + batchSize));
      }

      const results = await Promise.allSettled(
        batches.map(batch =>
          messaging.sendEachForMulticast({
            tokens: batch,
            notification: {
              title: payload.notification.title,
              body:  payload.notification.body,
            },
            webpush: {
              notification: {
                title:             payload.notification.title,
                body:              payload.notification.body,
                icon:              '/logo192.png',
                badge:             '/favicon.ico',
                tag:               payload.notification.tag,
                requireInteraction: true,
              },
              fcmOptions: { link: 'https://rizzpark.vercel.app/' },
            },
            data: payload.data,
          })
        )
      );

      // Handle results and clean up invalid tokens
      let successCount = 0;
      let failureCount = 0;
      const invalidTokens = [];

      results.forEach((result, batchIndex) => {
        if (result.status === 'fulfilled') {
          const response = result.value;
          successCount += response.successCount;
          failureCount += response.failureCount;

          // Collect invalid tokens for cleanup
          response.responses.forEach((resp, tokenIndex) => {
            if (!resp.success) {
              const token = batches[batchIndex][tokenIndex];
              invalidTokens.push(token);
              console.log(`Failed to send to token ${token.slice(0, 20)}...: ${resp.error?.code} — ${resp.error?.message}`);
            }
          });
        } else {
          console.error(`Batch ${batchIndex} failed:`, result.reason);
          failureCount += batches[batchIndex].length;
        }
      });

      // Clean up invalid tokens
      if (invalidTokens.length > 0) {
        console.log(`Cleaning up ${invalidTokens.length} invalid tokens`);
        const cleanupPromises = invalidTokens.map(token =>
          db.ref(`fcm_tokens/${token}`).remove()
        );
        await Promise.allSettled(cleanupPromises);
      }

      console.log(`Push notification sent for slot ${slotId}: ${successCount} success, ${failureCount} failed`);

      // Log notification event for analytics
      await db.ref('notification_logs').push({
        slotId,
        row,
        type: 'slot_available',
        sentCount: successCount,
        failedCount: failureCount,
        timestamp: admin.database.ServerValue.TIMESTAMP,
      });

      return {
        success: true,
        slotId,
        successCount,
        failureCount,
      };

    } catch (error) {
      console.error('Error sending push notification:', error);
      throw error;
    }
  });

// ── Pin-specific Slot Change Trigger ─────────────────────────────────────────
// Mirrors onSlotStatusChange but for the locations/{pinCode}/slots/{slotId} path
// written by each Raspberry Pi unit.
exports.onPinSlotStatusChange = functions.database
  .ref('/locations/{pinCode}/slots/{slotId}')
  .onUpdate(async (change, context) => {
    const { pinCode, slotId } = context.params;
    const before = change.before.val();
    const after  = change.after.val();

    const beforeStatus = before?.status?.toLowerCase() || before?.manualStatus?.toLowerCase();
    const afterStatus  = after?.status?.toLowerCase()  || after?.manualStatus?.toLowerCase();

    if (beforeStatus !== 'occupied' || afterStatus !== 'vacant') {
      return null;
    }

    console.log(`[${pinCode}] Slot ${slotId} occupied→vacant — sending push notifications`);

    try {
      const tokensSnapshot = await db.ref('fcm_tokens').once('value');
      const tokens = tokensSnapshot.val() || {};

      const validTokens = Object.keys(tokens).filter(token => {
        const tokenData = tokens[token];
        const tokenAge = Date.now() - (tokenData.timestamp || 0);
        if (tokenAge >= 30 * 24 * 60 * 60 * 1000) return false;
        if (tokenData.suppressed === true) return false;
        const subs = tokenData.subscribedPins;
        if (!subs || subs.includes('all')) return true;
        return subs.includes(pinCode);
      });

      if (validTokens.length === 0) {
        console.log('No valid FCM tokens found');
        return null;
      }

      const row = after.row || slotId.charAt(0) || 'Unknown';

      const batchSize = 500;
      const batches = [];
      for (let i = 0; i < validTokens.length; i += batchSize) {
        batches.push(validTokens.slice(i, i + batchSize));
      }

      const title = `Rizz Park — Slot Available!`;
      const body  = `[${pinCode}] Slot ${slotId} (Row ${row}) just opened up.`;
      const tag   = `slot-${pinCode}-${slotId}`;

      const results = await Promise.allSettled(
        batches.map(batch =>
          messaging.sendEachForMulticast({
            tokens: batch,
            notification: { title, body },
            webpush: {
              notification: {
                title,
                body,
                icon:              '/logo192.png',
                badge:             '/favicon.ico',
                tag,
                requireInteraction: true,
              },
              fcmOptions: { link: `https://rizzpark.vercel.app/${pinCode}` },
            },
            data: { slotId, row, pinCode, type: 'slot_available', timestamp: Date.now().toString() },
          })
        )
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
              console.log(`[${pinCode}] Failed token ${token.slice(0, 20)}...: ${resp.error?.code} — ${resp.error?.message}`);
            }
          });
        } else {
          failureCount += batches[batchIndex].length;
          console.log(`[${pinCode}] Batch ${batchIndex} rejected: ${result.reason?.code} — ${result.reason?.message}`);
        }
      });

      if (invalidTokens.length > 0) {
        await Promise.allSettled(invalidTokens.map(t => db.ref(`fcm_tokens/${t}`).remove()));
      }

      console.log(`[${pinCode}] Slot ${slotId}: ${successCount} sent, ${failureCount} failed`);
      return null;
    } catch (error) {
      console.error('Error sending pin slot notification:', error);
      throw error;
    }
  });

// ── Parking Full Trigger (pin-specific) ──────────────────────────────────────
// Fires when any slot in a Pi location becomes occupied.
// If ALL slots are now occupied, sends a "parking full" push notification.
exports.onPinParkingFull = functions.database
  .ref('/locations/{pinCode}/slots/{slotId}')
  .onUpdate(async (change, context) => {
    const { pinCode } = context.params;
    const after = change.after.val();

    const afterStatus = after?.status?.toLowerCase() || after?.manualStatus?.toLowerCase();
    if (afterStatus !== 'occupied') return null;

    // Read all slots for this pin to check if fully occupied
    const allSlotsSnap = await db.ref(`/locations/${pinCode}/slots`).once('value');
    const allSlots = allSlotsSnap.val() || {};
    const slotValues = Object.values(allSlots);
    if (slotValues.length === 0) return null;

    const allOccupied = slotValues.every(s => {
      const st = s?.status?.toLowerCase() || s?.manualStatus?.toLowerCase();
      return st === 'occupied';
    });
    if (!allOccupied) return null;

    console.log(`[${pinCode}] All slots occupied — sending parking full notification`);

    try {
      const tokensSnapshot = await db.ref('fcm_tokens').once('value');
      const tokens = tokensSnapshot.val() || {};

      const validTokens = Object.keys(tokens).filter(token => {
        const tokenData = tokens[token];
        const tokenAge = Date.now() - (tokenData.timestamp || 0);
        if (tokenAge >= 30 * 24 * 60 * 60 * 1000) return false;
        if (tokenData.suppressed === true) return false;
        const subs = tokenData.subscribedPins;
        if (!subs || subs.includes('all')) return true;
        return subs.includes(pinCode);
      });

      if (validTokens.length === 0) return null;

      const title = 'Rizz Park — Parking Full!';
      const body  = `[${pinCode}] All parking slots are now occupied.`;
      const tag   = `full-${pinCode}`;

      const batchSize = 500;
      const batches = [];
      for (let i = 0; i < validTokens.length; i += batchSize) {
        batches.push(validTokens.slice(i, i + batchSize));
      }

      await Promise.allSettled(
        batches.map(batch =>
          messaging.sendEachForMulticast({
            tokens: batch,
            notification: { title, body },
            webpush: {
              notification: {
                title,
                body,
                icon:  '/logo192.png',
                badge: '/favicon.ico',
                tag,
                requireInteraction: false,
              },
              fcmOptions: { link: `https://rizzpark.vercel.app/${pinCode}` },
            },
            data: { pinCode, type: 'parking_full', timestamp: Date.now().toString() },
          })
        )
      );

      console.log(`[${pinCode}] Parking full notification sent to ${validTokens.length} tokens`);
      return null;
    } catch (error) {
      console.error(`[${pinCode}] Error sending parking full notification:`, error);
      throw error;
    }
  });

// ── Parking Full Trigger (legacy /parking/slots path) ─────────────────────────
exports.onParkingFull = functions.database
  .ref('/parking/slots/{slotId}')
  .onUpdate(async (change, context) => {
    const after = change.after.val();

    const afterStatus = after?.status?.toLowerCase() || after?.manualStatus?.toLowerCase();
    if (afterStatus !== 'occupied') return null;

    // Read all slots to check if fully occupied
    const allSlotsSnap = await db.ref('/parking/slots').once('value');
    const allSlots = allSlotsSnap.val() || {};
    const slotValues = Object.values(allSlots);
    if (slotValues.length === 0) return null;

    const allOccupied = slotValues.every(s => {
      const st = s?.status?.toLowerCase() || s?.manualStatus?.toLowerCase();
      return st === 'occupied';
    });
    if (!allOccupied) return null;

    console.log('All slots occupied on main lot — sending parking full notification');

    try {
      const tokensSnapshot = await db.ref('fcm_tokens').once('value');
      const tokens = tokensSnapshot.val() || {};

      const validTokens = Object.keys(tokens).filter(token => {
        const tokenData = tokens[token];
        const tokenAge = Date.now() - (tokenData.timestamp || 0);
        if (tokenAge >= 30 * 24 * 60 * 60 * 1000) return false;
        if (tokenData.suppressed === true) return false;
        const subs = tokenData.subscribedPins;
        return !subs || subs.includes('all');
      });

      if (validTokens.length === 0) return null;

      const title = 'Rizz Park — Parking Full!';
      const body  = 'Ground Floor is completely full — no slots available.';
      const tag   = 'full-ground-floor';

      const batchSize = 500;
      const batches = [];
      for (let i = 0; i < validTokens.length; i += batchSize) {
        batches.push(validTokens.slice(i, i + batchSize));
      }

      await Promise.allSettled(
        batches.map(batch =>
          messaging.sendEachForMulticast({
            tokens: batch,
            notification: { title, body },
            webpush: {
              notification: {
                title,
                body,
                icon:  '/logo192.png',
                badge: '/favicon.ico',
                tag,
                requireInteraction: false,
              },
              fcmOptions: { link: 'https://rizzpark.vercel.app/' },
            },
            data: { type: 'parking_full', timestamp: Date.now().toString() },
          })
        )
      );

      console.log(`Parking full notification sent to ${validTokens.length} tokens`);
      return null;
    } catch (error) {
      console.error('Error sending parking full notification:', error);
      throw error;
    }
  });

// ── Cleanup Old Tokens Function ─────────────────────────────────────────────
// Runs daily to clean up expired FCM tokens
exports.cleanupExpiredTokens = functions.pubsub
  .schedule('0 2 * * *') // Run at 2 AM daily
  .timeZone('UTC')
  .onRun(async (context) => {
    console.log('Starting expired token cleanup');

    try {
      const tokensSnapshot = await db.ref('fcm_tokens').once('value');
      const tokens = tokensSnapshot.val() || {};

      const now = Date.now();
      const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
      const expiredTokens = [];

      Object.entries(tokens).forEach(([token, data]) => {
        const tokenAge = now - (data.timestamp || 0);
        if (tokenAge > maxAge) {
          expiredTokens.push(token);
        }
      });

      if (expiredTokens.length > 0) {
        console.log(`Found ${expiredTokens.length} expired tokens to clean up`);
        const cleanupPromises = expiredTokens.map(token =>
          db.ref(`fcm_tokens/${token}`).remove()
        );
        await Promise.allSettled(cleanupPromises);
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

// ── Test Notification Function ───────────────────────────────────────────────
// For testing push notifications (can be called manually)
exports.sendTestNotification = functions.https.onCall(async (data, context) => {
  // Basic authentication check (you may want to implement proper auth)
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'Authentication required to send test notifications'
    );
  }

  const { slotId = 'A1', row = 'A' } = data;

  try {
    const tokensSnapshot = await db.ref('fcm_tokens').once('value');
    const tokens = tokensSnapshot.val() || {};
    const validTokens = Object.keys(tokens);

    if (validTokens.length === 0) {
      return { success: false, error: 'No FCM tokens found' };
    }

    const payload = {
      notification: {
        title: 'Rizz Park — Test Notification',
        body: `Test: Slot ${slotId} (Row ${row}) is now available!`,
        icon: '/logo192.png',
        badge: '/favicon.ico',
        tag: `test-${Date.now()}`,
      },
      data: {
        slotId,
        row,
        type: 'test_notification',
        timestamp: Date.now().toString(),
      },
    };

    const response = await messaging.sendEachForMulticast({
      tokens: validTokens,
      notification: {
        title: payload.notification.title,
        body:  payload.notification.body,
      },
      webpush: {
        notification: {
          title:             payload.notification.title,
          body:              payload.notification.body,
          icon:              '/logo192.png',
          badge:             '/favicon.ico',
          tag:               payload.notification.tag,
          requireInteraction: false,
        },
        fcmOptions: { link: '/' },
      },
      data: payload.data,
    });

    return {
      success: true,
      successCount: response.successCount,
      failureCount: response.failureCount,
    };
  } catch (error) {
    console.error('Error sending test notification:', error);
    throw new functions.https.HttpsError(
      'internal',
      'Failed to send test notification'
    );
  }
});
