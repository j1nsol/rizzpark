import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

const DEFAULT_CENTER = [10.294722999317614, 123.88045512649316];
const MAP_ZOOM = 14;
const CEBU_BOUNDS = [[9.35, 123.25], [11.35, 124.15]]; // SW, NE of Cebu Province
const PIN_ACTIVE_TTL = 45_000;

function metersBetween(a, b) {
  const R = 6_371_000;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lng - a.lng) * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function fmtDist(m) {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}
function fmtTime(s) {
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

function stepInstruction(step) {
  if (!step) return '';
  const { type, modifier } = step.maneuver;
  const street = step.name ? ` onto ${step.name}` : '';
  if (type === 'depart')      return `Head ${modifier ?? 'forward'}${street}`;
  if (type === 'arrive')      return 'You have arrived';
  if (type === 'turn')        return `Turn ${modifier}${street}`;
  if (type === 'new name')    return `Continue${street}`;
  if (type === 'continue')    return `Continue ${modifier ?? 'straight'}`;
  if (type === 'merge')       return `Merge ${modifier}`;
  if (type === 'on ramp')     return `Take the ramp ${modifier}`;
  if (type === 'off ramp')    return `Take the exit ${modifier}`;
  if (type === 'fork')        return `Keep ${modifier} at the fork`;
  if (type === 'end of road') return `Turn ${modifier} at end of road`;
  if (type === 'roundabout' || type === 'rotary') return 'Enter the roundabout';
  return `${modifier ? modifier + ' — ' : ''}${step.name || 'Continue'}`.trim();
}

function getTurnArrow(step) {
  if (!step) return null;
  const mod = step.maneuver?.modifier ?? 'straight';
  const type = step.maneuver?.type;
  if (type === 'arrive') return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <circle cx="11" cy="11" r="5" stroke="#4A90E2" strokeWidth="2"/>
      <circle cx="11" cy="11" r="2" fill="#4A90E2"/>
    </svg>
  );
  if (mod === 'right' || mod === 'sharp right') return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <path d="M6 16V9a5 5 0 0 1 5-5h0" stroke="#4A90E2" strokeWidth="2" strokeLinecap="round"/>
      <path d="M8 7l3-3 3 3" stroke="#4A90E2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M11 4v3" stroke="#4A90E2" strokeWidth="2" strokeLinecap="round"/>
      <path d="M16 10v6" stroke="#4A90E2" strokeWidth="2" strokeLinecap="round"/>
      <path d="M14 14l2 2 2-2" stroke="#4A90E2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
  if (mod === 'left' || mod === 'sharp left') return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <path d="M16 16V9a5 5 0 0 0-5-5h0" stroke="#4A90E2" strokeWidth="2" strokeLinecap="round"/>
      <path d="M14 7l-3-3-3 3" stroke="#4A90E2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M11 4v3" stroke="#4A90E2" strokeWidth="2" strokeLinecap="round"/>
      <path d="M6 10v6" stroke="#4A90E2" strokeWidth="2" strokeLinecap="round"/>
      <path d="M8 14l-2 2-2-2" stroke="#4A90E2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
  if (mod === 'slight right') return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <path d="M7 17L15 7" stroke="#4A90E2" strokeWidth="2" strokeLinecap="round"/>
      <path d="M10 7h5v5" stroke="#4A90E2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
  if (mod === 'slight left') return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <path d="M15 17L7 7" stroke="#4A90E2" strokeWidth="2" strokeLinecap="round"/>
      <path d="M12 7H7v5" stroke="#4A90E2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
  if (mod === 'uturn') return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <path d="M7 16V9a4 4 0 0 1 8 0v7" stroke="#4A90E2" strokeWidth="2" strokeLinecap="round"/>
      <path d="M13 14l2 2-2 2" stroke="#4A90E2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
  // default: straight up arrow
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <path d="M11 18V6" stroke="#4A90E2" strokeWidth="2" strokeLinecap="round"/>
      <path d="M7 10l4-4 4 4" stroke="#4A90E2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

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
  const navigate = useNavigate();

  // Map refs
  const mapRef          = useRef(null);
  const instanceRef     = useRef(null);
  const searchMarkerRef = useRef(null);
  const fbMarkersRef    = useRef(new Map());

  // User location refs
  const userMarkerRef = useRef(null);
  const userCircleRef = useRef(null);
  const watchIdRef    = useRef(null);
  const userPosRef    = useRef(null);  // always-fresh copy for DOM event handlers
  const iconModeRef   = useRef(null);  // 'dot' | 'arrow' — avoids setIcon on every tick

  // Route refs
  const routeLayerRef      = useRef(null);
  const startNavigationRef = useRef(null);
  const lastRoutePosRef    = useRef(null);
  const navLoadingRef      = useRef(false);
  const routeGeomRef       = useRef(null); // flat [{lat,lng}] for off-route checks

  // Search state
  const [query,       setQuery]       = useState('');
  const [searching,   setSearching]   = useState(false);
  const [searchErr,   setSearchErr]   = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [sugLoading,  setSugLoading]  = useState(false);
  const [activeIdx,   setActiveIdx]   = useState(-1);
  const debounceRef    = useRef(null);
  const searchWrapRef  = useRef(null);
  const searchInputRef = useRef(null);

  const [searchOpen, setSearchOpen] = useState(false);

  // Location state
  const [userPos, setUserPos] = useState(null);
  const [locErr,  setLocErr]  = useState(null);

  // Navigation state
  const [navTarget,      setNavTarget]      = useState(null);
  const [navRoute,       setNavRoute]       = useState(null);
  const [navLoading,     setNavLoading]     = useState(false);
  const [navErr,         setNavErr]         = useState(null);
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  // ── Map init ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (instanceRef.current) return;

    const map = L.map(mapRef.current, {
      center: DEFAULT_CENTER,
      zoom: MAP_ZOOM,
      zoomControl: true,
      maxBounds: CEBU_BOUNDS,
      maxBoundsViscosity: 1.0,
      minZoom: 10,
    });
    instanceRef.current = map;
    instanceRef.current.setView(DEFAULT_CENTER, MAP_ZOOM);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/">CARTO</a>',
      maxZoom: 19,
    }).addTo(map);

    // Centre on user's location if available
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => {
          if (instanceRef.current) {
            instanceRef.current.setView([pos.coords.latitude, pos.coords.longitude], MAP_ZOOM);
          }
        },
        () => {}, // silently fall back to DEFAULT_CENTER
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 30_000 }
      );
    }

    const stopDrag = () => map.fire('mouseup');
    document.addEventListener('mouseup', stopDrag);

    return () => {
      document.removeEventListener('mouseup', stopDrag);
      if (userMarkerRef.current) { userMarkerRef.current.remove(); userMarkerRef.current = null; }
      if (userCircleRef.current) { userCircleRef.current.remove(); userCircleRef.current = null; }
      if (routeLayerRef.current) { routeLayerRef.current.remove(); routeLayerRef.current = null; }
      map.remove();
      instanceRef.current = null;
      fbMarkersRef.current.clear();
    };
  }, []);

  // ── Geolocation watch ───────────────────────────────────────────────────
  useEffect(() => {
    if (!navigator.geolocation) return;

    watchIdRef.current = navigator.geolocation.watchPosition(
      pos => {
        const p = {
          lat:      pos.coords.latitude,
          lng:      pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          heading:  pos.coords.heading, // degrees 0–360, or null when stationary
        };
        userPosRef.current = p;
        setUserPos(p);
        setLocErr(null);
      },
      err => {
        if (err.code === 1) setLocErr('Location access denied');
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 15_000 }
    );

    return () => {
      if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, []);

  // ── Update user dot + accuracy circle ───────────────────────────────────
  useEffect(() => {
    const map = instanceRef.current;
    if (!map || !userPos) return;

    const latlng = [userPos.lat, userPos.lng];

    if (userCircleRef.current) {
      userCircleRef.current.setLatLng(latlng).setRadius(userPos.accuracy);
    } else {
      userCircleRef.current = L.circle(latlng, {
        radius: userPos.accuracy, color: '#4A90E2',
        fillColor: '#4A90E2', fillOpacity: 0.10, weight: 1,
      }).addTo(map);
    }

    const hasHeading = navTarget && userPos.heading != null && !isNaN(userPos.heading);
    const newMode = hasHeading ? 'arrow' : 'dot';

    if (!userMarkerRef.current) {
      // First render — create the marker
      const icon = newMode === 'arrow'
        ? L.divIcon({
            html: `<svg width="22" height="28" viewBox="0 0 22 28" fill="none" style="transform-origin:11px 14px;filter:drop-shadow(0 2px 5px rgba(74,144,226,.55))"><path d="M11 2L20 24L11 18L2 24Z" fill="#4A90E2" stroke="white" stroke-width="1.8" stroke-linejoin="round"/></svg>`,
            className: '', iconSize: [22, 28], iconAnchor: [11, 14],
          })
        : L.divIcon({ className: 'user-dot', iconSize: [16, 16], iconAnchor: [8, 8] });
      userMarkerRef.current = L.marker(latlng, { icon, zIndexOffset: 1000 }).addTo(map);
      iconModeRef.current = newMode;
    } else {
      // Move marker — no DOM removal/re-add
      userMarkerRef.current.setLatLng(latlng);

      if (iconModeRef.current !== newMode) {
        // Only call setIcon when switching between dot and arrow
        const icon = newMode === 'arrow'
          ? L.divIcon({
              html: `<svg width="22" height="28" viewBox="0 0 22 28" fill="none" style="transform-origin:11px 14px;filter:drop-shadow(0 2px 5px rgba(74,144,226,.55))"><path d="M11 2L20 24L11 18L2 24Z" fill="#4A90E2" stroke="white" stroke-width="1.8" stroke-linejoin="round"/></svg>`,
              className: '', iconSize: [22, 28], iconAnchor: [11, 14],
            })
          : L.divIcon({ className: 'user-dot', iconSize: [16, 16], iconAnchor: [8, 8] });
        userMarkerRef.current.setIcon(icon);
        iconModeRef.current = newMode;
      }
    }

    // Update rotation directly on the existing SVG element — no flicker
    if (newMode === 'arrow') {
      const svg = userMarkerRef.current.getElement()?.querySelector('svg');
      if (svg) svg.style.transform = `rotate(${userPos.heading}deg)`;
    }
  }, [userPos]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Navigation helpers ───────────────────────────────────────────────────
  const fetchRoute = useCallback(async (pin, pos, silent = false) => {
    if (!pos || navLoadingRef.current) return;

    navLoadingRef.current = true;
    if (!silent) { setNavLoading(true); setNavErr(null); }
    lastRoutePosRef.current = pos;

    try {
      const url =
        `https://router.project-osrm.org/route/v1/driving/` +
        `${pos.lng},${pos.lat};${pin.lng},${pin.lat}` +
        `?overview=full&geometries=geojson&steps=true`;
      const res  = await fetch(url);
      const data = await res.json();

      if (data.code !== 'Ok') throw new Error('No route found');

      const leg = data.routes[0].legs[0];
      setNavRoute({
        distance: data.routes[0].distance,
        duration: data.routes[0].duration,
        steps:    leg.steps,
      });
      if (!silent) setCurrentStepIdx(0);

      // Store geometry as flat [{lat,lng}] for off-route checks
      routeGeomRef.current = data.routes[0].geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));

      // Draw new layer first, then remove old — no flicker
      const newLayer = L.geoJSON(data.routes[0].geometry, {
        style: { color: '#4A90E2', weight: 5, opacity: 0.85, lineCap: 'round', lineJoin: 'round' },
      }).addTo(instanceRef.current);

      if (routeLayerRef.current) routeLayerRef.current.remove();
      routeLayerRef.current = newLayer;

      if (!silent) instanceRef.current.flyTo([pos.lat, pos.lng], 16, { duration: 1.2 });
      setNavErr(null);
    } catch {
      if (!silent) setNavErr('Could not get route. Check your connection.');
    } finally {
      navLoadingRef.current = false;
      setNavLoading(false);
    }
  }, []);

  function startNavigation(pin) {
    const pos = userPosRef.current;  // always current, not stale closure
    if (!pos) {
      setNavTarget(pin);
      setNavErr('Location not available yet — please allow location access and try again.');
      return;
    }
    setNavTarget(pin);
    setNavRoute(null);
    fetchRoute(pin, pos);
  }
  startNavigationRef.current = startNavigation;

  function clearNavigation() {
    setNavTarget(null);
    setNavRoute(null);
    setNavErr(null);
    setNavLoading(false);
    setCurrentStepIdx(0);
    routeGeomRef.current = null;
    if (routeLayerRef.current) { routeLayerRef.current.remove(); routeLayerRef.current = null; }
  }

  // Navigation tracking: auto-pan + step advancement + off-route detection
  useEffect(() => {
    const pos = userPosRef.current;
    const map = instanceRef.current;
    if (!navTarget || !pos || !map) return;

    // 1. Keep user centred — enforce minimum zoom so the map never stays zoomed out
    const zoom = Math.max(map.getZoom(), 15);
    map.setView([pos.lat, pos.lng], zoom, { animate: true, duration: 0.6 });

    // 2. Advance to next step when within 25 m of the upcoming maneuver point
    if (navRoute) {
      const nextStep = navRoute.steps[currentStepIdx + 1];
      if (nextStep) {
        const [nLng, nLat] = nextStep.maneuver.location;
        if (metersBetween(pos, { lat: nLat, lng: nLng }) < 25) {
          setCurrentStepIdx(i => Math.min(i + 1, navRoute.steps.length - 1));
        }
      }
    }

    // 3. Off-route check (>50 m from route) → reroute; otherwise refresh every 30 m
    if (!navLoadingRef.current) {
      const last = lastRoutePosRef.current;

      let offRoute = false;
      if (routeGeomRef.current) {
        let minDist = Infinity;
        const geom = routeGeomRef.current;
        for (let i = 0; i < geom.length; i += 3) {
          const d = metersBetween(pos, geom[i]);
          if (d < minDist) minDist = d;
          if (minDist < 50) break; // early exit once clearly on-route
        }
        offRoute = minDist > 50;
      }

      if (offRoute) {
        setNavErr('Rerouting…');
        setCurrentStepIdx(0);
        fetchRoute(navTarget, pos, true);
      } else if (!last || metersBetween(last, pos) >= 30) {
        fetchRoute(navTarget, pos, true);
      }
    }
  }, [userPos]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Parking pin markers ─────────────────────────────────────────────────
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

      if (!isAvailable) {
        wrap.appendChild(divider());
        const noFeed = document.createElement('div');
        noFeed.style.cssText = 'padding:8px 16px;font-size:11px;color:#94a3b8';
        noFeed.textContent = '📷 No camera feed';
        wrap.appendChild(noFeed);
      }

      // Navigate button
      wrap.appendChild(divider());
      const navRouteBtn = document.createElement('button');
      navRouteBtn.textContent = '↗ Navigate';
      navRouteBtn.style.cssText =
        `display:block;width:100%;padding:9px 16px;border:none;` +
        `background:#4A90E2;color:#fff;` +
        `font-family:"DM Sans",sans-serif;font-size:13px;font-weight:600;` +
        `cursor:pointer;letter-spacing:.01em;transition:opacity .15s`;
      navRouteBtn.onmouseover = () => { navRouteBtn.style.opacity = '0.85'; };
      navRouteBtn.onmouseout  = () => { navRouteBtn.style.opacity = '1'; };
      navRouteBtn.onclick = () => {
        instanceRef.current?.closePopup();
        startNavigationRef.current(pin);  // always calls the latest version
      };
      wrap.appendChild(navRouteBtn);

      // View Parking button
      wrap.appendChild(divider());
      const viewBtn = document.createElement('button');
      const isCurrentPin = currentPinCode === pin.pinCode;
      viewBtn.textContent = isCurrentPin ? 'Close Map' : 'View Parking →';
      const btnColor = isAvailable ? '#22A06B' : '#94a3b8';
      viewBtn.style.cssText =
        `display:block;width:100%;padding:11px 16px;border:none;` +
        `background:${btnColor};color:#fff;` +
        `font-family:"DM Sans",sans-serif;font-size:13px;font-weight:600;` +
        `cursor:pointer;border-radius:0 0 8px 8px;letter-spacing:.01em;transition:opacity .15s`;
      viewBtn.onmouseover = () => { viewBtn.style.opacity = '0.88'; };
      viewBtn.onmouseout  = () => { viewBtn.style.opacity = '1'; };
      viewBtn.onclick = () => {
        if (isCurrentPin) { instanceRef.current?.closePopup(); onClose(); }
        else { window.location.href = `/${pin.pinCode}`; }
      };
      wrap.appendChild(viewBtn);

      const marker = L.marker([pin.lat, pin.lng], { icon })
        .addTo(instanceRef.current)
        .bindPopup(wrap);

      fbMarkersRef.current.set(pin.pinCode, marker);
    });
  }, [pins, activePins, pinsOccupancy]);

  // ── Search suggestions (debounced) ─────────────────────────────────────
  function handleQueryChange(e) {
    const val = e.target.value;
    setQuery(val);
    setSearchErr(null);
    setActiveIdx(-1);

    clearTimeout(debounceRef.current);

    if (!val.trim()) { setSuggestions([]); return; }

    // Show matching pinned locations immediately (local, no network needed)
    const q = val.trim().toLowerCase();
    const pinMatches = pins
      .filter(p => p.name.toLowerCase().includes(q))
      .map(p => ({ short: p.name, display: p.name, lat: p.lat, lon: p.lng, type: 'pin' }));

    setSuggestions(pinMatches);
    setSugLoading(true);

    debounceRef.current = setTimeout(async () => {
      try {
        const res  = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(val.trim())}&format=json&limit=5&addressdetails=1&countrycodes=ph&viewbox=123.25,11.35,124.15,9.35&bounded=1`,
          { headers: { 'Accept-Language': 'en' } }
        );
        const data = await res.json();
        const placeSugs = data.map(r => ({
          display: r.display_name,
          short:   r.name || r.display_name.split(',')[0],
          lat:     parseFloat(r.lat),
          lon:     parseFloat(r.lon),
          type:    'place',
        }));
        setSuggestions([...pinMatches, ...placeSugs]);
      } catch {
        setSuggestions(pinMatches);
      } finally {
        setSugLoading(false);
      }
    }, 350);
  }

  function pickSuggestion(sug) {
    setQuery(sug.short);
    setSuggestions([]);
    setActiveIdx(-1);
    setSearchErr(null);
    instanceRef.current?.flyTo([sug.lat, sug.lon], 16, { duration: 1.2 });
  }

  function handleSearchKeyDown(e) {
    if (!suggestions.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx(i => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, -1));
    } else if (e.key === 'Enter' && activeIdx >= 0) {
      e.preventDefault();
      pickSuggestion(suggestions[activeIdx]);
    } else if (e.key === 'Escape') {
      setSuggestions([]);
      setActiveIdx(-1);
    }
  }

  // ── Search (Go button / Enter with no active suggestion) ────────────────
  async function handleSearch(e) {
    e.preventDefault();
    if (activeIdx >= 0 && suggestions[activeIdx]) {
      pickSuggestion(suggestions[activeIdx]);
      return;
    }
    const q = query.trim();
    if (!q) return;

    setSuggestions([]);
    setSearching(true);
    setSearchErr(null);

    try {
      const res  = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&countrycodes=ph&viewbox=123.25,11.35,124.15,9.35&bounded=1`,
        { headers: { 'Accept-Language': 'en' } }
      );
      const data = await res.json();

      if (!data.length) { setSearchErr('No results found.'); return; }

      const { lat, lon } = data[0];
      if (searchMarkerRef.current) { searchMarkerRef.current.remove(); searchMarkerRef.current = null; }
      instanceRef.current.flyTo([parseFloat(lat), parseFloat(lon)], 16, { duration: 1.2 });
    } catch {
      setSearchErr('Search failed. Check your connection.');
    } finally {
      setSearching(false);
    }
  }

  // ── Mobile search toggle ────────────────────────────────────────────────
  function openSearch() {
    setSearchOpen(true);
    setTimeout(() => searchInputRef.current?.focus(), 50);
  }
  function closeSearch() {
    setSearchOpen(false);
    setQuery('');
    setSuggestions([]);
    setSearchErr(null);
  }

  // ── Locate button ───────────────────────────────────────────────────────
  function handleLocate() {
    const pos = userPosRef.current;
    if (pos) {
      instanceRef.current?.flyTo([pos.lat, pos.lng], 17, { duration: 1 });
      return;
    }
    navigator.geolocation?.getCurrentPosition(
      pos => {
        instanceRef.current?.flyTo([pos.coords.latitude, pos.coords.longitude], 17, { duration: 1 });
      },
      () => setLocErr('Could not get location'),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  function handleOverlayClick(e) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div className="map-overlay" onClick={handleOverlayClick}>
      <div className="map-modal">

        <div className="map-modal-header">

          {/* Branding */}
          <div className={`map-modal-title${searchOpen ? ' map-title-search-open' : ''}`}>
            <img src="/topbar-logo.png" alt="" style={{ width: 30, height: 30, objectFit: 'contain' }} />
            <span>Live parking map</span>
          </div>

          {/* Search form — desktop always, mobile only when open */}
          <form className={`map-search-form${!searchOpen ? ' map-search-collapsed' : ''}`} onSubmit={handleSearch}>
            <div className="map-search-wrap" ref={searchWrapRef}>
              <svg className="map-search-icon" width="13" height="13" viewBox="0 0 13 13" fill="none">
                <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.3"/>
                <path d="M9 9l2.5 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
              <input
                ref={searchInputRef}
                className="map-search-input"
                type="text"
                placeholder="Search location…"
                value={query}
                onChange={handleQueryChange}
                onKeyDown={handleSearchKeyDown}
                onBlur={() => setTimeout(() => setSuggestions([]), 150)}
                disabled={searching}
                autoComplete="off"
              />
              {query && (
                <button
                  type="button"
                  className="map-search-clear"
                  onMouseDown={e => { e.preventDefault(); setQuery(''); setSuggestions([]); setSearchErr(null); searchInputRef.current?.focus(); }}
                  tabIndex={-1}
                  aria-label="Clear search"
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ display: 'block' }}>
                    <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                  </svg>
                </button>
              )}
              {searchErr && <span className="map-search-err">{searchErr}</span>}

              {(suggestions.length > 0 || sugLoading) && (
                <ul className="map-suggestions">
                  {sugLoading && !suggestions.length && (
                    <li className="map-suggestion-loading">Searching…</li>
                  )}
                  {suggestions.map((sug, i) => (
                    <li
                      key={i}
                      className={`map-suggestion-item${i === activeIdx ? ' active' : ''}`}
                      onMouseDown={() => pickSuggestion(sug)}
                    >
                      {sug.type === 'pin' ? (
                        <img src="/topbar-logo.png" alt="" style={{ width: 14, height: 14, objectFit: 'contain', flexShrink: 0, marginTop: 2 }} />
                      ) : (
                        <svg width="11" height="11" viewBox="0 0 11 11" fill="none" style={{ flexShrink: 0, marginTop: 2 }}>
                          <circle cx="5.5" cy="5.5" r="3.5" stroke="currentColor" strokeWidth="1.2"/>
                          <path d="M8 8l2 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                        </svg>
                      )}
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <div className="map-suggestion-main">{sug.short}</div>
                          {sug.type === 'pin' && <span className="map-suggestion-pin-badge">Parking</span>}
                        </div>
                        {sug.type === 'place' && (
                          <div className="map-suggestion-sub">{sug.display.split(',').slice(1, 3).join(',').trim()}</div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <button className="map-search-btn" type="submit" disabled={searching || !query.trim()}>
              {searching ? '…' : 'Go'}
            </button>
          </form>

          {/* Action buttons — always pushed to the right */}
          <div className="map-header-actions">
            {/* Search toggle: mobile only, hidden when search is open */}
            <button className="map-icon-btn map-search-toggle-btn" onClick={openSearch} title="Search location">
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.4"/>
                <path d="M11 11l2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
            </button>

            {/* Close / close-search */}
            <button
              className="map-icon-btn map-close-btn"
              onClick={searchOpen ? closeSearch : onClose}
              title={searchOpen ? 'Close search' : 'Close map'}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>

        </div>

        <div className="map-container-wrap">
          <div ref={mapRef} className="map-container" />
          <button className="map-locate-fab" onClick={handleLocate} title={locErr ?? 'Go to my location'}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <circle cx="9" cy="9" r="3.5" stroke="currentColor" strokeWidth="1.6"/>
              <path d="M9 1v3M9 14v3M1 9h3M14 9h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {navTarget && (() => {
          const nextStep = navRoute?.steps?.[currentStepIdx + 1] ?? navRoute?.steps?.[navRoute.steps.length - 1];
          const nextManeuverDist = nextStep && userPos
            ? metersBetween(userPos, { lat: nextStep.maneuver.location[1], lng: nextStep.maneuver.location[0] })
            : null;
          return (
            <div className="nav-panel">

              {/* Next turn banner */}
              {navRoute && nextStep && (
                <div className="nav-next-turn">
                  <div className="nav-turn-arrow">{getTurnArrow(nextStep)}</div>
                  <div className="nav-turn-info">
                    <div className="nav-turn-dist">
                      {nextManeuverDist != null ? `In ${fmtDist(nextManeuverDist)}` : 'Proceed'}
                    </div>
                    <div className="nav-turn-instr">{stepInstruction(nextStep)}</div>
                  </div>
                </div>
              )}

              {/* Route summary + destination */}
              <div className="nav-panel-footer">
                <div className="nav-panel-dest">
                  <span className="nav-dot-label" />
                  <div>
                    <div className="nav-panel-name">{navTarget.name}</div>
                    {navRoute && (
                      <div className="nav-panel-meta">
                        {fmtDist(navRoute.distance)} · {fmtTime(navRoute.duration)}
                      </div>
                    )}
                  </div>
                </div>
                <button className="nav-clear-btn" onClick={clearNavigation} title="Stop navigation">✕</button>
              </div>

              {navLoading && !navRoute && <div className="nav-panel-status">Getting route…</div>}
              {navErr && <div className={`nav-panel-err${navErr === 'Rerouting…' ? ' rerouting' : ''}`}>{navErr}</div>}

              {navRoute && navRoute.steps.length > 0 && (
                <details className="nav-steps">
                  <summary>All steps ({navRoute.steps.length})</summary>
                  <ol className="nav-steps-list">
                    {navRoute.steps.map((step, i) => (
                      <li key={i} className={i === currentStepIdx ? 'active-step' : ''}>
                        <span className="nav-step-dist">{fmtDist(step.distance)}</span>
                        {stepInstruction(step)}
                      </li>
                    ))}
                  </ol>
                </details>
              )}
            </div>
          );
        })()}

      </div>
    </div>
  );
}
