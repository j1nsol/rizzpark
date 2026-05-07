import { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

const parkingIcon = L.icon({
  iconUrl:     '/topbar-logo.png',
  iconSize:    [40, 40],
  iconAnchor:  [20, 40],
  popupAnchor: [0, -44],
});

const DEFAULT_CENTER = [10.294756867999133, 123.8805492386066];
const MAP_ZOOM = 14 ;

export default function GoogleMapView({ onClose }) {
  const mapRef          = useRef(null);
  const instanceRef     = useRef(null);
  const searchMarkerRef = useRef(null);
  const userMarkersRef  = useRef(new Map());
  const pinCountRef     = useRef(0);
  const addingRef       = useRef(false);
  const disableAddRef   = useRef(null);

  const [query,     setQuery]     = useState('');
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState(null);
  const [addMode,   setAddMode]   = useState(false);

  useEffect(() => {
    if (instanceRef.current) return;

    const map = L.map(mapRef.current, {
      center: DEFAULT_CENTER,
      zoom: MAP_ZOOM,
      zoomControl: true,
    });
    instanceRef.current = map;

   L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
  attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/">CARTO</a>',
  maxZoom: 19,
  }).addTo(map);

    const defaultWrap = document.createElement('div');
    defaultWrap.className = 'pin-popup';

    const defaultLabel = document.createElement('div');
    defaultLabel.className = 'pin-popup-title';
    defaultLabel.innerHTML = '<b>Rizz.Park</b> — Smart Parking';

    const defaultDel = document.createElement('button');
    defaultDel.className   = 'pin-popup-delete';
    defaultDel.textContent = 'Delete pin';
    defaultDel.onclick = () => { defaultMarker.remove(); };

    defaultWrap.appendChild(defaultLabel);
    defaultWrap.appendChild(defaultDel);

    const defaultMarker = L.marker(DEFAULT_CENTER, { icon: parkingIcon })
      .addTo(map)
      .bindPopup(defaultWrap)
      .openPopup();

    map.on('click', (e) => {
      if (!addingRef.current) return;

      const id = ++pinCountRef.current;

      // Build popup DOM so we can attach the delete handler
      const wrap = document.createElement('div');
      wrap.className = 'pin-popup';

      const input = document.createElement('input');
      input.className    = 'pin-popup-input';
      input.placeholder  = 'Name this pin…';

      const del = document.createElement('button');
      del.className   = 'pin-popup-delete';
      del.textContent = 'Delete pin';
      del.onclick = () => {
        const m = userMarkersRef.current.get(id);
        if (m) { m.remove(); userMarkersRef.current.delete(id); }
      };

      wrap.appendChild(input);
      wrap.appendChild(del);

      const marker = L.marker(e.latlng, { icon: parkingIcon })
        .addTo(map)
        .bindPopup(wrap)
        .openPopup();

      userMarkersRef.current.set(id, marker);
      disableAddRef.current?.();
    });

    return () => {
      map.remove();
      instanceRef.current = null;
    };
  }, []);

  // Keep cursor style and disable callback in sync with add mode
  useEffect(() => {
    addingRef.current  = addMode;
    disableAddRef.current = () => setAddMode(false);
    if (!instanceRef.current) return;
    instanceRef.current.getContainer().style.cursor = addMode ? 'crosshair' : '';
  }, [addMode]);

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

          <button
            className={`map-addpin-btn${addMode ? ' active' : ''}`}
            onClick={() => setAddMode(v => !v)}
            title={addMode ? 'Cancel adding pin' : 'Add a pin'}
          >
            <img src="/topbar-logo.png" alt="" style={{ width: 18, height: 18, objectFit: 'contain' }} />
            {addMode ? 'Cancel' : 'Add Pin'}
          </button>

          <button className="map-close-btn" onClick={onClose} title="Close map">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <div ref={mapRef} className="map-container" />

        {addMode && (
          <div className="map-add-hint">
            Click anywhere on the map to place a pin
          </div>
        )}

      </div>
    </div>
  );
}
