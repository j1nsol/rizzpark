import { useState } from 'react';
import NotificationSettings from './NotificationSettings';

export default function Topbar({ notifPerm, onNotifClick }) {
  const [showSettings, setShowSettings] = useState(false);

  const notifLabel =
    notifPerm === 'granted' ? 'Alerts on' :
    notifPerm === 'denied'  ? 'Blocked'   : 'Enable alerts';

  const notifClass =
    notifPerm === 'granted' ? 'on' :
    notifPerm === 'denied'  ? 'denied' : '';

  return (
    <header className="topbar">
      <div className="brand">
        <img src="/topbar-logo.png" alt="Rizz Park" className="brand-favicon" />
        <div className="brand-content">
          <div className="brand-name">Rizz<em>.</em>Park</div>
          <div className="brand-tag">Smart Parking</div>
        </div>
      </div>

      <div className="topbar-right">
        <div className="live-pill">
          <span className="live-dot" />
          LIVE
        </div>

        <button
          className={`notif-btn ${notifClass}`}
          onClick={onNotifClick}
          title={
            notifPerm === 'granted'
              ? 'Notifications active'
              : 'Enable push notifications'
          }
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M7 1a4.5 4.5 0 0 1 4.5 4.5c0 2.5.8 3.5 1.5 4.5H1c.7-1 1.5-2 1.5-4.5A4.5 4.5 0 0 1 7 1Z"
              stroke="currentColor" strokeWidth="1.3"
            />
            <path d="M5.5 10a1.5 1.5 0 0 0 3 0" stroke="currentColor" strokeWidth="1.3" />
          </svg>
          {notifLabel}
        </button>

        <button
          className="settings-btn"
          onClick={() => setShowSettings(true)}
          title="Notification settings"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M7 1a1 1 0 0 1 1 1v1.5a1 1 0 0 1-2 0V2a1 1 0 0 1 1-1zm0 11a1 1 0 0 1 1 1v-1.5a1 1 0 0 1-2 0V13a1 1 0 0 1 1-1zm5.5-5a1 1 0 0 1 0 2h-1.5a1 1 0 0 1 0-2h1.5zm-9.5 0a1 1 0 0 1 0 2H1a1 1 0 0 1 0-2h2zm7.07-3.43a1 1 0 0 1 0 1.41l-1.06 1.06a1 1 0 0 1-1.42-1.41l1.07-1.06a1 1 0 0 1 1.41 0zm-6.36 6.36a1 1 0 0 1 0 1.41l-1.07 1.07a1 1 0 0 1-1.41-1.42l1.06-1.06a1 1 0 0 1 1.42 0zm6.36 0a1 1 0 0 1 1.41 0l1.07 1.06a1 1 0 0 1-1.42 1.42l-1.06-1.07a1 1 0 0 1 0-1.41zm-6.36-6.36a1 1 0 0 1 1.42 0l1.06 1.07a1 1 0 0 1-1.41 1.41l-1.07-1.06a1 1 0 0 1 0-1.42z"
              stroke="currentColor" strokeWidth="1.3"
            />
          </svg>
        </button>
      </div>

      {showSettings && (
        <NotificationSettings onClose={() => setShowSettings(false)} />
      )}
    </header>
  );
}
