import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

const DEFAULT_CENTER = [10.3157, 123.8854];

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

export default function MapIntro({ onContinue, pins = [], activePins = null, pinsOccupancy = {} }) {
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
      navBtn.textContent = 'View Parking →';
      const btnColor = isAvailable ? '#22A06B' : '#94a3b8';
      navBtn.style.cssText =
        `display:block;width:100%;padding:11px 16px;border:none;` +
        `background:${btnColor};color:#fff;` +
        `font-family:"DM Sans",sans-serif;font-size:13px;font-weight:600;` +
        `cursor:pointer;border-radius:0 0 8px 8px;letter-spacing:.01em;transition:opacity .15s`;
      navBtn.onmouseover = () => { navBtn.style.opacity = '0.88'; };
      navBtn.onmouseout  = () => { navBtn.style.opacity = '1'; };
      navBtn.onclick = () => navigate(`/${pin.pinCode}`);
      wrap.appendChild(navBtn);

      const marker = L.marker([pin.lat, pin.lng], { icon })
        .addTo(instanceRef.current)
        .bindPopup(wrap);

      markersRef.current.set(pin.pinCode, marker);
    });
  }, [pins, activePins, pinsOccupancy]);

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
