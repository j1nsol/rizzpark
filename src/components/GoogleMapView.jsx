import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

const DEFAULT_CENTER = [10.294722999317614, 123.88045512649316];
const MAP_ZOOM = 14;
const PIN_ACTIVE_TTL = 45_000;

function fmtDist(m) {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}
function fmtTime(s) {
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`;
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

  // Route ref
  const routeLayerRef        = useRef(null);
  const startNavigationRef   = useRef(null); // stable ref so popup onclicks stay fresh

  // Search state
  const [query,       setQuery]       = useState('');
  const [searching,   setSearching]   = useState(false);
  const [searchErr,   setSearchErr]   = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [sugLoading,  setSugLoading]  = useState(false);
  const [activeIdx,   setActiveIdx]   = useState(-1);
  const debounceRef   = useRef(null);
  const searchWrapRef = useRef(null);

  // Location state
  const [userPos, setUserPos] = useState(null);
  const [locErr,  setLocErr]  = useState(null);

  // Navigation state
  const [navTarget,  setNavTarget]  = useState(null);
  const [navRoute,   setNavRoute]   = useState(null);
  const [navLoading, setNavLoading] = useState(false);
  const [navErr,     setNavErr]     = useState(null);

  // ── Map init ────────────────────────────────────────────────────────────
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
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
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
        radius:      userPos.accuracy,
        color:       '#4A90E2',
        fillColor:   '#4A90E2',
        fillOpacity: 0.10,
        weight:      1,
      }).addTo(map);
    }

    const dotIcon = L.divIcon({ className: 'user-dot', iconSize: [16, 16], iconAnchor: [8, 8] });
    if (userMarkerRef.current) {
      userMarkerRef.current.setLatLng(latlng);
    } else {
      userMarkerRef.current = L.marker(latlng, { icon: dotIcon, zIndexOffset: 1000 }).addTo(map);
    }
  }, [userPos]);

  // ── Navigation helpers ───────────────────────────────────────────────────
  const fetchRoute = useCallback(async (pin, pos) => {
    if (!pos) return;

    setNavLoading(true);
    setNavErr(null);

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

      if (routeLayerRef.current) routeLayerRef.current.remove();
      routeLayerRef.current = L.geoJSON(data.routes[0].geometry, {
        style: { color: '#4A90E2', weight: 5, opacity: 0.85, lineCap: 'round', lineJoin: 'round' },
      }).addTo(instanceRef.current);

      instanceRef.current.fitBounds(routeLayerRef.current.getBounds(), { padding: [40, 40] });
    } catch {
      setNavErr('Could not get route. Check your connection.');
    } finally {
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
    if (routeLayerRef.current) { routeLayerRef.current.remove(); routeLayerRef.current = null; }
  }

  // Refresh route as user moves (only when navigating)
  useEffect(() => {
    if (!navTarget || !userPosRef.current || navLoading) return;
    fetchRoute(navTarget, userPosRef.current);
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
      viewBtn.onclick = isCurrentPin ? onClose : () => navigate(`/${pin.pinCode}`);
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
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(val.trim())}&format=json&limit=5&addressdetails=1`,
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
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`,
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
          <div className="map-modal-title">
            <img src="/topbar-logo.png" alt="" style={{ width: 20, height: 20, objectFit: 'contain' }} />
            Live Map View
          </div>

          <form className="map-search-form" onSubmit={handleSearch}>
            <div className="map-search-wrap" ref={searchWrapRef}>
              <svg className="map-search-icon" width="13" height="13" viewBox="0 0 13 13" fill="none">
                <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.3"/>
                <path d="M9 9l2.5 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
              <input
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

          <button
            className="map-locate-btn"
            onClick={handleLocate}
            title={locErr ?? 'Go to my location'}
          >
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
              <circle cx="7.5" cy="7.5" r="3" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M7.5 1v2M7.5 12v2M1 7.5h2M12 7.5h2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
          </button>

          <button className="map-close-btn" onClick={onClose} title="Close map">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <div ref={mapRef} className="map-container" />

        {navTarget && (
          <div className="nav-panel">
            <div className="nav-panel-header">
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

            {navLoading && <div className="nav-panel-status">Getting route…</div>}
            {navErr     && <div className="nav-panel-err">{navErr}</div>}

            {navRoute && navRoute.steps.length > 0 && (
              <details className="nav-steps">
                <summary>Turn-by-turn ({navRoute.steps.length} steps)</summary>
                <ol className="nav-steps-list">
                  {navRoute.steps.map((step, i) => (
                    <li key={i}>
                      <span className="nav-step-dist">{fmtDist(step.distance)}</span>
                      {step.name || step.maneuver?.type || '—'}
                    </li>
                  ))}
                </ol>
              </details>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
