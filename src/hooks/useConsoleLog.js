import { useState, useEffect, useCallback, useRef } from 'react';

const MAX_ENTRIES = 200;
let entryId = 0;

function serialize(args) {
  return args.map(a => {
    if (a === null) return 'null';
    if (a === undefined) return 'undefined';
    if (typeof a === 'string') return a;
    if (a instanceof Error) return `${a.name}: ${a.message}`;
    try { return JSON.stringify(a, null, 0); } catch { return String(a); }
  }).join(' ');
}

export function useConsoleLog() {
  const [logs, setLogs] = useState([]);
  const originals  = useRef({});
  // FIX: Re-entrancy guard — prevents infinite loop when React itself calls
  // console.error (e.g. for duplicate key warnings), which would trigger
  // setLogs → re-render → React error → console.error → setLogs → ...
  const isLogging  = useRef(false);

  const append = useCallback((level, args) => {
    // If we're already inside an append call (re-entrant), skip silently.
    // The original console method has already been called, so nothing is lost.
    if (isLogging.current) return;
    isLogging.current = true;

    const entry = { id: ++entryId, level, message: serialize(args), ts: new Date() };
    setLogs(prev => {
      const next = [...prev, entry];
      return next.length > MAX_ENTRIES ? next.slice(next.length - MAX_ENTRIES) : next;
    });

    // Use a microtask to reset the flag AFTER React has processed the setState,
    // so any console calls triggered by the re-render are still guarded.
    Promise.resolve().then(() => { isLogging.current = false; });
  }, []);

  useEffect(() => {
    const methods = ['log', 'warn', 'error'];
    originals.current = {};
    methods.forEach(level => {
      originals.current[level] = console[level].bind(console);
      console[level] = (...args) => {
        originals.current[level](...args);
        append(level, args);
      };
    });
    return () => {
      methods.forEach(level => { console[level] = originals.current[level]; });
    };
  }, [append]);

  const clear = useCallback(() => setLogs([]), []);

  return { logs, clear };
}