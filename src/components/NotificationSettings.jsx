import { useState, useEffect } from 'react';
import { getNotificationSettings, canNotify, requestPerm, isQuietHours } from '../utils/parking';
import { saveTokenSubscribedPins, saveNotificationPrefs } from '../utils/firebase';

/**
 * @param {{ onClose: () => void, pins?: Array<{pinCode: string, name: string}>, fcm: object, suppressed?: boolean, onSuppressToggle?: () => void, onPermChange?: (perm: string) => void }} props
 */
export default function NotificationSettings({ onClose, pins = [], fcm = {}, suppressed = false, onSuppressToggle, onPermChange }) {
  const [settings, setSettings] = useState(getNotificationSettings);
  const [allLocations, setAllLocations] = useState(
    () => {
      const s = getNotificationSettings();
      return !s.subscribedPins || s.subscribedPins.includes('all');
    }
  );
  const [notifErr, setNotifErr] = useState(null);

  useEffect(() => {
    const s = getNotificationSettings();
    setSettings(s);
    setAllLocations(!s.subscribedPins || s.subscribedPins.includes('all'));
  }, []);

  // The master "on" state: permission granted AND not suppressed
  const notifEnabled = fcm.permission === 'granted' && !suppressed;

  const saveSettings = (newSettings) => {
    setSettings(newSettings);
    localStorage.setItem('rizzpark_notification_settings', JSON.stringify(newSettings));
  };

  const handleSettingChange = async (key, value) => {
    saveSettings({ ...settings, [key]: value });
    if (['slotAvailable', 'parkingFull'].includes(key) && fcm.token) {
      await saveNotificationPrefs(fcm.token, { [key]: value });
    }
  };

  async function handlePinSubscription(newSubs) {
    const newSettings = { ...settings, subscribedPins: newSubs };
    saveSettings(newSettings);
    if (fcm.token) await saveTokenSubscribedPins(fcm.token, newSubs);
  }

  function toggleAllLocations(checked) {
    setAllLocations(checked);
    if (checked) {
      handlePinSubscription(['all']);
    } else {
      handlePinSubscription(pins.map(p => p.pinCode));
    }
  }

  function togglePin(pinCode) {
    const current = settings.subscribedPins || ['all'];
    const currentPins = current.includes('all') ? pins.map(p => p.pinCode) : current;
    const next = currentPins.includes(pinCode)
      ? currentPins.filter(p => p !== pinCode)
      : [...currentPins, pinCode];
    handlePinSubscription(next.length > 0 ? next : pins.map(p => p.pinCode));
  }

  const handleEnableNotifications = async () => {
    setNotifErr(null);
    try {
      if (fcm.isSupported) {
        await fcm.requestPermission();
      } else {
        const ok = await requestPerm();
        if (!ok) throw new Error(
          canNotify() && Notification.permission === 'denied'
            ? 'Notifications are blocked. Enable them in your browser settings.'
            : 'Permission not granted.'
        );
      }
      saveSettings({ ...settings, enabled: true });
      onPermChange?.('granted');
      if (suppressed) onSuppressToggle?.();
    } catch (err) {
      setNotifErr(err.message || 'Could not enable notifications.');
    }
  };

  const handleTurnOff = () => {
    saveSettings({ ...settings, enabled: false });
    if (!suppressed) onSuppressToggle?.();
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
                {fcm.token ? 'Active' : fcm.permission === 'granted' ? 'Registered' : 'Not configured'}
              </span>
            </label>
            <div className="toggle-switch">
              {notifEnabled ? (
                <button className="toggle-btn active" onClick={handleTurnOff}>
                  ON
                </button>
              ) : (
                <button className="toggle-btn" onClick={handleEnableNotifications}>
                  OFF
                </button>
              )}
            </div>
          </div>
          {notifErr && <div className="notif-err">{notifErr}</div>}

          {fcm.isSupported && (
            <>
              {/* Notification types */}
              <div className="setting-section">
                <h4>Notification Types</h4>

                <div className="setting-item">
                  <label className="setting-label">
                    <span>Slot Available</span>
                    <span className="setting-description">When a parking slot becomes available</span>
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

                <div className="setting-item">
                  <label className="setting-label">
                    <span>Parking Full</span>
                    <span className="setting-description">When all slots are occupied</span>
                  </label>
                  <div className="toggle-switch">
                    <button
                      className={`toggle-btn ${settings.parkingFull ? 'active' : ''}`}
                      onClick={() => handleSettingChange('parkingFull', !settings.parkingFull)}
                    >
                      {settings.parkingFull ? 'ON' : 'OFF'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Watched locations */}
              {pins.length > 0 && (
                <div className="setting-section">
                  <h4>Watched Locations</h4>

                  <label className="pin-check-item all-item">
                    <input
                      type="checkbox"
                      checked={allLocations}
                      onChange={e => toggleAllLocations(e.target.checked)}
                    />
                    <span>All locations</span>
                  </label>

                  {!allLocations && (
                    <div className="pin-check-list">
                      {pins.map(pin => (
                        <label key={pin.pinCode} className="pin-check-item">
                          <input
                            type="checkbox"
                            checked={(settings.subscribedPins || []).includes(pin.pinCode)}
                            onChange={() => togglePin(pin.pinCode)}
                          />
                          <span>{pin.name || pin.pinCode}</span>
                          <span className="pin-check-code">{pin.pinCode}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Quiet hours */}
              <div className="setting-section">
                <h4>Quiet Hours</h4>

                <div className="setting-item">
                  <label className="setting-label">
                    <span>Enable Quiet Hours</span>
                    <span className="setting-description">Suppress notifications during specified hours</span>
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
                    <span className="setting-description">Play sound with notifications</span>
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
                    <span className="setting-description">Vibrate on mobile devices</span>
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
                      {fcm.permission || 'default'}
                    </span>
                  </div>
                  <div className="status-item">
                    <span>Current Status:</span>
                    <span className={`status-value ${notifEnabled && !isQuietHours() ? 'good' : 'warning'}`}>
                      {notifEnabled && isQuietHours() ? 'Quiet Hours' : notifEnabled ? 'Active' : 'Inactive'}
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
          <button className="btn btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
