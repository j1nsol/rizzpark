import { useState, useEffect } from 'react';
import './styles/global.css';
import Topbar            from './components/Topbar';
import GoogleMapView     from './components/GoogleMapView';
import MapIntro          from './components/MapIntro';
import OnboardingOverlay from './components/OnboardingOverlay';
import { TweaksPanel, TweakColor } from './components/TweaksPanel';
import { useTweaks }    from './hooks/useTweaks';
import { useFCM }       from './hooks/useFCM';
import {
  canNotify, requestPerm, getNotificationSettings, ONBOARDING_KEY,
} from './utils/parking';
import { saveNotificationSuppressed } from './utils/firebase';

const FIREBASE_URL = 'https://automapping-parking-slot-default-rtdb.asia-southeast1.firebasedatabase.app';

const TWEAK_DEFAULTS = { accentColor: '#F5A623' };

export default function App() {
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const fcm = useFCM();

  const [notifPerm,      setNotifPerm]      = useState(
    canNotify() ? Notification.permission : 'unavailable'
  );
  const [suppressed,     setSuppressed]     = useState(
    () => getNotificationSettings().suppressed === true
  );
  const [showOnboarding, setShowOnboarding] = useState(
    () => localStorage.getItem(ONBOARDING_KEY) !== '1'
  );
  const [showMap,        setShowMap]        = useState(false);
  const [showMapIntro,   setShowMapIntro]   = useState(false);
  const [allPins,        setAllPins]        = useState([]);
  const [activePins,     setActivePins]     = useState(null);
  const [pinsOccupancy,  setPinsOccupancy]  = useState({});

  useEffect(() => {
    if (fcm.permission) setNotifPerm(fcm.permission);
  }, [fcm.permission]);

  useEffect(() => {
    fetch(`${FIREBASE_URL}/map_pins.json`)
      .then(r => r.json())
      .then(data => {
        if (data && typeof data === 'object') {
          const pinList = Object.values(data);
          setAllPins(pinList);
          pinList.forEach(pin => {
            fetch(`${FIREBASE_URL}/locations/${pin.pinCode}/slots.json`)
              .then(r => r.json())
              .then(slots => {
                if (slots && typeof slots === 'object') {
                  const arr = Object.values(slots);
                  const vacant = arr.filter(s =>
                    (s.status || s.manualStatus || '').toLowerCase() === 'vacant'
                  ).length;
                  setPinsOccupancy(prev => ({ ...prev, [pin.pinCode]: { vacant, total: arr.length } }));
                }
              })
              .catch(() => {});
          });
        }
      })
      .catch(() => {});
    fetch(`${FIREBASE_URL}/pi_config/active_pins.json`)
      .then(r => r.json())
      .then(data => { if (data && typeof data === 'object') setActivePins(data); })
      .catch(() => {});
  }, []);

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

  const accentStyle = {
    '--accent':      tweaks.accentColor,
    '--accent-pale': tweaks.accentColor + '1A',
  };

  return (
    <div className="app" style={accentStyle}>
      {showOnboarding && (
        <OnboardingOverlay onDismiss={() => { setShowOnboarding(false); if (window.innerWidth > 480) setShowMapIntro(true); }} />
      )}

      <Topbar
        notifPerm={notifPerm}
        onNotifClick={handleNotif}
        pins={allPins}
        suppressed={suppressed}
        onSuppressToggle={handleSuppressToggle}
      />

      {showMapIntro && (
        <MapIntro
          onContinue={() => setShowMapIntro(false)}
          pins={allPins}
          activePins={activePins}
          pinsOccupancy={pinsOccupancy}
        />
      )}

      {!showMapIntro && (
        <div className="landing">
          <img src="/topbar-logo.png" alt="" className="landing-logo" />
          <div className="landing-title">Find Parking</div>
          <div className="landing-sub">Open the map to see available spots near you.</div>
          <button className="map-view-btn landing-cta" onClick={() => setShowMap(true)}>
            <img src="/topbar-logo.png" alt="" style={{ width: 18, height: 18, objectFit: 'contain' }} />
            Open Map
          </button>
        </div>
      )}

      {showMap && (
        <GoogleMapView
          onClose={() => setShowMap(false)}
          pins={allPins}
          activePins={activePins}
          pinsOccupancy={pinsOccupancy}
        />
      )}

      <TweaksPanel>
        <TweakColor
          label="Accent color"
          value={tweaks.accentColor}
          onChange={v => setTweak('accentColor', v)}
        />
      </TweaksPanel>
    </div>
  );
}
