import { useState, useEffect, useCallback } from 'react';
import { requestFCMToken, onFCMMessage, deleteFCMToken } from '../utils/firebase';

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

  // Register the Firebase messaging service worker and store the registration
  useEffect(() => {
    if (!isSupported) return;

    navigator.serviceWorker
      .register('/firebase-messaging-sw.js')
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

  // Cleanup token on unmount
  useEffect(() => {
    return () => {
      if (token) {
        deleteFCMToken(token).catch(console.error);
      }
    };
  }, [token]);

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
