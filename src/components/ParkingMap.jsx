import { Fragment } from 'react';
import SlotCard from './SlotCard';
import { groupSlotsByRowField } from '../utils/slotModel';

/**
 * @param {{
 *   slots: object[],
 *   filter: string,
 *   selectedSlot: object|null,
 *   showCarIcon: boolean,
 *   simRunning: boolean,
 *   onSlotClick: (slot: object) => void,
 *   onToggleSim: () => void,
 * }} props
 */
export default function ParkingMap({
  slots,
  filter,
  selectedSlot,
  showCarIcon,
  simRunning,
  onSlotClick,
  onToggleSim,
}) {
  const displaySlots =
    filter === 'all' ? slots : slots.filter((s) => s.status === filter);

  const rows = groupSlotsByRowField(displaySlots);

  return (
    <div className="grid-area">
      {/* Header */}
      <div className="grid-topbar">
        <div>
          <div className="grid-title">Ground Floor — Parking Map</div>
          <div className="grid-subtitle">Click any slot to select · Click status button to toggle</div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            className={`sim-btn${simRunning ? ' active' : ''}`}
            onClick={onToggleSim}
          >
            {simRunning ? '⏸ Pause sim' : '▶ Resume sim'}
          </button>
        </div>
      </div>

      {/* Entrance indicator */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '-8px' }}>
        <div
          style={{
            padding: '5px 20px', background: 'var(--accent)', color: '#fff',
            borderRadius: '999px 999px 0 0', fontSize: '11px', fontWeight: 700,
            letterSpacing: '.08em', textTransform: 'uppercase',
          }}
        >
          ↑ Entrance / Exit
        </div>
      </div>

      {/* Map */}
      <div className="parking-map">
        <div className="map-inner" style={{ width: 'fit-content', margin: '0 auto' }}>
          {rows.map(({ label, slots: rowSlots }, ri) => (
            <Fragment key={label}>
              {ri > 0 && (
                <div className="map-road">
                  <span className="road-label">Drive Lane {ri}</span>
                </div>
              )}
              <div className="slot-row">
                <span className="slot-row-label">Row {label}</span>
                <div className="slot-row-wrap" style={{ justifyContent: 'flex-start' }}>
                  {rowSlots.map((slot) => (
                    <SlotCard
                      key={slot.id}
                      slot={slot}
                      isSelected={selectedSlot?.id === slot.id}
                      showCarIcon={showCarIcon}
                      onClick={() => onSlotClick(slot)}
                    />
                  ))}
                </div>
              </div>
            </Fragment>
          ))}
        </div>
      </div>

      {/* Mini legend */}
      <div
        style={{
          display: 'flex', gap: '16px', flexWrap: 'wrap',
          justifyContent: 'center', paddingTop: '4px',
        }}
      >
        {[
          { label: 'Vacant',   color: 'var(--vacant)' },
          { label: 'Occupied', color: 'var(--occupied)' },
        ].map(({ label, color }) => (
          <div
            key={label}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-2)' }}
          >
            <div style={{ width: 10, height: 10, borderRadius: '3px', background: color }} />
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}
