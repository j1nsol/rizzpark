import { Fragment } from 'react';
import ParkingSlotCard from './ParkingSlotCard';
import { groupSlots } from '../utils/slotModel';

// ── ParkingCardGrid ───────────────────────────────────────────────────────────
// Shared card grid consumed by both the Admin Panel and Driver Interface.
// Accepts a NormalizedSlot[] (from slotModel.js), groups them into rows
// dynamically via Y-axis proximity (coords present) or row field (fallback),
// then renders each slot using ParkingSlotCard.
//
// Props:
//   slots        : NormalizedSlot[]
//   selected     : string | null           — selected slot id
//   onSelect     : (id: string | null) => void
//   filter       : 'all' | 'occupied' | 'vacant'   (default: 'all')
//   theme        : 'admin' | 'driver'              (default: 'driver')
//   showCarIcon  : boolean                          (default: true)
//   gapThreshold : number | undefined — Y-pixel gap between rows (auto if omitted)

// ── Admin theme tokens ────────────────────────────────────────────────────────
const A = {
  occ:    '#f43f5e',
  vac:    '#10b981',
  border: 'rgba(255,255,255,0.07)',
  muted:  'rgba(226,232,240,0.38)',
  mono:   "'JetBrains Mono', monospace",
};

function AdminRowDivider({ label, vacantCount, totalCount }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
      <span style={{
        fontFamily: A.mono, fontSize: 10, fontWeight: 700,
        color: A.muted, textTransform: 'uppercase', letterSpacing: '0.08em',
        whiteSpace: 'nowrap',
      }}>
        Row {label}
      </span>
      <div style={{ flex: 1, height: 1, background: A.border }} />
      <span style={{ fontFamily: A.mono, fontSize: 10, color: A.muted, whiteSpace: 'nowrap' }}>
        {vacantCount}/{totalCount} free
      </span>
    </div>
  );
}

function AdminLegend() {
  return (
    <div style={{ display: 'flex', gap: 20, justifyContent: 'center', marginTop: 8 }}>
      {[[A.vac, 'Available'], [A.occ, 'Occupied']].map(([color, label]) => (
        <div key={label} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 11, fontFamily: A.mono, color: A.muted,
        }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: color, display: 'inline-block' }} />
          {label}
        </div>
      ))}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function ParkingCardGrid({
  slots,
  selected,
  onSelect,
  filter       = 'all',
  theme        = 'driver',
  showCarIcon  = true,
  gapThreshold,
}) {
  const filtered = filter === 'all' ? slots : slots.filter(s => s.status === filter);
  const rows     = groupSlots(filtered, gapThreshold);

  // ── Admin dark rendering ───────────────────────────────────────────────────
  if (theme === 'admin') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {rows.length === 0 && (
          <div style={{
            textAlign: 'center', padding: '30px 0',
            color: A.muted, fontFamily: A.mono, fontSize: 12,
          }}>
            No slots match the current filter.
          </div>
        )}

        {rows.map(({ label, slots: rowSlots }) => {
          const vacantCount = rowSlots.filter(s => s.status === 'vacant').length;
          return (
            <div key={label}>
              <AdminRowDivider
                label={label}
                vacantCount={vacantCount}
                totalCount={rowSlots.length}
              />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {rowSlots.map(slot => (
                  <ParkingSlotCard
                    key={slot.id}
                    slot={slot}
                    isSelected={selected === slot.id}
                    onClick={() => onSelect(selected === slot.id ? null : slot.id)}
                    theme="admin"
                    showCarIcon={showCarIcon}
                  />
                ))}
              </div>
            </div>
          );
        })}

        <AdminLegend />
      </div>
    );
  }

  // ── Driver light rendering — preserves drive-lane dividers ─────────────────
  return (
    <div className="map-inner">
      {rows.length === 0 && (
        <div style={{
          textAlign: 'center', padding: '30px 0',
          color: 'var(--text-2)', fontSize: 12,
        }}>
          No slots match the current filter.
        </div>
      )}

      {rows.map(({ label, slots: rowSlots }, ri) => (
        <Fragment key={label}>
          {ri > 0 && (
            <div className="map-road">
              <span className="road-label">Drive Lane {ri}</span>
            </div>
          )}
          <div className="slot-row-wrap">
            {rowSlots.map(slot => (
              <ParkingSlotCard
                key={slot.id}
                slot={slot}
                isSelected={selected === slot.id}
                onClick={() => onSelect(selected === slot.id ? null : slot.id)}
                theme="driver"
                showCarIcon={showCarIcon}
              />
            ))}
          </div>
        </Fragment>
      ))}
    </div>
  );
}
