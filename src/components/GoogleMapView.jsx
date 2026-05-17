import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

const parkingIcon = L.icon({
  iconUrl:     '/topbar-logo.png',
  iconSize:    [40, 40],
  iconAnchor:  [20, 40],
  popupAnchor: [0, -44],
});

const unavailableIcon = L.divIcon({
  html: '<img src="/topbar-logo.png" style="width:40px;height:40px;filter:grayscale(1);opacity:0.55;" />',
  className: '',
  iconSize: [40, 40],
  iconAnchor: [20, 40],
  popupAnchor: [0, -44],
});

const DEFAULT_CENTER = [10.3157, 123.8854];
const MAP_ZOOM = 14 ;

export default function GoogleMapView({ onClose, pins = [], activePinCode = null }) {
  const navigate        = useNavigate();
  const mapRef          = useRef(null);
  const instanceRef     = useRef(null);
  const searchMarkerRef = useRef(null);
  const fbMarkersRef    = useRef(new Map());

  const [query,     setQuery]     = useState('');
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState(null);

  useEffect(() => {
    if (instanceRef.current) return;

    const map = L.map(mapRef.current, {
      center: DEFAULT_CENTER,
      zoom: MAP_ZOOM,
      zoomControl: true,
    });
    instanceRef.current = map;
  instanceRef.current.setView(DEFAULT_CENTER, MAP_ZOOM);
   L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
  attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/">CARTO</a>',
  maxZoom: 19,
  }).addTo(map);

    const stopDrag = () => map.fire('mouseup');
    document.addEventListener('mouseup', stopDrag);

    return () => {
      document.removeEventListener('mouseup', stopDrag);
      map.remove();
      instanceRef.current = null;
      fbMarkersRef.current.clear();
    };
  }, []);

  // Render Firebase-saved parking location pins
  useEffect(() => {
    if (!instanceRef.current) return;

    // Clear and rebuild all markers so icon/popup reflects latest activePinCode
    fbMarkersRef.current.forEach(marker => marker.remove());
    fbMarkersRef.current.clear();

    pins.forEach(pin => {
      const isAvailable = activePinCode !== null && pin.pinCode === activePinCode;
      const icon = isAvailable ? parkingIcon : unavailableIcon;

      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;flex-direction:column;gap:6px;min-width:150px';

      const title = document.createElement('div');
      title.style.cssText = 'font-family:sans-serif;font-size:13px;font-weight:700';
      title.textContent = pin.name;

      const code = document.createElement('div');
      code.style.cssText = 'font-family:monospace;font-size:11px;color:#64748b';
      code.textContent = `📍 ${pin.pinCode}`;

      wrap.appendChild(title);
      wrap.appendChild(code);

      if (!isAvailable) {
        const noFeed = document.createElement('div');
        noFeed.style.cssText = 'font-family:sans-serif;font-size:11px;color:#94a3b8;margin-top:1px';
        noFeed.textContent = '📷 No camera feed';
        wrap.appendChild(noFeed);
      }

      const navBtn = document.createElement('button');
      navBtn.textContent = 'View Parking →';
      if (isAvailable) {
        navBtn.style.cssText = 'margin-top:4px;padding:5px 12px;border-radius:6px;border:1px solid #10b98144;background:#10b98115;color:#10b981;font-family:monospace;font-size:11px;cursor:pointer;font-weight:700';
      } else {
        navBtn.style.cssText = 'margin-top:4px;padding:5px 12px;border-radius:6px;border:1px solid #94a3b844;background:#94a3b815;color:#94a3b8;font-family:monospace;font-size:11px;cursor:pointer;font-weight:700';
      }
      navBtn.onclick = () => navigate(`/${pin.pinCode}`);
      wrap.appendChild(navBtn);

      const marker = L.marker([pin.lat, pin.lng], { icon })
        .addTo(instanceRef.current)
        .bindPopup(wrap);

      fbMarkersRef.current.set(pin.pinCode, marker);
    });
  }, [pins, activePinCode]);

  async function handleSearch(e) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;

    setSearching(true);
    setSearchErr(null);

    try {
      const res  = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`,
        { headers: { 'Accept-Language': 'en' } }
      );
      const data = await res.json();

      if (!data.length) { setSearchErr('No results found.'); return; }

      const { lat, lon, display_name } = data[0];
      const latlng = [parseFloat(lat), parseFloat(lon)];

      if (searchMarkerRef.current) searchMarkerRef.current.remove();
      searchMarkerRef.current = L.marker(latlng, { icon: parkingIcon })
        .addTo(instanceRef.current)
        .bindPopup(display_name)
        .openPopup();

      instanceRef.current.flyTo(latlng, 16, { duration: 1.2 });
    } catch {
      setSearchErr('Search failed. Check your connection.');
    } finally {
      setSearching(false);
    }
  }

  function handleOverlayClick(e) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div className="map-overlay" onClick={handleOverlayClick}>
      <div className="map-modal">

        <div className="map-modal-header">
          <div className="map-modal-title">
            <img src="/topbar-logo.png" alt="" style={{ width: 20, height: 20, objectFit: 'contain' }} />
            Live Map View
          </div>

          <form className="map-search-form" onSubmit={handleSearch}>
            <div className="map-search-wrap">
              <svg className="map-search-icon" width="13" height="13" viewBox="0 0 13 13" fill="none">
                <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.3"/>
                <path d="M9 9l2.5 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
              <input
                className="map-search-input"
                type="text"
                placeholder="Search location…"
                value={query}
                onChange={e => { setQuery(e.target.value); setSearchErr(null); }}
                disabled={searching}
              />
              {searchErr && <span className="map-search-err">{searchErr}</span>}
            </div>
            <button className="map-search-btn" type="submit" disabled={searching || !query.trim()}>
              {searching ? '…' : 'Go'}
            </button>
          </form>

          <button className="map-close-btn" onClick={onClose} title="Close map">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <div ref={mapRef} className="map-container" />

      </div>
    </div>
  );
}
