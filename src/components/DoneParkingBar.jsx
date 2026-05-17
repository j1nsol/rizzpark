export default function DoneParkingBar({ suppressed, onToggle, notifPerm }) {
  if (notifPerm !== 'granted') return null;
  return (
    <div className={`done-parking-bar ${suppressed ? 'suppressed' : ''}`}>
      <button className="done-parking-btn" onClick={onToggle}>
        {suppressed ? '🔔 Resume Alerts' : '✓ Done Parking? Stop Alerts'}
      </button>
    </div>
  );
}
