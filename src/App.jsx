import { useState, useEffect, useRef } from 'react';
import './styles/global.css';
import Topbar            from './components/Topbar';
import Sidebar           from './components/Sidebar';
import ParkingCardGrid   from './components/ParkingCardGrid';
import ToastStack        from './components/ToastStack';
import OnboardingOverlay from './components/OnboardingOverlay';
import {
  TweaksPanel, TweakSection, TweakToggle, TweakColor,
} from './components/TweaksPanel';
import { useTweaks }         from './hooks/useTweaks';
import { useFirebaseSlots }  from './hooks/useFirebaseSlots';
import { useFCM }            from './hooks/useFCM';
import { useConsoleLog }     from './hooks/useConsoleLog';
import ConsolePanel          from './components/ConsolePanel';
import {
  canNotify, isGranted, requestPerm, fireNotif, ONBOARDING_KEY,
} from './utils/parking';
import { setSlotOverride } from './utils/firebase';
import { getFirebasePath } from './config/modeConfig';

const TWEAK_DEFAULTS = {
  showCarIcon: true,
  accentColor: '#F5A623',
};

export default function App() {
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const { slots, fbStatus, showSelectedBox } = useFirebaseSlots(getFirebasePath());
  const fcm = useFCM();
  const { logs, clear } = useConsoleLog();

  const [selectedId,     setSelectedId]     = useState(null);
  const [filter,         setFilter]         = useState('all');
  const [notifPerm,      setNotifPerm]      = useState(
    canNotify() ? Notification.permission : 'unavailable'
  );
  const [toasts,         setToasts]         = useState([]);
  const [showOnboarding, setShowOnboarding] = useState(
    () => localStorage.getItem(ONBOARDING_KEY) !== '1'
  );

  const toastId      = useRef(0);
  const prevSlotsRef = useRef([]);

  // Update notification permission state based on FCM
  useEffect(() => {
    if (fcm.permission) {
      setNotifPerm(fcm.permission);
    }
  }, [fcm.permission]);

  // Handle FCM messages when app is in foreground
  useEffect(() => {
    if (!fcm.token) return;

    const unsubscribe = fcm.onMessage((payload) => {
      console.log('Received FCM message in foreground:', payload);
      
      // Extract slot data from message
      const slotData = payload.data || {};
      const slotId = slotData.slotId;
      const row = slotData.row;

      // Show toast notification for foreground messages
      if (slotId && row) {
        spawnToast(slotId, row);
      }
    });

    return unsubscribe;
  }, [fcm.token, fcm.onMessage]);

  // Detect occupied→vacant transitions and fire notifications + toasts
  useEffect(() => {
    if (!prevSlotsRef.current.length) {
      prevSlotsRef.current = slots;
      return;
    }
    const prevById = Object.fromEntries(prevSlotsRef.current.map(s => [s.id, s]));
    const changedSlots = slots.filter(s => 
      prevById[s.id]?.status === 'occupied' && s.status === 'vacant'
    );
    
    changedSlots.forEach(s => { 
      // Show browser notification as fallback
      fireNotif(s); 
      // Show in-app toast
      spawnToast(s.id, s.row); 
      
      // FCM push notifications are handled by Cloud Functions
      // when slot status changes in Firebase Realtime Database
    });
    
    prevSlotsRef.current = slots;
  }, [slots]); // eslint-disable-line react-hooks/exhaustive-deps

  // Derived state
  const selectedSlot = selectedId ? (slots.find(s => s.id === selectedId) ?? null) : null;
  const accentStyle  = {
    '--accent':      tweaks.accentColor,
    '--accent-pale': tweaks.accentColor + '1A',
  };

  // Status subtitle shown in the grid header
  const statusLine =
    fbStatus === 'online'   ? 'Live data · updates every ~3 s'  :
    fbStatus === 'checking' ? 'Connecting to live feed…'         :
                              'Disconnected — showing last known data';

  // ── Handlers ────────────────────────────────────────────────────────────────

  function spawnToast(slotId, row) {
    const id = ++toastId.current;
    setToasts(prev => [...prev, { id, slotId, row, ts: Date.now(), out: false }]);
    setTimeout(() => dismissToast(id), 5000);
  }

  function dismissToast(id) {
    setToasts(p => p.map(t => (t.id === id ? { ...t, out: true } : t)));
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 300);
  }

  async function handleToggleStatus(slot) {
    const newStatus = slot.status === 'occupied' ? 'Vacant' : 'Occupied';
    try {
      await setSlotOverride(slot.id, newStatus);
    } catch (e) {
      console.error('Failed to override slot status:', e);
    }
  }

  async function handleNotif() {
    if (notifPerm === 'granted') return;

    try {
      if (fcm.isSupported) {
        await fcm.requestPermission();
        localStorage.setItem('rizzpark_notif', 'granted');
      } else {
        const ok = await requestPerm();
        const perm = ok ? 'granted' : 'denied';
        setNotifPerm(perm);
        localStorage.setItem('rizzpark_notif', perm);
      }
    } catch (error) {
      console.error('Failed to request notification permission:', error);
    }
  }

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
          onToggleStatus={handleToggleStatus}
          onDeselect={() => setSelectedId(null)}
          showSelectedBox={showSelectedBox}
        />

        <div className="grid-area">
          <div className="grid-topbar">
            <div>
              <div className="grid-title">Ground Floor — Parking Map</div>
              <div className="grid-subtitle">{statusLine}</div>
            </div>
          </div>

          <ParkingCardGrid
            slots={slots}
            selected={selectedId}
            onSelect={setSelectedId}
            filter={filter}
            theme="driver"
            showCarIcon={tweaks.showCarIcon}
          />
        </div>
      </div>

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
      <ConsolePanel logs={logs} onClear={clear} />

      <TweaksPanel>
        <TweakSection label="Display" />
        <TweakToggle
          label="Show car icons"
          value={tweaks.showCarIcon}
          onChange={v => setTweak('showCarIcon', v)}
        />
        <TweakColor
          label="Accent color"
          value={tweaks.accentColor}
          onChange={v => setTweak('accentColor', v)}
        />
      </TweaksPanel>
    </div>
  );
}
