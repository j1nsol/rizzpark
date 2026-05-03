import { useState, useEffect, useRef } from 'react';
import './styles/global.css';
import Topbar             from './components/Topbar';
import Sidebar            from './components/Sidebar';
import ParkingMap         from './components/ParkingMap';
import ToastStack         from './components/ToastStack';
import OnboardingOverlay  from './components/OnboardingOverlay';
import {
  TweaksPanel, TweakSection, TweakToggle,
  TweakSlider, TweakColor,
} from './components/TweaksPanel';
import { useTweaks }      from './hooks/useTweaks';
import {
  loadSlots, canNotify, isGranted,
  requestPerm, fireNotif, ONBOARDING_KEY,
} from './utils/parking';

// ── Firebase ──────────────────────────────────────────────────────────────────
const FIREBASE_URL = 'https://automapping-parking-slot-default-rtdb.asia-southeast1.firebasedatabase.app';

// ── Tweak defaults ────────────────────────────────────────────────────────────
const TWEAK_DEFAULTS = {
  autoSimulate: true,
  intervalSec:  3,
  showCarIcon:  true,
  accentColor:  '#F5A623',
};

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [slots,      setSlots]      = useState(loadSlots);
  const [selected,   setSelected]   = useState(null);
  const [filter,     setFilter]     = useState('all');
  const [notifPerm,  setNotifPerm]  = useState(
    canNotify() ? Notification.permission : 'unavailable'
  );
  const [toasts,     setToasts]     = useState([]);
  const [simRunning, setSimRunning] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(
    () => localStorage.getItem(ONBOARDING_KEY) !== '1'
  );
  const toastId  = useRef(0);
  const slotsRef = useRef(slots);
  useEffect(() => { slotsRef.current = slots; }, [slots]);

  // ── Persist slots ──────────────────────────────────────────────────────────
  useEffect(() => {
    const clean = slots.map((sl) => ({ ...sl, justChanged: false }));
    localStorage.setItem('rizzpark_v2_slots', JSON.stringify(clean));
  }, [slots]);

  // ── Restore notif pref ─────────────────────────────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem('rizzpark_notif');
    if (saved === 'granted' && isGranted()) setNotifPerm('granted');
  }, []);

  // ── Reset justChanged after pulse animation ────────────────────────────────
  useEffect(() => {
    const any = slots.some((s) => s.justChanged);
    if (!any) return;
    const id = setTimeout(
      () => setSlots((p) => p.map((s) => ({ ...s, justChanged: false }))),
      500
    );
    return () => clearTimeout(id);
  }, [slots]);

  // ── Firebase polling (REST, exponential backoff) ───────────────────────────
  useEffect(() => {
    const BASE = 3000, MAX = 30_000;
    let delay = BASE, failStreak = 0, timerId = null;

    const poll = async () => {
      try {
        const r = await fetch(`${FIREBASE_URL}/parking.json`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const d = await r.json();
        if (d?.slots) {
          const freed = [];
          const next = slotsRef.current.map((s) => {
            const fb = d.slots[s.id];
            if (!fb) return s;
            const raw       = typeof fb === 'string' ? fb : (fb?.status ?? 'Vacant');
            const newStatus = raw.toLowerCase() === 'occupied' ? 'occupied' : 'vacant';
            if (newStatus === s.status) return s;
            if (s.status === 'occupied' && newStatus === 'vacant') freed.push(s);
            return { ...s, status: newStatus, updatedAt: Date.now(), justChanged: true };
          });
          setSlots(next);
          freed.forEach((s) => { fireNotif(s); spawnToast(s.id, s.row); });
        }
        failStreak = 0;
        delay = BASE;
      } catch {
        failStreak++;
        delay = Math.min(BASE * Math.pow(2, failStreak - 1), MAX);
      }
      timerId = setTimeout(poll, delay);
    };

    poll();
    return () => { if (timerId) clearTimeout(timerId); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers ───────────────────────────────────────────────────────────────
  function spawnToast(slotId, row) {
    const id = ++toastId.current;
    setToasts((prev) => [...prev, { id, slotId, row, ts: Date.now(), out: false }]);
    setTimeout(() => dismissToast(id), 5000);
  }

  function dismissToast(id) {
    setToasts((p) => p.map((t) => (t.id === id ? { ...t, out: true } : t)));
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 300);
  }

  async function handleNotif() {
    if (notifPerm === 'granted') return;
    const ok   = await requestPerm();
    const perm = ok ? 'granted' : 'denied';
    setNotifPerm(perm);
    localStorage.setItem('rizzpark_notif', perm);
  }

  function handleSlotClick(slot) {
    setSelected((prev) => (prev?.id === slot.id ? null : slot));
  }

  function toggleSlotStatus(slot) {
    const wasOccupied = slot.status === 'occupied';
    const newStatus   = wasOccupied ? 'vacant' : 'occupied';
    if (wasOccupied) {
      fireNotif(slot);
      spawnToast(slot.id, slot.row);
    }
    setSlots((prev) =>
      prev.map((s) =>
        s.id === slot.id
          ? { ...s, status: newStatus, updatedAt: Date.now(), justChanged: true }
          : s
      )
    );
    setSelected((prev) =>
      prev?.id === slot.id ? { ...prev, status: newStatus } : prev
    );
  }

  // ── Derived ────────────────────────────────────────────────────────────────
  const selectedSlot = selected ? slots.find((s) => s.id === selected.id) : null;
  const accentStyle  = {
    '--accent':      tweaks.accentColor,
    '--accent-pale': tweaks.accentColor + '1A',
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="app" style={accentStyle}>
      {showOnboarding && (
        <OnboardingOverlay onDismiss={() => setShowOnboarding(false)} />
      )}

      <Topbar notifPerm={notifPerm} onNotifClick={handleNotif} />

      <div className="main">
        <Sidebar
          slots={slots}
          filter={filter}
          selectedSlot={selectedSlot}
          onFilterChange={setFilter}
          onToggleStatus={toggleSlotStatus}
          onDeselect={() => setSelected(null)}
        />

        <ParkingMap
          slots={slots}
          filter={filter}
          selectedSlot={selectedSlot}
          showCarIcon={tweaks.showCarIcon}
          simRunning={simRunning}
          onSlotClick={handleSlotClick}
          onToggleSim={() => setSimRunning((r) => !r)}
        />
      </div>

      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      <TweaksPanel>
        <TweakSection label="Simulation" />
        <TweakToggle
          label="Auto-simulate"
          value={tweaks.autoSimulate}
          onChange={(v) => setTweak('autoSimulate', v)}
        />
        <TweakSlider
          label="Interval"
          value={tweaks.intervalSec}
          min={1} max={15} step={1} unit="s"
          onChange={(v) => setTweak('intervalSec', v)}
        />
        <TweakSection label="Display" />
        <TweakToggle
          label="Show car icons"
          value={tweaks.showCarIcon}
          onChange={(v) => setTweak('showCarIcon', v)}
        />
        <TweakColor
          label="Accent color"
          value={tweaks.accentColor}
          onChange={(v) => setTweak('accentColor', v)}
        />
      </TweaksPanel>
    </div>
  );
}
