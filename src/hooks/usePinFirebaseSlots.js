import { useState, useEffect, useRef } from 'react';
import { normalizeAdminSlotsObject } from '../utils/slotModel';

const FIREBASE_URL = 'https://automapping-parking-slot-default-rtdb.asia-southeast1.firebasedatabase.app';
const BASE_DELAY   = 3000;
const MAX_DELAY    = 30000;

export function usePinFirebaseSlots(pinCode) {
  const [slots,       setSlots]       = useState([]);
  const [fbStatus,    setFbStatus]    = useState('checking');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [pinName,     setPinName]     = useState(null);
  const layoutRef = useRef({});

  // Fetch pin_slot_layouts every 10s
  useEffect(() => {
    if (!pinCode) return;
    const load = async () => {
      try {
        const r = await fetch(`${FIREBASE_URL}/locations/${pinCode}/layout.json`);
        if (!r.ok) return;
        const layout = await r.json();
        if (layout && typeof layout === 'object') layoutRef.current = layout;
      } catch { /* silent */ }
    };
    load();
    const iv = setInterval(load, 10_000);
    return () => clearInterval(iv);
  }, [pinCode]);

  // Fetch pin name every 30s
  useEffect(() => {
    if (!pinCode) return;
    const load = async () => {
      try {
        const r = await fetch(`${FIREBASE_URL}/map_pins/${pinCode}.json`);
        if (!r.ok) return;
        const data = await r.json();
        if (data?.name) setPinName(data.name);
      } catch { /* silent */ }
    };
    load();
    const iv = setInterval(load, 30_000);
    return () => clearInterval(iv);
  }, [pinCode]);

  // Poll slot occupancy with exponential back-off
  useEffect(() => {
    if (!pinCode) return;
    let delay      = BASE_DELAY;
    let failStreak = 0;
    let timerId    = null;

    const poll = async () => {
      try {
        const r = await fetch(`${FIREBASE_URL}/locations/${pinCode}/slots.json`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const d = await r.json();

        if (d && typeof d === 'object') {
          const merged = {};
          Object.entries(d).forEach(([id, val]) => {
            const layout = layoutRef.current[id] ?? {};
            merged[id] = {
              status:       typeof val === 'string' ? val : (val?.status ?? 'Vacant'),
              manualStatus: val?.manualStatus ?? null,
              isOverridden: val?.isOverridden === true,
              coords:       val?.coords     ?? layout.coords     ?? null,
              row:          val?.row        ?? layout.row        ?? null,
              confidence:   val?.confidence ?? layout.confidence ?? 0.8,
            };
          });

          setSlots(prev => {
            const prevById = Object.fromEntries(prev.map(s => [s.id, s]));
            return normalizeAdminSlotsObject(merged).map(s => {
              const raw = merged[s.id];
              const effectiveStatus =
                raw?.isOverridden && raw?.manualStatus
                  ? raw.manualStatus.toLowerCase()
                  : s.status;
              const prevSlot      = prevById[s.id];
              const statusChanged = prev.length > 0 && prevSlot?.status !== effectiveStatus;
              return {
                ...s,
                status:       effectiveStatus,
                isOverridden: raw?.isOverridden ?? false,
                manualStatus: raw?.manualStatus ?? null,
                updatedAt:    statusChanged ? Date.now() : (prevSlot?.updatedAt ?? Date.now()),
                justChanged:  statusChanged,
              };
            });
          });

          setLastUpdated(Date.now());
          setFbStatus('online');
          failStreak = 0;
          delay      = BASE_DELAY;
        } else {
          // Path exists but has no slots yet — still mark as online
          setFbStatus('online');
          setLastUpdated(Date.now());
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
  }, [pinCode]);

  // Clear justChanged flags after animation
  useEffect(() => {
    if (!slots.some(s => s.justChanged)) return;
    const id = setTimeout(
      () => setSlots(p => p.map(s => ({ ...s, justChanged: false }))),
      500
    );
    return () => clearTimeout(id);
  }, [slots]);

  return { slots, fbStatus, lastUpdated, pinName };
}
