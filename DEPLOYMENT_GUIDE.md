# PWA Push Notifications Deployment Guide

This guide covers the complete setup and deployment of Firebase Cloud Messaging (FCM) push notifications for the Rizz Park PWA.

## Prerequisites

1. **Firebase Project Setup**
   - Have a Firebase project created at https://console.firebase.google.com
   - Enable Realtime Database
   - Enable Cloud Functions
   - Get your Firebase configuration details

2. **Firebase CLI**
   ```bash
   npm install -g firebase-tools
   firebase login
   ```

## Step 1: Update Firebase Configuration

### 1.1 Get Your VAPID Key
1. Go to Firebase Console → Project Settings → Cloud Messaging
2. Generate a new Web Push certificate key pair
3. Copy the public key

### 1.2 Update Client Configuration
Edit `src/utils/firebase.js` and replace the placeholder:

```javascript
// Replace this line with your actual VAPID public key
vapidKey: 'YOUR_VAPID_PUBLIC_KEY_HERE',
```

## Step 2: Deploy Firebase Cloud Functions

### 2.1 Initialize Firebase Functions
```bash
cd firebase
firebase init functions
```

When prompted:
- Choose "Use an existing project"
- Select your Firebase project
- Choose JavaScript (not TypeScript)
- Install dependencies with npm

### 2.2 Install Dependencies
```bash
cd functions
npm install
```

### 2.3 Deploy Functions
```bash
firebase deploy --only functions
```

## Step 3: Update Database Rules

Deploy the database rules from the `firebase/database.rules.json` file:

```bash
firebase deploy --only database
```

## Step 4: Test the Implementation

### 4.1 Enable HTTPS on Local Development
For testing, you need HTTPS for service workers:

```bash
# Using mkcert (recommended)
npm install -g mkcert
mkcert -install
mkcert localhost 127.0.0.1 ::1

# Then start your app with HTTPS
HTTPS=true npm start
```

### 4.2 Test Push Notifications
1. Open the app in a supported browser (Chrome, Firefox, Edge)
2. Grant notification permissions when prompted
3. Check that FCM token is registered (check browser console)
4. Test by manually changing a slot status in Firebase Console:
   - Go to Realtime Database → `/parking/slots/{slotId}`
   - Change status from "Occupied" to "Vacant"
   - Should receive push notification

### 4.3 Test Background Notifications
1. Install the PWA on mobile device
2. Grant notification permissions
3. Minimize the app or switch to another app
4. Change slot status in Firebase Console
5. Should receive notification even when app is backgrounded

## Step 5: Production Deployment

### 5.1 Build for Production
```bash
npm run build
```

### 5.2 Deploy to Hosting
```bash
firebase deploy --only hosting
```

### 5.3 Verify PWA Installation
- Test on actual mobile devices
- Verify "Add to Home Screen" prompt appears
- Test notifications when   app is minimized
- Test notifications when app is closed

## Troubleshooting

### Common Issues

**1. Service Worker Not Registering**
- Ensure you're serving over HTTPS (required for service workers)
- Check browser console for errors
- Verify `sw.js` is accessible at `/sw.js`

**2. FCM Token Not Generated**
- Check that Notification permission is granted
- Verify VAPID key is correctly configured
- Check browser console for FCM errors

**3. Notifications Not Working**
- Verify Firebase Functions are deployed: `firebase functions:list`
- Check function logs: `firebase functions:log`
- Ensure slot status changes trigger the function

**4. Background Notifications Not Working**
- Ensure PWA is properly installed on device
- Check that service worker is active
- Verify device supports background sync

### Debug Commands

```bash
# Check deployed functions
firebase functions:list

# View function logs
firebase functions:log

# Test function locally
firebase emulators:start

# Check database rules
firebase deploy --only database --dry-run
```

## Configuration Options

### Notification Settings
Users can configure:
- Enable/disable notifications
- Quiet hours (time range)
- Sound and vibration preferences
- Notification types

Access via settings button (⚙️) in the topbar.

### Firebase Function Features
- Automatic token cleanup (daily at 2 AM UTC)
- Batch processing (500 tokens per request)
- Error handling and retry logic
- Analytics logging for notification delivery

## Security Considerations

1. **Database Rules**: Only authenticated users can modify notification settings
2. **Token Security**: FCM tokens are stored securely in Firebase
3. **Rate Limiting**: Functions include built-in rate limiting
4. **Data Privacy**: Minimal user data is collected and stored

## Performance Optimization

1. **Token Cleanup**: Automatic cleanup of expired tokens
2. **Batch Processing**: Efficient bulk notification sending
3. **Caching**: Service worker caches static assets
4. **Lazy Loading**: Settings modal loads on demand

## Monitoring

Monitor your push notification system:
```bash
# View notification logs
firebase functions:log --only onSlotStatusChange

# Check database usage
firebase database:usage

# Monitor function performance
firebase functions:list
```

## Next Steps

After deployment:
1. Monitor notification delivery rates
2. Collect user feedback on notification preferences
3. Consider adding notification analytics
4. Implement subscription to specific rows/areas
5. Add notification history for users

## Support

For issues:
- Check Firebase Console for function errors
- Review browser console for client-side errors
- Verify network connectivity and HTTPS status
- Test across different browsers and devices
