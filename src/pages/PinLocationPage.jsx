import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import '../styles/global.css';
import Topbar        from '../components/Topbar';
import Sidebar       from '../components/Sidebar';
import ParkingCardGrid from '../components/ParkingCardGrid';
import GoogleMapView from '../components/GoogleMapView';
import { usePinFirebaseSlots } from '../hooks/usePinFirebaseSlots';

const FIREBASE_URL = 'https://automapping-parking-slot-default-rtdb.asia-southeast1.firebasedatabase.app';

export default function PinLocationPage() {
  const { pinCode } = useParams();
  const { slots, fbStatus, lastUpdated, pinName } = usePinFirebaseSlots(pinCode);

  const [selectedId, setSelectedId] = useState(null);
  const [filter,     setFilter]     = useState('all');
  const [showMap,    setShowMap]    = useState(false);
  const [allPins,    setAllPins]    = useState([]);

  // Load all Firebase pins so they appear in the map
  useEffect(() => {
    fetch(`${FIREBASE_URL}/map_pins.json`)
      .then(r => r.json())
      .then(data => {
        if (data && typeof data === 'object') setAllPins(Object.values(data));
      })
      .catch(() => {});
  }, []);

  const total    = slots.length;
  const vacant   = slots.filter(s => s.status === 'vacant').length;
  const occupied = slots.filter(s => s.status === 'occupied').length;

  const statusLine =
    fbStatus === 'checking' ? 'Connecting…' :
    fbStatus === 'error'    ? 'Connection error' :
    lastUpdated             ? `${vacant} available · ${occupied} occupied · updated ${new Date(lastUpdated).toLocaleTimeString('en-PH', { hour12: false })}` :
    'No data yet';

  const selectedSlot = selectedId ? slots.find(s => s.id === selectedId) ?? null : null;

  return (
    <div className="app">
      <Topbar notifPerm="unavailable" onNotifClick={() => {}} />

      <div className="main">
        <Sidebar
          slots={slots}
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

          <ParkingCardGrid
            slots={slots}
            selected={selectedId}
            onSelect={setSelectedId}
            filter={filter}
            theme="driver"
            showCarIcon={true}
          />
        </div>
      </div>

      {showMap && (
        <GoogleMapView onClose={() => setShowMap(false)} pins={allPins} />
      )}
    </div>
  );
}
