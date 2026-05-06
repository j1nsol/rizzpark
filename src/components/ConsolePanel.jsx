import { useState, useEffect, useRef } from 'react';

const LEVEL_LABEL = { log: 'LOG', warn: 'WRN', error: 'ERR' };

function fmt(ts) {
  return ts.toTimeString().slice(0, 8);
}

export default function ConsolePanel({ logs, onClear }) {
  const [open, setOpen] = useState(false);
  const bodyRef = useRef(null);
  const errorCount = logs.filter(l => l.level === 'error').length;

  useEffect(() => {
    if (open && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [logs, open]);

  return (
    <div className="con-wrap">
      {open && (
        <div className="con-panel">
          <div className="con-header">
            <span className="con-title">Console</span>
            <div className="con-actions">
              <button className="con-clear" onClick={onClear}>Clear</button>
              <button className="con-close" onClick={() => setOpen(false)}>✕</button>
            </div>
          </div>
          <div className="con-body" ref={bodyRef}>
            {logs.length === 0 && (
              <div className="con-empty">No logs yet</div>
            )}
            {logs.map(entry => (
              <div key={entry.id} className={`con-entry ${entry.level}`}>
                <span className="con-ts">{fmt(entry.ts)}</span>
                <span className="con-level">[{LEVEL_LABEL[entry.level]}]</span>
                <span className="con-msg">{entry.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <button className="con-btn" onClick={() => setOpen(v => !v)} title="Toggle console">
        <span className="con-btn-icon">&gt;_</span>
        {!open && errorCount > 0 && (
          <span className="con-badge">{errorCount > 99 ? '99+' : errorCount}</span>
        )}
      </button>
    </div>
  );
}
