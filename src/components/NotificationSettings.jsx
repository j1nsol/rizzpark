import { useState, useEffect } from 'react';
import { useFCM } from '../hooks/useFCM';

/**
 * NotificationSettings component for managing user notification preferences
 * Allows users to control push notification behavior and preferences
 */
export default function NotificationSettings({ onClose }) {
  const fcm = useFCM();
  const [settings, setSettings] = useState({
    enabled: true,
    slotAvailable: true,
    quietHours: false,
    quietStart: '22:00',
    quietEnd: '08:00',
    soundEnabled: true,
    vibrationEnabled: true,
  });

  // Load settings from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('rizzpark_notification_settings');
    if (saved) {
      try {
        setSettings(JSON.parse(saved));
      } catch (error) {
        console.error('Failed to load notification settings:', error);
      }
    }
  }, []);

  // Save settings to localStorage
  const saveSettings = (newSettings) => {
    setSettings(newSettings);
    localStorage.setItem('rizzpark_notification_settings', JSON.stringify(newSettings));
  };

  const handleSettingChange = (key, value) => {
    saveSettings({ ...settings, [key]: value });
  };

  const handleEnableNotifications = async () => {
    try {
      await fcm.requestPermission();
      handleSettingChange('enabled', true);
    } catch (error) {
      console.error('Failed to enable notifications:', error);
    }
  };

  const handleDisableNotifications = () => {
    handleSettingChange('enabled', false);
  };

  const isQuietHours = () => {
    if (!settings.quietHours) return false;
    
    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    return currentTime >= settings.quietStart || currentTime <= settings.quietEnd;
  };

  const shouldShowNotification = () => {
    return settings.enabled && settings.slotAvailable && !isQuietHours();
  };

  return (
    <div className="notification-settings-overlay">
      <div className="notification-settings-card">
        <div className="settings-header">
          <h3>Notification Settings</h3>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="settings-content">
          {/* Main toggle */}
          <div className="setting-item main-toggle">
            <label className="setting-label">
              <span>Push Notifications</span>
              <span className="setting-description">
                {fcm.token ? 'Active' : 'Not configured'}
              </span>
            </label>
            <div className="toggle-switch">
              {settings.enabled ? (
                <button 
                  className="toggle-btn active"
                  onClick={handleDisableNotifications}
                >
                  ON
                </button>
              ) : (
                <button 
                  className="toggle-btn"
                  onClick={handleEnableNotifications}
                  disabled={!fcm.isSupported}
                >
                  OFF
                </button>
              )}
            </div>
          </div>

          {fcm.isSupported && (
            <>
              {/* Notification types */}
              <div className="setting-section">
                <h4>Notification Types</h4>
                
                <div className="setting-item">
                  <label className="setting-label">
                    <span>Slot Available</span>
                    <span className="setting-description">
                      When a parking slot becomes available
                    </span>
                  </label>
                  <div className="toggle-switch">
                    <button 
                      className={`toggle-btn ${settings.slotAvailable ? 'active' : ''}`}
                      onClick={() => handleSettingChange('slotAvailable', !settings.slotAvailable)}
                    >
                      {settings.slotAvailable ? 'ON' : 'OFF'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Quiet hours */}
              <div className="setting-section">
                <h4>Quiet Hours</h4>
                
                <div className="setting-item">
                  <label className="setting-label">
                    <span>Enable Quiet Hours</span>
                    <span className="setting-description">
                      Suppress notifications during specified hours
                    </span>
                  </label>
                  <div className="toggle-switch">
                    <button 
                      className={`toggle-btn ${settings.quietHours ? 'active' : ''}`}
                      onClick={() => handleSettingChange('quietHours', !settings.quietHours)}
                    >
                      {settings.quietHours ? 'ON' : 'OFF'}
                    </button>
                  </div>
                </div>

                {settings.quietHours && (
                  <div className="time-range">
                    <div className="time-input">
                      <label>From:</label>
                      <input 
                        type="time" 
                        value={settings.quietStart}
                        onChange={(e) => handleSettingChange('quietStart', e.target.value)}
                      />
                    </div>
                    <div className="time-input">
                      <label>To:</label>
                      <input 
                        type="time" 
                        value={settings.quietEnd}
                        onChange={(e) => handleSettingChange('quietEnd', e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Device settings */}
              <div className="setting-section">
                <h4>Device Settings</h4>
                
                <div className="setting-item">
                  <label className="setting-label">
                    <span>Sound</span>
                    <span className="setting-description">
                      Play sound with notifications
                    </span>
                  </label>
                  <div className="toggle-switch">
                    <button 
                      className={`toggle-btn ${settings.soundEnabled ? 'active' : ''}`}
                      onClick={() => handleSettingChange('soundEnabled', !settings.soundEnabled)}
                    >
                      {settings.soundEnabled ? 'ON' : 'OFF'}
                    </button>
                  </div>
                </div>

                <div className="setting-item">
                  <label className="setting-label">
                    <span>Vibration</span>
                    <span className="setting-description">
                      Vibrate on mobile devices
                    </span>
                  </label>
                  <div className="toggle-switch">
                    <button 
                      className={`toggle-btn ${settings.vibrationEnabled ? 'active' : ''}`}
                      onClick={() => handleSettingChange('vibrationEnabled', !settings.vibrationEnabled)}
                    >
                      {settings.vibrationEnabled ? 'ON' : 'OFF'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Status */}
              <div className="setting-section status-section">
                <h4>Status</h4>
                <div className="status-list">
                  <div className="status-item">
                    <span>Push Support:</span>
                    <span className={`status-value ${fcm.isSupported ? 'good' : 'bad'}`}>
                      {fcm.isSupported ? 'Available' : 'Not Supported'}
                    </span>
                  </div>
                  <div className="status-item">
                    <span>Permission:</span>
                    <span className={`status-value ${fcm.permission === 'granted' ? 'good' : 'bad'}`}>
                      {fcm.permission}
                    </span>
                  </div>
                  <div className="status-item">
                    <span>Current Status:</span>
                    <span className={`status-value ${shouldShowNotification() ? 'good' : 'warning'}`}>
                      {shouldShowNotification() ? 'Active' : 'Quiet Hours'}
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}

          {!fcm.isSupported && (
            <div className="not-supported">
              <p>
                Push notifications are not supported on this device or browser. 
                Please use a modern browser that supports Service Workers and Web Push API.
              </p>
            </div>
          )}
        </div>

        <div className="settings-footer">
          <button className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
