import { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

const parkingIcon = L.icon({
  iconUrl:     '/topbar-logo.png',
  iconSize:    [40, 40],
  iconAnchor:  [20, 40],
  popupAnchor: [0, -44],
});

const DEFAULT_CENTER = [14.6507, 121.0686];

export default function MapIntro({ onContinue }) {
  const mapRef      = useRef(null);
  const instanceRef = useRef(null);

  useEffect(() => {
    if (instanceRef.current) return;

    const map = L.map(mapRef.current, {
      center: DEFAULT_CENTER,
      zoom: 17,
      zoomControl: true,
    });
    instanceRef.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    L.marker(DEFAULT_CENTER, { icon: parkingIcon })
      .addTo(map)
      .bindPopup('<b>Rizz.Park</b><br>Smart Parking')
      .openPopup();

    return () => {
      map.remove();
      instanceRef.current = null;
    };
  }, []);

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
