export default function Sidebar({ slots, suppressed, onToggle, notifPerm }) {
  const total    = slots.length;
  const vacant   = slots.filter((s) => s.status === 'vacant').length;
  const occupied = slots.filter((s) => s.status === 'occupied').length;
  const reserved = slots.filter((s) => s.status === 'reserved').length;
  const occPct   = Math.round((occupied / total) * 100);

  return (
    <aside className="sidebar">
      {/* Overview stats */}
      <div>
        <div className="sidebar-section-title">Overview</div>
        <div className="stat-grid">
          <div className="stat-box available">
            <div className="s-label">Available</div>
            <div className="s-val">{vacant}</div>
            <div className="s-sub">{total} total slots</div>
            <div className="occ-bar">
              <div className="occ-fill" style={{ width: `${(vacant / total) * 100}%` }} />
            </div>
          </div>

          <div className="stat-box">
            <div className="s-label">Occupied</div>
            <div className="s-val">{occupied}</div>
            <div className="s-sub">in use</div>
          </div>

          <div
            className="stat-box"
            style={reserved > 0 ? { borderColor: 'var(--reserved-border)', background: 'var(--reserved-bg)' } : {}}
          >
            <div className="s-label" style={reserved > 0 ? { color: 'var(--reserved)' } : {}}>Reserved</div>
            <div className="s-val" style={reserved > 0 ? { color: 'var(--reserved)' } : {}}>{reserved}</div>
            <div className="s-sub" style={reserved > 0 ? { color: 'var(--reserved)' } : {}}>pre-booked</div>
          </div>

          <div className="stat-box accent">
            <div className="s-label">Occupancy</div>
            <div className="s-val">
              {occPct}<span style={{ fontSize: '15px', fontWeight: 400 }}>%</span>
            </div>
            <div className="occ-bar">
              <div className="occ-fill" style={{ width: `${occPct}%` }} />
            </div>
          </div>
        </div>
      </div>

      {notifPerm === 'granted' && onToggle && (
        <button
          className={`sidebar-done-btn${suppressed ? ' suppressed' : ''}`}
          onClick={onToggle}
        >
          {suppressed ? 'Resume Alerts' : 'Done Parking?'}
        </button>
      )}
    </aside>
  );
}
