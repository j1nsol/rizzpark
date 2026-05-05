import { useState, useEffect, useRef } from 'react';
import { normalizeAdminSlotsObject } from '../utils/slotModel';

const FIREBASE_URL = 'https://automapping-parking-slot-default-rtdb.asia-southeast1.firebasedatabase.app';
const BASE_DELAY   = 3000;
const MAX_DELAY    = 30000;

// Shared Firebase polling hook consumed by both AdminApp and the Driver Interface.
// Returns NormalizedSlot[] (see slotModel.js) with real-time status from Firebase.
//
//   slots      : NormalizedSlot[]  — current parking state
//   fbStatus   : 'checking' | 'online' | 'error'
//   lastUpdated: number | null     — Unix ms of last successful poll
export function useFirebaseSlots() {
  const [slots,       setSlots]       = useState([]);
  const [fbStatus,    setFbStatus]    = useState('checking');
  const [lastUpdated, setLastUpdated] = useState(null);
  const layoutRef = useRef({});

  // Fetch slot_layout (coords, row assignments) every 10 s — non-critical,
  // occupancy data still works without it.
  useEffect(() => {
    const loadLayout = async () => {
      try {
        const r = await fetch(`${FIREBASE_URL}/slot_layout.json`);
        if (!r.ok) return;
        const layout = await r.json();
        if (layout && typeof layout === 'object') layoutRef.current = layout;
      } catch {
        // intentionally silent — layout is supplementary
      }
    };

    loadLayout();
    const iv = setInterval(loadLayout, 10_000);
    return () => clearInterval(iv);
  }, []);

  // Poll /parking.json for occupancy with exponential back-off on failure.
  useEffect(() => {
    let delay      = BASE_DELAY;
    let failStreak = 0;
    let timerId    = null;

    const poll = async () => {
      try {
        const r = await fetch(`${FIREBASE_URL}/parking.json`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const d = await r.json();

        if (d?.slots) {
          const merged = {};
          Object.entries(d.slots).forEach(([id, val]) => {
            const layout = layoutRef.current[id] ?? {};
            merged[id] = {
              status:     typeof val === 'string' ? val : (val?.status ?? 'Vacant'),
              coords:     val?.coords     ?? layout.coords     ?? null,
              row:        val?.row        ?? layout.row        ?? null,
              confidence: val?.confidence ?? layout.confidence ?? 0.8,
            };
          });

          setSlots(prev => {
            const prevById = Object.fromEntries(prev.map(s => [s.id, s]));
            return normalizeAdminSlotsObject(merged).map(s => {
              const prevSlot     = prevById[s.id];
              const statusChanged = prev.length > 0 && prevSlot?.status !== s.status;
              return {
                ...s,
                updatedAt:   statusChanged ? Date.now() : (prevSlot?.updatedAt ?? Date.now()),
                justChanged: statusChanged,
              };
            });
          });

          setLastUpdated(Date.now());
          setFbStatus('online');
          failStreak = 0;
          delay      = BASE_DELAY;
        }
      } catch {
        failStreak++;
        setFbStatus('error');
        delay = Math.min(BASE_DELAY * Math.pow(2, failStreak - 1), MAX_DELAY);
      }

      timerId = setTimeout(poll, delay);
    };

    poll();
    return () => { if (timerId) clearTimeout(timerId); };
  }, []);

  // Clear justChanged flags after the pulse animation completes (500 ms).
  useEffect(() => {
    if (!slots.some(s => s.justChanged)) return;
    const id = setTimeout(
      () => setSlots(p => p.map(s => ({ ...s, justChanged: false }))),
      500
    );
    return () => clearTimeout(id);
  }, [slots]);

  return { slots, fbStatus, lastUpdated };
}
