import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

const DEFAULT_CENTER = [10.294722999317614, 123.88045512649316];
const MAP_ZOOM = 14;

const PIN_ACTIVE_TTL = 45_000;

function makeMarkerIcon(isAvailable, occ) {
  let badgeHtml = '';
  if (occ && occ.total > 0) {
    const cls   = occ.vacant === 0 ? 'full' : 'vacant';
    const label = occ.vacant === 0 ? 'Full' : `${occ.vacant} free`;
    badgeHtml = `<div class="pin-occ-badge ${cls}">${label}</div>`;
  }
  const imgStyle = isAvailable
    ? 'width:40px;height:40px'
    : 'width:40px;height:40px;filter:grayscale(1);opacity:0.55';
  return L.divIcon({
    html: `<div class="pin-marker-wrap">${badgeHtml}<img src="/topbar-logo.png" style="${imgStyle}" /></div>`,
    className: '',
    iconSize:    [40, 60],
    iconAnchor:  [20, 60],
    popupAnchor: [0, -64],
  });
}

export default function GoogleMapView({ onClose, pins = [], activePins = null, pinsOccupancy = {}, currentPinCode = null }) {
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

    fbMarkersRef.current.forEach(marker => marker.remove());
    fbMarkersRef.current.clear();

    pins.forEach(pin => {
      const ts = activePins?.[pin.pinCode];
      const isAvailable = ts != null && (Date.now() - ts) < PIN_ACTIVE_TTL;
      const occ  = pinsOccupancy?.[pin.pinCode];
      const icon = makeMarkerIcon(isAvailable, occ);

      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;flex-direction:column;min-width:220px;font-family:"DM Sans",sans-serif;';

      // ── Header: centered logo + name
      const header = document.createElement('div');
      header.style.cssText = 'padding:16px 16px 12px;display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center';
      const title = document.createElement('div');
      title.style.cssText = 'font-size:14px;font-weight:700;color:#111;line-height:1.3';
      title.textContent = pin.name;
      header.appendChild(title);
      wrap.appendChild(header);

      const divider = () => {
        const d = document.createElement('div');
        d.style.cssText = 'height:1px;background:#e4e1da;margin:0';
        return d;
      };

      // ── Occupancy section
      if (occ && occ.total > 0) {
        wrap.appendChild(divider());
        const occSection = document.createElement('div');
        occSection.style.cssText = 'padding:10px 16px';
        const pct   = Math.round((occ.vacant / occ.total) * 100);
        const color = occ.vacant === 0 ? '#D93A3A' : occ.vacant <= 2 ? '#F97316' : '#22A06B';
        const label = occ.vacant === 0 ? 'Full — no slots available'
                    : occ.vacant === 1 ? '1 slot available'
                    : `${occ.vacant} of ${occ.total} available`;
        occSection.innerHTML =
          `<div style="font-size:12px;font-weight:600;color:${color};margin-bottom:6px">${label}</div>` +
          `<div style="height:4px;background:#e4e1da;border-radius:4px;overflow:hidden">` +
            `<div style="height:100%;width:${pct}%;background:${color};border-radius:4px"></div>` +
          `</div>`;
        wrap.appendChild(occSection);
      }

      // ── No camera feed notice
      if (!isAvailable) {
        wrap.appendChild(divider());
        const noFeed = document.createElement('div');
        noFeed.style.cssText = 'padding:8px 16px;font-size:11px;color:#94a3b8';
        noFeed.textContent = '📷 No camera feed';
        wrap.appendChild(noFeed);
      }

      // ── Action button
      wrap.appendChild(divider());
      const navBtn = document.createElement('button');
      const isCurrentPin = currentPinCode === pin.pinCode;
      navBtn.textContent = isCurrentPin ? 'Close Map' : 'View Parking →';
      const btnColor = isAvailable ? '#22A06B' : '#94a3b8';
      navBtn.style.cssText =
        `display:block;width:100%;padding:11px 16px;border:none;` +
        `background:${btnColor};color:#fff;` +
        `font-family:"DM Sans",sans-serif;font-size:13px;font-weight:600;` +
        `cursor:pointer;border-radius:0 0 8px 8px;letter-spacing:.01em;transition:opacity .15s`;
      navBtn.onmouseover = () => { navBtn.style.opacity = '0.88'; };
      navBtn.onmouseout  = () => { navBtn.style.opacity = '1'; };
      navBtn.onclick = isCurrentPin ? onClose : () => navigate(`/${pin.pinCode}`);
      wrap.appendChild(navBtn);

      const marker = L.marker([pin.lat, pin.lng], { icon })
        .addTo(instanceRef.current)
        .bindPopup(wrap);

      fbMarkersRef.current.set(pin.pinCode, marker);
    });
  }, [pins, activePins, pinsOccupancy]);

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

      const { lat, lon } = data[0];
      const latlng = [parseFloat(lat), parseFloat(lon)];

      if (searchMarkerRef.current) { searchMarkerRef.current.remove(); searchMarkerRef.current = null; }

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
