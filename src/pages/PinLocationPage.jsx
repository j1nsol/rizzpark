import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import '../styles/global.css';
import Topbar        from '../components/Topbar';
import Sidebar       from '../components/Sidebar';
import ParkingMapSpatial from '../components/ParkingMapSpatial';
import GoogleMapView from '../components/GoogleMapView';
import DoneParkingBar from '../components/DoneParkingBar';
import { usePinFirebaseSlots } from '../hooks/usePinFirebaseSlots';

import { setPinSlotOverride, clearPinSlotOverride, saveNotificationSuppressed } from '../utils/firebase';
import { useFCM } from '../hooks/useFCM';
import { canNotify, fireNotif, fireFullNotif, requestPerm, getNotificationSettings } from '../utils/parking';

const FIREBASE_URL = 'https://automapping-parking-slot-default-rtdb.asia-southeast1.firebasedatabase.app';

export default function PinLocationPage() {
  const { pinCode } = useParams();
  const { slots, fbStatus, lastUpdated, pinName, movingCars } = usePinFirebaseSlots(pinCode);
  const fcm = useFCM();

  const [selectedId,  setSelectedId]  = useState(null);
  const [showMap,     setShowMap]     = useState(false);
  const [allPins,     setAllPins]     = useState([]);
  const [activePins,  setActivePins]  = useState(null);
  const [notifPerm,   setNotifPerm]   = useState(
    canNotify() ? Notification.permission : 'unavailable'
  );
  const [suppressed,  setSuppressed]  = useState(
    () => getNotificationSettings().suppressed === true
  );

  const prevSlotsRef = useRef([]);

  // Load all Firebase pins and active Pi pins for the map
  useEffect(() => {
    fetch(`${FIREBASE_URL}/map_pins.json`)
      .then(r => r.json())
      .then(data => {
        if (data && typeof data === 'object') setAllPins(Object.values(data));
      })
      .catch(() => {});
    fetch(`${FIREBASE_URL}/pi_config/active_pins.json`)
      .then(r => r.json())
      .then(data => { if (data && typeof data === 'object') setActivePins(data); })
      .catch(() => {});
  }, []);

  // Detect occupied→vacant transitions and fire browser notifications
  useEffect(() => {
    if (!prevSlotsRef.current.length) {
      prevSlotsRef.current = slots;
      return;
    }
    const prevById = Object.fromEntries(prevSlotsRef.current.map(s => [s.id, s]));
    slots
      .filter(s => prevById[s.id]?.status === 'occupied' && s.status === 'vacant')
      .forEach(s => fireNotif(s, pinCode));

    const prevOccupied = prevSlotsRef.current.filter(s => s.status === 'occupied').length;
    const nowOccupied  = slots.filter(s => s.status === 'occupied').length;
    const total = slots.length;
    if (total > 0 && nowOccupied === total && prevOccupied < total) {
      fireFullNotif(pinName ?? pinCode, pinCode);
    }

    prevSlotsRef.current = slots;
  }, [slots]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleNotif() {
    if (notifPerm === 'granted') return;
    try {
      if (fcm.isSupported) {
        await fcm.requestPermission();
        setNotifPerm('granted');
      } else {
        const ok = await requestPerm();
        setNotifPerm(ok ? 'granted' : 'denied');
      }
    } catch {}
  }

  async function handleSuppressToggle() {
    const newVal = !suppressed;
    setSuppressed(newVal);
    const s = getNotificationSettings();
    localStorage.setItem('rizzpark_notification_settings', JSON.stringify({ ...s, suppressed: newVal }));
    await saveNotificationSuppressed(fcm.token, newVal);
  }

  const total    = slots.length;
  const vacant   = slots.filter(s => s.status === 'vacant').length;
  const occupied = slots.filter(s => s.status === 'occupied').length;

  const hasLiveData = fbStatus === 'online' && lastUpdated !== null && slots.length > 0;

  const statusLine =
    fbStatus === 'checking' ? 'Connecting…' :
    fbStatus === 'error'    ? 'Connection error — check your connection' :
    !lastUpdated            ? 'Waiting for Pi…' :
    !hasLiveData            ? 'Pi offline — no live data' :
    `${vacant} available · ${occupied} occupied · updated ${new Date(lastUpdated).toLocaleTimeString('en-PH', { hour12: false })}`;

  const selectedSlot = selectedId ? slots.find(s => s.id === selectedId) ?? null : null;

  async function handleToggleStatus(slot) {
    const newStatus = slot.status === 'occupied' ? 'Vacant' : 'Occupied';
    try {
      await setPinSlotOverride(pinCode, slot.id, newStatus);
    } catch (e) {
      console.error('Failed to override slot status:', e);
    }
  }

  return (
    <div className="app">
      <Topbar notifPerm={notifPerm} onNotifClick={handleNotif} pins={allPins}
        suppressed={suppressed} onSuppressToggle={handleSuppressToggle} />


      <div className="main">
        <Sidebar
          slots={hasLiveData ? slots : []}
          selectedSlot={selectedSlot}
          onToggleStatus={handleToggleStatus}
          onClearOverride={(id) => clearPinSlotOverride(pinCode, id)}
          onDeselect={() => setSelectedId(null)}
          showSelectedBox={true}
        />

        <div className="grid-area">
          <div className="grid-topbar">
            <div>
              <div className="grid-title">{pinName ?? pinCode} — Parking Map</div>
              <div className="grid-subtitle">{statusLine}</div>
            </div>
            <button className="map-view-btn" onClick={() => setShowMap(true)}>
              <img src="/topbar-logo.png" alt="" style={{ width: 18, height: 18, objectFit: 'contain' }} />
              Map View
            </button>
          </div>

          {hasLiveData ? (
            <ParkingMapSpatial
              slots={slots}
              selected={selectedId}
              onSelect={setSelectedId}
              filter="all"
              showCarIcon={true}
              movingCars={movingCars}
            />
          ) : (
            <div style={{
              display:'flex', flexDirection:'column', alignItems:'center',
              justifyContent:'center', gap:12, padding:'60px 20px', opacity:0.5,
            }}>
              <div style={{fontSize:40}}>📡</div>
              <div style={{fontWeight:700, fontSize:16}}>No live data</div>
              <div style={{fontSize:13, textAlign:'center', maxWidth:280}}>
                {fbStatus === 'checking'
                  ? 'Connecting to live feed…'
                  : 'The Pi for this location is offline or hasn\'t reported recently.'}
              </div>
            </div>
          )}
        </div>
      </div>

      {showMap && (
        <GoogleMapView onClose={() => setShowMap(false)} pins={allPins} activePins={activePins} />
      )}

      <DoneParkingBar suppressed={suppressed} onToggle={handleSuppressToggle} notifPerm={notifPerm} />
    </div>
  );
}
