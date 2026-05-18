import { useState, useEffect, useRef } from 'react';
import { normalizeAdminSlotsObject } from '../utils/slotModel';
import { getFirebasePath } from '../config/modeConfig';

const FIREBASE_URL = 'https://automapping-parking-slot-default-rtdb.asia-southeast1.firebasedatabase.app';
const BASE_DELAY   = 3000;
const MAX_DELAY    = 30000;

// Shared Firebase polling hook consumed by both AdminApp and the Driver Interface.
// Returns NormalizedSlot[] (see slotModel.js) with real-time status from Firebase.
//
//   slots           : NormalizedSlot[]  — current parking state (override applied)
//   fbStatus        : 'checking' | 'online' | 'error'
//   lastUpdated     : number | null     — Unix ms of last successful poll
//   showSelectedBox : boolean           — admin-controlled visibility of the Selected Box card
//
// firebasePath — which Firebase node to poll (e.g. "parking" or "parking_desktop").
//               Defaults to whatever is stored in localStorage via modeConfig.
export function useFirebaseSlots(firebasePath) {
  const path = firebasePath || getFirebasePath();
  const [slots,              setSlots]              = useState([]);
  const [fbStatus,           setFbStatus]           = useState('checking');
  const [lastUpdated,        setLastUpdated]        = useState(null);
  const [showSelectedBox,    setShowSelectedBox]    = useState(true);
  const [movingCars,         setMovingCars]         = useState({});
  const layoutRef = useRef({});

  // Fetch slot_layout (coords, row assignments) every 10 s — non-critical,
  // occupancy data still works without it.
  useEffect(() => {
    const loadLayout = async () => {
      try {
        const r = await fetch(`${FIREBASE_URL}/${path}_layout.json`);
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
  }, [path]);

  // Poll /settings.json every 5 s to pick up admin-controlled UI flags.
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const r = await fetch(`${FIREBASE_URL}/settings.json`);
        if (!r.ok) return;
        const settings = await r.json();
        if (settings && typeof settings.showSelectedBox === 'boolean') {
          setShowSelectedBox(settings.showSelectedBox);
        }
      } catch {
        // intentionally silent
      }
    };

    loadSettings();
    const iv = setInterval(loadSettings, 5_000);
    return () => clearInterval(iv);
  }, []);

  // Poll /{path}/moving_cars.json every 3 s for drive-lane car positions.
  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch(`${FIREBASE_URL}/${path}/moving_cars.json`);
        if (!r.ok) return;
        const data = await r.json();
        setMovingCars(data && typeof data === 'object' ? data : {});
      } catch {
        // intentionally silent — moving cars are supplementary
      }
    };
    load();
    const iv = setInterval(load, 3_000);
    return () => clearInterval(iv);
  }, [path]);

  // Poll /parking.json for occupancy with exponential back-off on failure.
  // Applies manual override: if isOverridden is true, manualStatus takes precedence
  // over the detection result so admin-enforced status survives sensor updates.
  useEffect(() => {
    let delay      = BASE_DELAY;
    let failStreak = 0;
    let timerId    = null;

    const poll = async () => {
      try {
        const r = await fetch(`${FIREBASE_URL}/${path}.json`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const d = await r.json();

        if (d?.slots) {
          const merged = {};
          Object.entries(d.slots).forEach(([id, val]) => {
            const layout = layoutRef.current[id] ?? {};
            merged[id] = {
              status:       typeof val === 'string' ? val : (val?.status ?? 'Vacant'),
              manualStatus: val?.manualStatus ?? null,
              isOverridden: val?.isOverridden === true,
              coords:       val?.coords     ?? layout.coords     ?? null,
              row:          val?.row        ?? layout.row        ?? null,
              col:          val?.col        ?? layout.col        ?? null,
              confidence:   val?.confidence ?? layout.confidence ?? 0.8,
            };
          });

          setSlots(prev => {
            const prevById = Object.fromEntries(prev.map(s => [s.id, s]));
            return normalizeAdminSlotsObject(merged).map(s => {
              const raw = merged[s.id];
              // Manual override wins over detection result when isOverridden is set.
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
  }, [path]);

  // Clear justChanged flags after the pulse animation completes (500 ms).
  useEffect(() => {
    if (!slots.some(s => s.justChanged)) return;
    const id = setTimeout(
      () => setSlots(p => p.map(s => ({ ...s, justChanged: false }))),
      500
    );
    return () => clearTimeout(id);
  }, [slots]);

  return { slots, fbStatus, lastUpdated, showSelectedBox, movingCars };
}
