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
  const originals = useRef({});

  const append = useCallback((level, args) => {
    const entry = { id: ++entryId, level, message: serialize(args), ts: new Date() };
    setLogs(prev => {
      const next = [...prev, entry];
      return next.length > MAX_ENTRIES ? next.slice(next.length - MAX_ENTRIES) : next;
    });
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
