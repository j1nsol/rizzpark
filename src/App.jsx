import { useState, useEffect, useRef } from 'react';
import './styles/global.css';
import Topbar            from './components/Topbar';
import Sidebar           from './components/Sidebar';
import ParkingCardGrid   from './components/ParkingCardGrid';
import GoogleMapView     from './components/GoogleMapView';
import MapIntro          from './components/MapIntro';
import ToastStack        from './components/ToastStack';
import OnboardingOverlay from './components/OnboardingOverlay';
import DoneParkingBar    from './components/DoneParkingBar';
import {
  TweaksPanel, TweakSection, TweakToggle, TweakColor,
} from './components/TweaksPanel';
import { useTweaks }         from './hooks/useTweaks';
import { useFirebaseSlots }  from './hooks/useFirebaseSlots';
import { useFCM }            from './hooks/useFCM';
import {
  canNotify, requestPerm, fireNotif, fireFullNotif, getNotificationSettings, ONBOARDING_KEY,
} from './utils/parking';
import { setSlotOverride, saveNotificationSuppressed } from './utils/firebase';
import { getFirebasePath } from './config/modeConfig';

const TWEAK_DEFAULTS = {
  showCarIcon: true,
  accentColor: '#F5A623',
};

export default function App() {
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const { slots, fbStatus, showSelectedBox } = useFirebaseSlots(getFirebasePath());
  const fcm = useFCM();

  const [selectedId,     setSelectedId]     = useState(null);
  const [notifPerm,      setNotifPerm]      = useState(
    canNotify() ? Notification.permission : 'unavailable'
  );
  const [suppressed,     setSuppressed]     = useState(
    () => getNotificationSettings().suppressed === true
  );
  const [toasts,         setToasts]         = useState([]);
  const [showOnboarding, setShowOnboarding] = useState(
    () => localStorage.getItem(ONBOARDING_KEY) !== '1'
  );
  const [showMap,        setShowMap]        = useState(false);
  const [showMapIntro,   setShowMapIntro]   = useState(false);
  const [allPins,        setAllPins]        = useState([]);
  const [activePins,     setActivePins]     = useState(null);

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
      const slotData = payload.data || {};
      const slotId = slotData.slotId;
      const row = slotData.row;
      if (slotId && row) spawnToast(slotId, row);
    });

    return unsubscribe;
  }, [fcm.token, fcm.onMessage]);

  // Load Firebase geo pins and active Pi pin for the map
  useEffect(() => {
    const base = 'https://automapping-parking-slot-default-rtdb.asia-southeast1.firebasedatabase.app';
    fetch(`${base}/map_pins.json`)
      .then(r => r.json())
      .then(data => { if (data && typeof data === 'object') setAllPins(Object.values(data)); })
      .catch(() => {});
    fetch(`${base}/pi_config/active_pins.json`)
      .then(r => r.json())
      .then(data => { if (data && typeof data === 'object') setActivePins(data); })
      .catch(() => {});
  }, []);

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
      fireNotif(s);
      spawnToast(s.id, s.row);
    });

    const prevOccupied = prevSlotsRef.current.filter(s => s.status === 'occupied').length;
    const nowOccupied  = slots.filter(s => s.status === 'occupied').length;
    const total = slots.length;
    if (total > 0 && nowOccupied === total && prevOccupied < total) {
      fireFullNotif('Ground Floor');
    }

    prevSlotsRef.current = slots;
  }, [slots]); // eslint-disable-line react-hooks/exhaustive-deps

  // Derived state
  const selectedSlot = selectedId ? (slots.find(s => s.id === selectedId) ?? null) : null;
  const accentStyle  = {
    '--accent':      tweaks.accentColor,
    '--accent-pale': tweaks.accentColor + '1A',
  };

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

  async function handleSuppressToggle() {
    const newVal = !suppressed;
    setSuppressed(newVal);
    const s = getNotificationSettings();
    localStorage.setItem('rizzpark_notification_settings', JSON.stringify({ ...s, suppressed: newVal }));
    await saveNotificationSuppressed(fcm.token, newVal);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="app" style={accentStyle}>
      {showOnboarding && (
        <OnboardingOverlay onDismiss={() => { setShowOnboarding(false); setShowMapIntro(true); }} />
      )}

      <Topbar
        notifPerm={notifPerm}
        onNotifClick={handleNotif}
        pins={allPins}
        suppressed={suppressed}
        onSuppressToggle={handleSuppressToggle}
      />

      {showMapIntro && <MapIntro onContinue={() => setShowMapIntro(false)} pins={allPins} activePins={activePins} />}

      <div className="main" style={showMapIntro ? { display: 'none' } : {}}>
        <Sidebar
          slots={slots}
          selectedSlot={selectedSlot}
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
            <button className="map-view-btn" onClick={() => setShowMap(true)}>
              <img src="/topbar-logo.png" alt="" style={{ width: 18, height: 18, objectFit: 'contain' }} />
              Map View
            </button>
          </div>

          <ParkingCardGrid
            slots={slots}
            selected={selectedId}
            onSelect={setSelectedId}
            filter="all"
            theme="driver"
            showCarIcon={tweaks.showCarIcon}
          />
        </div>
      </div>

      {showMap && <GoogleMapView onClose={() => setShowMap(false)} pins={allPins} activePins={activePins} />}

      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      <DoneParkingBar
        suppressed={suppressed}
        onToggle={handleSuppressToggle}
        notifPerm={notifPerm}
      />

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
