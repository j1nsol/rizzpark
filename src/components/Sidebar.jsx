import { timeAgo } from '../utils/parking';
import { clearSlotOverride } from '../utils/firebase';

const FILTER_OPTIONS = [
  { key: 'all',      label: 'All Slots',  cls: 'all' },
  { key: 'vacant',   label: 'Vacant',     cls: 'vacant' },
  { key: 'reserved', label: 'Reserved',   cls: 'reserved' },
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
 *   showSelectedBox: boolean,
 * }} props
 */
export default function Sidebar({
  slots,
  filter,
  selectedSlot,
  onFilterChange,
  onToggleStatus,
  onDeselect,
  onClearOverride,
  showSelectedBox = true,
}) {
  const total    = slots.length;
  const vacant   = slots.filter((s) => s.status === 'vacant').length;
  const occupied = slots.filter((s) => s.status === 'occupied').length;
  const reserved = slots.filter((s) => s.status === 'reserved').length;
  const occPct   = Math.round((occupied / total) * 100);

  async function handleClearOverride() {
    if (!selectedSlot) return;
    try {
      if (onClearOverride) {
        await onClearOverride(selectedSlot.id);
      } else {
        await clearSlotOverride(selectedSlot.id);
      }
    } catch (e) {
      console.error('Failed to clear override:', e);
    }
  }

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

      {/* Filter legend */}
      <div>
        <div className="sidebar-section-title">Filter</div>
        <div className="legend">
          {FILTER_OPTIONS.map(({ key, label, cls }) => {
            const count = key === 'all' ? total : key === 'vacant' ? vacant : key === 'reserved' ? reserved : occupied;
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

      {/* Selected slot detail — hidden when admin disables it */}
      {showSelectedBox && (
        <div>
          <div className="sidebar-section-title">Selected Slot</div>
          {!selectedSlot ? (
            <div className="slot-detail empty">Click a slot on the map to see details</div>
          ) : (
            <div className="slot-detail">
              <div className="sd-id">
                {selectedSlot.id}
                {selectedSlot.isOverridden && (
                  <span className="sd-override-badge">Manual</span>
                )}
              </div>
              <div className="sd-row"><span>Row</span><b>{selectedSlot.row}</b></div>
              <div className="sd-row"><span>Column</span><b>{selectedSlot.col}</b></div>
              <div className="sd-row">
                <span>Status</span>
                <b style={{ color: selectedSlot.status === 'vacant' ? 'var(--vacant)' : selectedSlot.status === 'reserved' ? 'var(--reserved)' : 'var(--occupied)' }}>
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
                {selectedSlot.isOverridden && (
                  <button className="sd-btn sd-btn-reset" onClick={handleClearOverride}>
                    ↺ Reset to Auto
                  </button>
                )}
                <button className="sd-btn" onClick={onDeselect}>Deselect</button>
              </div>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
