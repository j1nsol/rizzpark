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

      // Send to all tokens
      const validTokens = Object.keys(tokens).filter(token => {
        const tokenData = tokens[token];
        // Filter out old tokens (older than 30 days)
        const tokenAge = Date.now() - (tokenData.timestamp || 0);
        return tokenAge < 30 * 24 * 60 * 60 * 1000; // 30 days
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
          messaging.sendMulticast({
            tokens: batch,
            notification: payload.notification,
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
              console.log(`Failed to send to token ${token}:`, resp.error);
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
        const tokenAge = Date.now() - (tokens[token].timestamp || 0);
        return tokenAge < 30 * 24 * 60 * 60 * 1000;
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

      const results = await Promise.allSettled(
        batches.map(batch =>
          messaging.sendMulticast({
            tokens: batch,
            notification: {
              title: `Rizz Park — Slot Available!`,
              body:  `[${pinCode}] Slot ${slotId} (Row ${row}) just opened up.`,
              icon:  '/logo192.png',
              badge: '/favicon.ico',
              tag:   `slot-${pinCode}-${slotId}`,
              requireInteraction: true,
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
            if (!resp.success) invalidTokens.push(batches[batchIndex][tokenIndex]);
          });
        } else {
          failureCount += batches[batchIndex].length;
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

    const response = await messaging.sendMulticast({
      tokens: validTokens,
      notification: payload.notification,
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
