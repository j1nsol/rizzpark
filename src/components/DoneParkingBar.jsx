export default function DoneParkingBar({ suppressed, onToggle }) {
  return (
    <div className={`done-parking-bar ${suppressed ? 'suppressed' : ''}`}>
      <button className="done-parking-btn" onClick={onToggle}>
        {suppressed ? 'Resume Alerts' : 'Done Parking?'}
      </button>
    </div>
  );
}
