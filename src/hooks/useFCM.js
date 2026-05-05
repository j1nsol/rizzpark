import { useState, useEffect, useCallback } from 'react';
import { requestFCMToken, onFCMMessage, deleteFCMToken } from '../utils/firebase';

/**
 * Hook for managing Firebase Cloud Messaging (FCM) push notifications
 * Handles token registration, permission management, and message handling
 */
export function useFCM() {
  const [token, setToken] = useState(null);
  const [isSupported, setIsSupported] = useState(false);
  const [permission, setPermission] = useState('default');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Check if FCM is supported on page load
  useEffect(() => {
    const supported = 'serviceWorker' in navigator && 'PushManager' in window;
    setIsSupported(supported);
    
    if (supported) {
      setPermission(Notification.permission);
    }
  }, []);

  // Register service worker
  useEffect(() => {
    if (!isSupported) return;

    const registerSW = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js');
        console.log('Service Worker registered:', registration);
      } catch (error) {
        console.error('Service Worker registration failed:', error);
        setError('Failed to register service worker');
      }
    };

    registerSW();
  }, [isSupported]);

  // Request permission and get token
  const requestPermission = useCallback(async () => {
    if (!isSupported) {
      throw new Error('Push notifications not supported');
    }

    setIsLoading(true);
    setError(null);

    try {
      // Request notification permission
      const permission = await Notification.requestPermission();
      setPermission(permission);

      if (permission !== 'granted') {
        throw new Error('Notification permission denied');
      }

      // Get FCM token
      const fcmToken = await requestFCMToken();
      setToken(fcmToken);

      return fcmToken;
    } catch (err) {
      console.error('Error requesting FCM permission:', err);
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [isSupported]);

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
