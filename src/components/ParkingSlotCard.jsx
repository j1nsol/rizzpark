// ── ParkingSlotCard ───────────────────────────────────────────────────────────
// Shared slot card for both Admin Panel (dark theme) and Driver Interface (light theme).
//
// Props:
//   slot        : NormalizedSlot (from slotModel.js)
//   isSelected  : boolean
//   onClick     : () => void
//   theme       : 'admin' | 'driver'   (default: 'driver')
//   showCarIcon : boolean              (default: true)

const ADMIN_C = {
  occ:  '#f43f5e',
  vac:  '#10b981',
  mono: "'JetBrains Mono', monospace",
};

function CarIconSVG({ color }) {
  return (
    <svg viewBox="0 0 40 26" fill="none" xmlns="http://www.w3.org/2000/svg"
      style={{ width: 32, height: 22, display: 'block' }}>
      <rect x="1"  y="9"  width="38" height="14" rx="4"   fill={color} opacity="0.9" />
      <path d="M8 9 L13 2 H27 L32 9" stroke={color} strokeWidth="1.5" fill={color} opacity="0.7" />
      <circle cx="10" cy="22" r="3.5" fill="white" opacity="0.9" />
      <circle cx="30" cy="22" r="3.5" fill="white" opacity="0.9" />
      <rect x="13" y="4"  width="14" height="5"  rx="1.5" fill="white" opacity="0.35" />
    </svg>
  );
}

function PIconSVG({ color }) {
  return (
    <svg viewBox="0 0 40 26" fill="none" xmlns="http://www.w3.org/2000/svg"
      style={{ width: 32, height: 22, display: 'block' }}>
      <rect x="2" y="2" width="36" height="22" rx="5"
        stroke={color} strokeWidth="1.5" strokeDasharray="4 3" fill="none" opacity="0.5" />
      <text x="50%" y="17" textAnchor="middle"
        fontFamily="DM Serif Display, serif" fontSize="14"
        fill={color} opacity="0.7" fontWeight="bold">P</text>
    </svg>
  );
}

export default function ParkingSlotCard({ slot, isSelected, onClick, theme = 'driver', showCarIcon = true }) {
  const occ = slot.status === 'occupied';

  // ── Admin dark theme ───────────────────────────────────────────────────────
  if (theme === 'admin') {
    const activeColor = occ ? ADMIN_C.occ : ADMIN_C.vac;
    return (
      <div
        onClick={onClick}
        title={`Slot ${slot.id} — ${slot.status}`}
        style={{
          width: 72, minHeight: 90, borderRadius: 12,
          cursor: 'pointer', position: 'relative', flexShrink: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: 6, padding: '10px 6px 8px',
          background: isSelected
            ? (occ ? `${ADMIN_C.occ}35` : `${ADMIN_C.vac}30`)
            : (occ ? `${ADMIN_C.occ}18` : `${ADMIN_C.vac}10`),
          border: `1.5px solid ${isSelected
            ? activeColor
            : (occ ? `${ADMIN_C.occ}55` : `${ADMIN_C.vac}40`)}`,
          boxShadow: isSelected ? `0 0 14px ${activeColor}55` : 'none',
          transition: 'all .2s',
        }}
      >
        {/* Status dot */}
        <div style={{
          position: 'absolute', top: 6, right: 6,
          width: 6, height: 6, borderRadius: '50%',
          background: activeColor, boxShadow: `0 0 5px ${activeColor}`,
        }} />
        <div style={{ fontSize: 22, lineHeight: 1 }}>{occ ? '🚗' : '🅿️'}</div>
        <div style={{
          fontFamily: ADMIN_C.mono, fontSize: 10, fontWeight: 700,
          color: occ ? '#fda4af' : '#6ee7b7',
        }}>
          {slot.id}
        </div>
      </div>
    );
  }

  // ── Driver light theme — reuses global.css classes ─────────────────────────
  const classes = [
    'slot-card',
    slot.status,
    isSelected     ? 'selected'      : '',
    slot.justChanged ? 'just-changed' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={classes} onClick={onClick} title={`Slot ${slot.id} — ${slot.status}`}>
      <div className="slot-status-dot" />

      {showCarIcon && occ ? (
        <CarIconSVG color="var(--occupied)" />
      ) : showCarIcon ? (
        <PIconSVG color="var(--vacant)" />
      ) : (
        <div style={{
          width: 32, height: 22, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          fontSize: '20px', fontFamily: 'DM Serif Display, serif',
          fontWeight: 'bold', color: `var(--${slot.status})`,
        }}>
          P
        </div>
      )}

      <div className="slot-label">{slot.id}</div>
    </div>
  );
}
