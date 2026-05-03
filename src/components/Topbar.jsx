export default function Topbar({ notifPerm, onNotifClick }) {
  const notifLabel =
    notifPerm === 'granted' ? 'Alerts on' :
    notifPerm === 'denied'  ? 'Blocked'   : 'Enable alerts';

  const notifClass =
    notifPerm === 'granted' ? 'on' :
    notifPerm === 'denied'  ? 'denied' : '';

  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-name">Rizz<em>.</em>Park</div>
        <div className="brand-tag">Smart Parking</div>
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
      </div>
    </header>
  );
}
