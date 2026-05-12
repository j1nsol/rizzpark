import { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { saveMapPin, deleteMapPin, setPiActivePin, clearPiActivePin } from '../utils/firebase';

const FIREBASE_URL  = 'https://automapping-parking-slot-default-rtdb.asia-southeast1.firebasedatabase.app';
const DEFAULT_CENTER = [10.294756867999133, 123.8805492386066];
const MAP_ZOOM       = 14;

const parkingIcon = L.icon({
  iconUrl:     '/topbar-logo.png',
  iconSize:    [40, 40],
  iconAnchor:  [20, 40],
  popupAnchor: [0, -44],
});

// Minimal color tokens matching AdminApp's C object
const C = {
  surface: '#0d1018', card: '#111520',
  border:  'rgba(255,255,255,0.07)',
  occ:     '#f43f5e', vac: '#10b981', accent: '#38bdf8', warn: '#f59e0b',
  text:    '#e2e8f0', muted: 'rgba(226,232,240,0.38)',
  mono:    "'JetBrains Mono',monospace", sans: "'Syne',sans-serif",
};

function Card({ children, style = {} }) {
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`,
      borderRadius: 14, ...style,
    }}>
      {children}
    </div>
  );
}

export default function AdminMapEditor() {
  const mapRef      = useRef(null);
  const instanceRef = useRef(null);
  const markersRef  = useRef(new Map()); // pinCode → L.Marker
  const addingRef   = useRef(false);

  const [pins,           setPins]           = useState([]);
  const [addMode,        setAddMode]        = useState(false);
  const [pendingLatLng,  setPendingLatLng]  = useState(null);
  const [formPinCode,    setFormPinCode]    = useState('');
  const [formName,       setFormName]       = useState('');
  const [saving,         setSaving]         = useState(false);
  const [msg,            setMsg]            = useState(null);
  const [loading,        setLoading]        = useState(true);
  const [activePinCode,  setActivePinCode]  = useState(null);
  const [assignTarget,   setAssignTarget]   = useState('');
  const [assigning,      setAssigning]      = useState(false);

  // Load existing pins and active Pi assignment from Firebase on mount
  useEffect(() => {
    fetch(`${FIREBASE_URL}/map_pins.json`)
      .then(r => r.json())
      .then(data => {
        if (data && typeof data === 'object') {
          setPins(Object.values(data));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    fetch(`${FIREBASE_URL}/pi_config/active_pin.json`)
      .then(r => r.json())
      .then(data => { if (typeof data === 'string') setActivePinCode(data); })
      .catch(() => {});
  }, []);

  // Init Leaflet map
  useEffect(() => {
    if (instanceRef.current) return;

    const map = L.map(mapRef.current, {
      center: DEFAULT_CENTER,
      zoom:   MAP_ZOOM,
      zoomControl: true,
    });
    instanceRef.current = map;

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/">CARTO</a>',
      maxZoom: 19,
    }).addTo(map);

    map.on('click', (e) => {
      if (!addingRef.current) return;
      setPendingLatLng(e.latlng);
      addingRef.current = false;
      setAddMode(false);
    });

    return () => {
      map.remove();
      instanceRef.current = null;
    };
  }, []);

  // Keep cursor in sync with add mode
  useEffect(() => {
    addingRef.current = addMode;
    if (!instanceRef.current) return;
    instanceRef.current.getContainer().style.cursor = addMode ? 'crosshair' : '';
  }, [addMode]);

  // Sync Firebase pins → map markers
  useEffect(() => {
    if (!instanceRef.current) return;

    // Remove markers that are no longer in pins list
    const currentCodes = new Set(pins.map(p => p.pinCode));
    markersRef.current.forEach((marker, code) => {
      if (!currentCodes.has(code)) {
        marker.remove();
        markersRef.current.delete(code);
      }
    });

    // Add markers for new pins
    pins.forEach(pin => {
      if (markersRef.current.has(pin.pinCode)) return;

      const wrap  = document.createElement('div');
      wrap.style.cssText = 'display:flex;flex-direction:column;gap:6px;min-width:160px';

      const title = document.createElement('div');
      title.style.cssText = 'font-family:sans-serif;font-size:13px;font-weight:700';
      title.textContent = pin.name;

      const code = document.createElement('div');
      code.style.cssText = 'font-family:monospace;font-size:11px;color:#64748b';
      code.textContent = `📍 ${pin.pinCode}`;

      const coords = document.createElement('div');
      coords.style.cssText = 'font-family:monospace;font-size:10px;color:#94a3b8';
      coords.textContent = `${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)}`;

      const delBtn = document.createElement('button');
      delBtn.textContent = 'Delete Pin';
      delBtn.style.cssText = 'margin-top:4px;padding:4px 10px;border-radius:6px;border:1px solid #f43f5e44;background:#f43f5e15;color:#f43f5e;font-family:monospace;font-size:11px;cursor:pointer';
      delBtn.onclick = () => handleDeletePin(pin.pinCode);

      wrap.appendChild(title);
      wrap.appendChild(code);
      wrap.appendChild(coords);
      wrap.appendChild(delBtn);

      const marker = L.marker([pin.lat, pin.lng], { icon: parkingIcon })
        .addTo(instanceRef.current)
        .bindPopup(wrap);

      markersRef.current.set(pin.pinCode, marker);
    });
  }, [pins]);

  function showMsg(text, ok = true) {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 5000);
  }

  async function handleAssignPi() {
    if (!assignTarget) return;
    setAssigning(true);
    try {
      await setPiActivePin(assignTarget);
      setActivePinCode(assignTarget);
      showMsg(`Pi assigned to ${assignTarget}.`);
    } catch (e) {
      showMsg(`Assign failed: ${e.message}`, false);
    } finally {
      setAssigning(false);
    }
  }

  async function handleClearAssignment() {
    setAssigning(true);
    try {
      await clearPiActivePin();
      setActivePinCode(null);
      setAssignTarget('');
      showMsg('Manual override cleared — Pi will use its local PIN_CODE.');
    } catch (e) {
      showMsg(`Clear failed: ${e.message}`, false);
    } finally {
      setAssigning(false);
    }
  }

  async function handleSavePin() {
    const code = formPinCode.trim();
    const name = formName.trim();
    if (!code || !name || !pendingLatLng) return;

    if (pins.some(p => p.pinCode === code)) {
      showMsg(`Pin code "${code}" already exists.`, false);
      return;
    }

    setSaving(true);
    try {
      await saveMapPin(code, name, pendingLatLng.lat, pendingLatLng.lng);
      setPins(prev => [...prev, {
        pinCode:   code,
        name,
        lat:       pendingLatLng.lat,
        lng:       pendingLatLng.lng,
        createdAt: Date.now(),
      }]);
      showMsg(`Pin "${name}" (${code}) saved.`);
      setPendingLatLng(null);
      setFormPinCode('');
      setFormName('');
    } catch (e) {
      showMsg(`Save failed: ${e.message}`, false);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeletePin(pinCode) {
    try {
      await deleteMapPin(pinCode);
      setPins(prev => prev.filter(p => p.pinCode !== pinCode));
      showMsg(`Pin "${pinCode}" deleted.`);
    } catch (e) {
      showMsg(`Delete failed: ${e.message}`, false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {msg && (
        <div style={{
          padding: '10px 14px', borderRadius: 10,
          background: msg.ok ? `${C.vac}12` : `${C.occ}12`,
          border: `1px solid ${msg.ok ? C.vac + '33' : C.occ + '33'}`,
          fontFamily: C.mono, fontSize: 11, color: msg.ok ? C.vac : C.occ,
        }}>
          {msg.ok ? '✅' : '⚠️'} {msg.text}
        </div>
      )}

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px', borderBottom: `1px solid ${C.border}`,
          flexWrap: 'wrap', gap: 8,
        }}>
          <span style={{ fontFamily: C.sans, fontWeight: 700, fontSize: 14 }}>
            Geo Pin Map
          </span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {addMode && (
              <span style={{ fontFamily: C.mono, fontSize: 11, color: C.warn }}>
                Click the map to place a pin
              </span>
            )}
            <button
              onClick={() => { setAddMode(v => !v); setPendingLatLng(null); }}
              style={{
                padding: '6px 14px', borderRadius: 8, border: `1px solid ${addMode ? C.warn + '66' : C.accent + '44'}`,
                background: addMode ? `${C.warn}18` : `${C.accent}12`,
                color: addMode ? C.warn : C.accent,
                fontFamily: C.mono, fontSize: 11, fontWeight: 700, cursor: 'pointer',
              }}
            >
              {addMode ? '✕ Cancel' : '📍 Add Pin'}
            </button>
          </div>
        </div>

        <div ref={mapRef} style={{ height: 420 }} />
      </Card>

      {pendingLatLng && (
        <Card style={{ padding: 16 }}>
          <div style={{ fontFamily: C.sans, fontWeight: 700, fontSize: 13, marginBottom: 12 }}>
            New Pin at {pendingLatLng.lat.toFixed(5)}, {pendingLatLng.lng.toFixed(5)}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input
              placeholder="Pin code (e.g. CITU-A)"
              value={formPinCode}
              onChange={e => setFormPinCode(e.target.value.replace(/[.#$[\]/\s]/g, '').toUpperCase())}
              maxLength={20}
              style={{
                background: '#0f172a', border: `1px solid ${C.border}`, color: C.text,
                borderRadius: 8, padding: '8px 12px', fontFamily: C.mono, fontSize: 12,
                outline: 'none',
              }}
            />
            <input
              placeholder="Location name (e.g. CIT-U Building A)"
              value={formName}
              onChange={e => setFormName(e.target.value)}
              maxLength={60}
              style={{
                background: '#0f172a', border: `1px solid ${C.border}`, color: C.text,
                borderRadius: 8, padding: '8px 12px', fontFamily: C.mono, fontSize: 12,
                outline: 'none',
              }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={handleSavePin}
                disabled={saving || !formPinCode.trim() || !formName.trim()}
                style={{
                  flex: 1, padding: '8px', borderRadius: 8,
                  border: `1px solid ${C.vac}44`, background: `${C.vac}18`, color: C.vac,
                  fontFamily: C.mono, fontSize: 12, fontWeight: 700,
                  cursor: saving || !formPinCode.trim() || !formName.trim() ? 'not-allowed' : 'pointer',
                  opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? 'Saving…' : '✓ Save Pin'}
              </button>
              <button
                onClick={() => { setPendingLatLng(null); setFormPinCode(''); setFormName(''); }}
                style={{
                  padding: '8px 16px', borderRadius: 8,
                  border: `1px solid ${C.border}`, background: 'transparent', color: C.muted,
                  fontFamily: C.mono, fontSize: 12, cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </Card>
      )}

      <Card style={{ padding: 16 }}>
        <div style={{ fontFamily: C.sans, fontWeight: 700, fontSize: 13, marginBottom: 12 }}>
          Pi Assignment
          <span style={{ fontFamily: C.mono, fontSize: 10, color: C.muted, marginLeft: 8 }}>
            — which pin code the Raspberry Pi is automapping to
          </span>
        </div>

        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 12,
          padding: '4px 10px', borderRadius: 6,
          background: activePinCode ? `${C.vac}15` : `${C.accent}10`,
          border: `1px solid ${activePinCode ? C.vac + '44' : C.border}`,
        }}>
          <span style={{
            width: 7, height: 7, borderRadius: '50%',
            background: activePinCode ? C.vac : C.muted,
            display: 'inline-block',
          }} />
          <span style={{ fontFamily: C.mono, fontSize: 11, color: activePinCode ? C.vac : C.muted }}>
            {activePinCode ? `Manual Override → ${activePinCode}` : 'Auto — Pi using its local PIN_CODE'}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            value={assignTarget}
            onChange={e => setAssignTarget(e.target.value)}
            style={{
              background: '#0f172a', border: `1px solid ${C.border}`, color: C.text,
              borderRadius: 8, padding: '7px 10px', fontFamily: C.mono, fontSize: 12, flex: 1,
            }}
          >
            <option value="">— Select pin code —</option>
            {pins.map(p => (
              <option key={p.pinCode} value={p.pinCode}>
                {p.pinCode} — {p.name}{p.pinCode === activePinCode ? ' ✓' : ''}
              </option>
            ))}
          </select>
          <button
            onClick={handleAssignPi}
            disabled={assigning || !assignTarget || assignTarget === activePinCode}
            style={{
              padding: '7px 16px', borderRadius: 8,
              border: `1px solid ${C.accent}44`, background: `${C.accent}12`, color: C.accent,
              fontFamily: C.mono, fontSize: 12, fontWeight: 700,
              cursor: assigning || !assignTarget || assignTarget === activePinCode ? 'not-allowed' : 'pointer',
              opacity: assigning ? 0.6 : 1,
            }}
          >
            {assigning ? '…' : 'Assign Pi'}
          </button>
          {activePinCode && (
            <button
              onClick={handleClearAssignment}
              disabled={assigning}
              style={{
                padding: '7px 14px', borderRadius: 8,
                border: `1px solid ${C.occ}44`, background: `${C.occ}10`, color: C.occ,
                fontFamily: C.mono, fontSize: 12, cursor: assigning ? 'not-allowed' : 'pointer',
              }}
            >
              Clear Override
            </button>
          )}
        </div>
      </Card>

      <Card style={{ padding: 16 }}>
        <div style={{ fontFamily: C.sans, fontWeight: 700, fontSize: 13, marginBottom: 12 }}>
          Saved Pins {loading ? '…' : `(${pins.length})`}
        </div>
        {pins.length === 0 ? (
          <div style={{ fontFamily: C.mono, fontSize: 11, color: C.muted, textAlign: 'center', padding: '20px 0' }}>
            No pins saved yet. Click "📍 Add Pin" to place one on the map.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: C.mono, fontSize: 11 }}>
              <thead>
                <tr style={{ color: C.muted, borderBottom: `1px solid ${C.border}` }}>
                  {['Pin Code', 'Name', 'Latitude', 'Longitude', ''].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '6px 10px', fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pins.map(pin => (
                  <tr key={pin.pinCode} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: '8px 10px', color: pin.pinCode === activePinCode ? C.vac : C.accent, fontWeight: 700 }}>
                      {pin.pinCode}{pin.pinCode === activePinCode ? ' ●' : ''}
                    </td>
                    <td style={{ padding: '8px 10px', color: C.text }}>{pin.name}</td>
                    <td style={{ padding: '8px 10px', color: C.muted }}>{pin.lat.toFixed(6)}</td>
                    <td style={{ padding: '8px 10px', color: C.muted }}>{pin.lng.toFixed(6)}</td>
                    <td style={{ padding: '8px 10px' }}>
                      <button
                        onClick={() => handleDeletePin(pin.pinCode)}
                        style={{
                          padding: '3px 10px', borderRadius: 6,
                          border: `1px solid ${C.occ}44`, background: `${C.occ}12`, color: C.occ,
                          fontFamily: C.mono, fontSize: 10, cursor: 'pointer',
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
