import { timeAgo } from '../utils/parking';

const FILTER_OPTIONS = [
  { key: 'all',      label: 'All Slots',  cls: 'all' },
  { key: 'vacant',   label: 'Vacant',     cls: 'vacant' },
  { key: 'occupied', label: 'Occupied',   cls: 'occupied' },
];

/**
 * @param {{
 *   slots: object[],
 *   filter: string,
 *   selectedSlot: object|null,
 *   onFilterChange: (f: string) => void,
 *   onToggleStatus: (slot: object) => void,
 *   onDeselect: () => void,
 * }} props
 */
export default function Sidebar({
  slots,
  filter,
  selectedSlot,
  onFilterChange,
  onToggleStatus,
  onDeselect,
}) {
  const total    = slots.length;
  const vacant   = slots.filter((s) => s.status === 'vacant').length;
  const occupied = slots.filter((s) => s.status === 'occupied').length;
  const occPct   = Math.round((occupied / total) * 100);

  return (
    <aside className="sidebar">
      {/* Overview stats */}
      <div>
        <div className="sidebar-section-title">Overview</div>
        <div className="stat-grid">
          <div className="stat-box full">
            <div className="s-label">Available Now</div>
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

          <div className="stat-box full">
            <div className="s-label">Occupancy</div>
            <div className="s-val">
              {occPct}<span style={{ fontSize: '15px', fontWeight: 400 }}>%</span>
            </div>
            <div className="occ-bar" style={{ marginTop: '8px', background: 'rgba(0,0,0,.08)' }}>
              <div
                style={{
                  height: '100%', width: `${occPct}%`,
                  background: 'var(--occupied)', borderRadius: '2px', transition: 'width .6s ease',
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Filter legend */}
      <div>
        <div className="sidebar-section-title">Filter</div>
        <div className="legend">
          {FILTER_OPTIONS.map(({ key, label, cls }) => {
            const count = key === 'all' ? total : key === 'vacant' ? vacant : occupied;
            return (
              <div
                key={key}
                className={`legend-item${filter === key ? ' active' : ''}`}
                onClick={() => onFilterChange(key)}
              >
                <div className={`legend-dot ${cls}`} />
                {label}
                <span className="legend-count">{count}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected slot detail */}
      <div>
        <div className="sidebar-section-title">Selected Slot</div>
        {!selectedSlot ? (
          <div className="slot-detail empty">Click a slot on the map to see details</div>
        ) : (
          <div className="slot-detail">
            <div className="sd-id">{selectedSlot.id}</div>
            <div className="sd-row"><span>Row</span><b>{selectedSlot.row}</b></div>
            <div className="sd-row"><span>Column</span><b>{selectedSlot.col}</b></div>
            <div className="sd-row">
              <span>Status</span>
              <b style={{ color: selectedSlot.status === 'vacant' ? 'var(--vacant)' : 'var(--occupied)' }}>
                {selectedSlot.status.charAt(0).toUpperCase() + selectedSlot.status.slice(1)}
              </b>
            </div>
            <div className="sd-row">
              <span>Updated</span>
              <b>{timeAgo(selectedSlot.updatedAt)}</b>
            </div>
            <div className="sd-actions">
              <button
                className={`sd-btn ${selectedSlot.status === 'occupied' ? 'primary' : 'danger'}`}
                onClick={() => onToggleStatus(selectedSlot)}
              >
                {selectedSlot.status === 'occupied' ? '✓ Mark as Vacant' : '✗ Mark as Occupied'}
              </button>
              <button className="sd-btn" onClick={onDeselect}>Deselect</button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
