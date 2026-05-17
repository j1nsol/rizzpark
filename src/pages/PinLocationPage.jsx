import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import '../styles/global.css';
import Topbar        from '../components/Topbar';
import Sidebar       from '../components/Sidebar';
import ParkingCardGrid from '../components/ParkingCardGrid';
import GoogleMapView from '../components/GoogleMapView';
import { usePinFirebaseSlots } from '../hooks/usePinFirebaseSlots';
import { useFCM } from '../hooks/useFCM';

const FIREBASE_URL = 'https://automapping-parking-slot-default-rtdb.asia-southeast1.firebasedatabase.app';

export default function PinLocationPage() {
  const { pinCode } = useParams();
  const { slots, fbStatus, lastUpdated, pinName } = usePinFirebaseSlots(pinCode);
  const fcm = useFCM();

  const [selectedId, setSelectedId] = useState(null);
  const [filter,     setFilter]     = useState('all');
  const [showMap,    setShowMap]    = useState(false);
  const [allPins,      setAllPins]      = useState([]);
  const [activePins, setActivePins] = useState(null);

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

  return (
    <div className="app">
      <Topbar notifPerm={fcm.permission} onNotifClick={() => fcm.requestPermission().catch(() => {})} />

      <div className="main">
        <Sidebar
          slots={hasLiveData ? slots : []}
          filter={filter}
          selectedSlot={selectedSlot}
          onFilterChange={setFilter}
          onToggleStatus={() => {}}
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
            <ParkingCardGrid
              slots={slots}
              selected={selectedId}
              onSelect={setSelectedId}
              filter={filter}
              theme="driver"
              showCarIcon={true}
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
    </div>
  );
}
