function CarIcon({ color }) {
  return (
    <svg className="slot-icon" viewBox="0 0 40 26" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="9" width="38" height="14" rx="4" fill={color} opacity="0.9" />
      <path d="M8 9 L13 2 H27 L32 9" stroke={color} strokeWidth="1.5" fill={color} opacity="0.7" />
      <circle cx="10" cy="22" r="3.5" fill="white" opacity="0.9" />
      <circle cx="30" cy="22" r="3.5" fill="white" opacity="0.9" />
      <rect x="13" y="4" width="14" height="5" rx="1.5" fill="white" opacity="0.35" />
    </svg>
  );
}

function PIcon({ color }) {
  return (
    <svg className="slot-icon" viewBox="0 0 40 26" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect
        x="2" y="2" width="36" height="22" rx="5"
        stroke={color} strokeWidth="1.5" strokeDasharray="4 3" fill="none" opacity="0.5"
      />
      <text
        x="50%" y="17" textAnchor="middle"
        fontFamily="DM Serif Display, serif" fontSize="14"
        fill={color} opacity="0.7" fontWeight="bold"
      >
        P
      </text>
    </svg>
  );
}

/**
 * @param {{ slot: object, isSelected: boolean, showCarIcon: boolean, onClick: () => void }} props
 */
export default function SlotCard({ slot, isSelected, showCarIcon, onClick }) {
  const classes = [
    'slot-card',
    slot.status,
    isSelected ? 'selected' : '',
    slot.justChanged ? 'just-changed' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={classes}
      onClick={onClick}
      title={`Slot ${slot.id} — ${slot.status}`}
    >
      <div className="slot-status-dot" />

      {showCarIcon && slot.status === 'occupied' ? (
        <CarIcon color="var(--occupied)" />
      ) : showCarIcon ? (
        <PIcon color="var(--vacant)" />
      ) : (
        <div
          style={{
            width: 32, height: 22,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '20px', fontFamily: 'DM Serif Display, serif',
            fontWeight: 'bold', color: `var(--${slot.status})`,
          }}
        >
          P
        </div>
      )}

      <div className="slot-label">{slot.id}</div>
    </div>
  );
}
