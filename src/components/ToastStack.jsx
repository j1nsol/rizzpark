import { fmtTime } from '../utils/parking';

/**
 * @param {{ toasts: object[], onDismiss: (id: number) => void }} props
 */
export default function ToastStack({ toasts, onDismiss }) {
  return (
    <div className="toast-stack">
      {toasts.map((t) => (
        <div key={t.id} className={`toast${t.out ? ' out' : ''}`}>
          <div className="toast-ico">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle cx="7" cy="7" r="6" stroke="#22A06B" strokeWidth="1.5" />
              <path d="M4.5 7l1.8 1.8 3.2-3.2" stroke="#22A06B" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <div className="toast-body">
            <div className="t-title">Slot Available!</div>
            <div className="t-msg">
              Slot <strong>{t.slotId}</strong> (Row {t.row}) is now vacant.
            </div>
            <div className="t-time">{fmtTime(t.ts)}</div>
          </div>
          <button className="toast-x" onClick={() => onDismiss(t.id)}>×</button>
        </div>
      ))}
    </div>
  );
}
