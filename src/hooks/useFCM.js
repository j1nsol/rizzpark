import { useState, useEffect, useCallback } from 'react';
import { requestFCMToken, onFCMMessage } from '../utils/firebase';

export function useFCM() {
  const [token, setToken] = useState(null);
  const [isSupported, setIsSupported] = useState(false);
  const [permission, setPermission] = useState('default');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [swRegistration, setSwRegistration] = useState(null);

  useEffect(() => {
    const supported = 'serviceWorker' in navigator && 'PushManager' in window;
    setIsSupported(supported);
    if (supported) setPermission(Notification.permission);
  }, []);

  // Register the Firebase messaging service worker, then wait until it is
  // active before storing the registration. getToken() requires an active SW —
  // using an installing/waiting one causes "push service error".
  useEffect(() => {
    if (!isSupported) return;

    navigator.serviceWorker
      .register('/firebase-messaging-sw.js')
      .then(() => navigator.serviceWorker.ready)
      .then((registration) => {
        setSwRegistration(registration);
      })
      .catch((err) => {
        console.error('Service Worker registration failed:', err);
        setError('Failed to register service worker');
      });
  }, [isSupported]);

  // Request permission and get token, passing the SW registration to getToken
  const requestPermission = useCallback(async () => {
    if (!isSupported) throw new Error('Push notifications not supported');
    if (!swRegistration) throw new Error('Service worker not ready yet — try again in a moment');

    setIsLoading(true);
    setError(null);

    try {
      const permission = await Notification.requestPermission();
      setPermission(permission);

      if (permission !== 'granted') throw new Error('Notification permission denied');

      const fcmToken = await requestFCMToken(swRegistration);
      setToken(fcmToken);

      return fcmToken;
    } catch (err) {
      console.error('Error requesting FCM permission:', err);
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [isSupported, swRegistration]);

  // Handle incoming messages when app is in foreground
  const onMessage = useCallback((callback) => {
    if (!isSupported || !token) return;

    return onFCMMessage(callback);
  }, [isSupported, token]);

  return {
    // State
    token,
    isSupported,
    permission,
    isLoading,
    error,
    
    // Actions
    requestPermission,
    onMessage,
  };
}
