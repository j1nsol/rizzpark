import { useEffect, useRef } from 'react';
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

export default function MapIntro({ onContinue, pins = [], activePinCode = null }) {
  const navigate    = useNavigate();
  const mapRef      = useRef(null);
  const instanceRef = useRef(null);
  const markersRef  = useRef(new Map());

  useEffect(() => {
    if (instanceRef.current) return;

    const map = L.map(mapRef.current, {
      center: DEFAULT_CENTER,
      zoom: 15,
      zoomControl: true,
    });
    instanceRef.current = map;

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/">CARTO</a>',
      maxZoom: 19,
    }).addTo(map);

    return () => {
      map.remove();
      instanceRef.current = null;
      markersRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!instanceRef.current) return;

    markersRef.current.forEach(marker => marker.remove());
    markersRef.current.clear();

    pins.forEach(pin => {
      const isAvailable = activePinCode !== null && pin.pinCode === activePinCode;
      const icon = isAvailable ? parkingIcon : unavailableIcon;

      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;flex-direction:column;gap:6px;min-width:150px';

      const title = document.createElement('div');
      title.style.cssText = 'font-family:sans-serif;font-size:13px;font-weight:700';
      title.textContent = pin.name;

      const codeEl = document.createElement('div');
      codeEl.style.cssText = 'font-family:monospace;font-size:11px;color:#64748b';
      codeEl.textContent = `📍 ${pin.pinCode}`;

      wrap.appendChild(title);
      wrap.appendChild(codeEl);

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

      markersRef.current.set(pin.pinCode, marker);
    });
  }, [pins, activePinCode]);

  return (
    <div className="map-intro">
      <div ref={mapRef} className="map-intro-map" />

      <div className="map-intro-footer">
        <div className="map-intro-text">
          <div className="map-intro-title">Find your parking spot</div>
          <div className="map-intro-sub">Explore the area, then head to the live dashboard</div>
        </div>
        <button className="map-intro-btn" onClick={onContinue}>
          Continue to Dashboard
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M3 7h8M8 4l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
