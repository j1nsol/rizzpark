import { useState, useEffect, useRef, useCallback } from "react";
import { normalizeAdminSlotsObject } from "../utils/slotModel";
import { deleteSlot, savePinSlotLayout } from "../utils/firebase";
import AdminMapEditor from "../components/AdminMapEditor";
import ParkingCardGrid from "../components/ParkingCardGrid";
import { getApiUrl, getMode, setMode, getFirebaseParkingPath, getFirebasePath, setFirebasePath } from "../config/modeConfig";

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG — update these two values for your setup
// NOTE #9: Move RTSP credentials to a server-side .env — never expose in frontend.
// ─────────────────────────────────────────────────────────────────────────────
let PI_API_URL = getApiUrl(); // mutable — updated by switchMode() on mode changes
const FIREBASE_URL = "https://automapping-parking-slot-default-rtdb.asia-southeast1.firebasedatabase.app";
// Camera resolution — must match your RTSP camera output
const CAM_W = 2560;
const CAM_H = 1440;
const STREAM_FPS_DISPLAY = 15; // must match STREAM_FPS in flask_api.py
// ─────────────────────────────────────────────────────────────────────────────

const GLOBAL_STYLES = `
  *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
  body { background:#F5F4F1; font-family:'DM Sans',sans-serif; color:#111; }
  ::-webkit-scrollbar{width:6px;height:6px}
  ::-webkit-scrollbar-track{background:transparent}
  ::-webkit-scrollbar-thumb{background:rgba(0,0,0,.15);border-radius:3px}
  @keyframes fadeUp  {from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
  @keyframes slideIn {from{opacity:0;transform:translateX(18px)}to{opacity:1;transform:none}}
  @keyframes blink   {0%,100%{opacity:1}50%{opacity:0}}
  @keyframes pulse   {0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(34,160,107,.4)}50%{opacity:.7;box-shadow:0 0 0 7px rgba(34,160,107,0)}}
  @keyframes scanline{0%{top:-10%}100%{top:110%}}
  @keyframes shake   {0%,100%{transform:translateX(0)}25%{transform:translateX(-4px)}75%{transform:translateX(4px)}}
  @keyframes spin    {to{transform:rotate(360deg)}}
  @keyframes dropzone{0%,100%{border-color:rgba(245,166,35,.3)}50%{border-color:rgba(245,166,35,.8)}}
`;

const C = {
  bg:"#F5F4F1", surface:"#FFFFFF", card:"#FFFFFF",
  border:"#E4E1DA",
  occ:"#D93A3A", vac:"#22A06B", accent:"#F5A623", warn:"#f59e0b", purple:"#7c3aed",
  text:"#111111", muted:"#888888",
  mono:"'DM Sans',sans-serif", sans:"'DM Sans',sans-serif",
};

const pct   = (a,b) => b ? Math.round((a/b)*100) : 0;
const fmtTs = () => new Date().toLocaleTimeString("en-PH",{hour12:false});

// ── Fix #6: scaleCoords handles BOTH quad [[x,y]×4] and legacy rect [x1,y1,x2,y2] ──
// Returns [svgX1, svgY1, svgX2, svgY2] bounding box in SVG space.
const SVG_W = 720, SVG_H = 405; // 16:9 to match camera (2560×1440)

const isQuad = (coords) =>
  Array.isArray(coords) && coords.length === 4 && Array.isArray(coords[0]);

// Returns SVG-space bounding box [x1,y1,x2,y2] for any coord format
const scaleCoords = (coords) => {
  if (!coords || coords.length < 4) return [0,0,80,60];
  if (isQuad(coords)) {
    const xs = coords.map(p => Math.round((p[0] / CAM_W) * SVG_W));
    const ys = coords.map(p => Math.round((p[1] / CAM_H) * SVG_H));
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  }
  const [x1,y1,x2,y2] = coords;
  return [
    Math.round((x1 / CAM_W) * SVG_W),
    Math.round((y1 / CAM_H) * SVG_H),
    Math.round((x2 / CAM_W) * SVG_W),
    Math.round((y2 / CAM_H) * SVG_H),
  ];
};

// Returns SVG-space polygon points string for quad coords (for <polygon> element)
const scaleQuadToSVGPoints = (coords) => {
  if (!isQuad(coords)) return null;
  return coords
    .map(p => `${Math.round((p[0]/CAM_W)*SVG_W)},${Math.round((p[1]/CAM_H)*SVG_H)}`)
    .join(" ");
};

// ── Primitives ────────────────────────────────────────────────────────────────
function LiveDot({color=C.vac,size=8}){
  return <span style={{display:"inline-block",width:size,height:size,borderRadius:"50%",background:color,flexShrink:0,animation:"pulse 2s infinite"}}/>;
}
function Badge({label,color}){
  return <span style={{padding:"2px 8px",borderRadius:4,fontSize:10,fontWeight:700,fontFamily:C.mono,letterSpacing:"0.06em",textTransform:"uppercase",background:`${color}22`,color,border:`1px solid ${color}44`}}>{label}</span>;
}
function Card({children,style={}}){
  return <div style={{background:C.card,border:`1.5px solid ${C.border}`,borderRadius:12,boxShadow:"0 1px 3px rgba(0,0,0,.06)",...style}}>{children}</div>;
}
function StatPill({label,value,color,sub}){
  return(
    <div style={{flex:1,minWidth:110,padding:"14px 16px",background:C.card,border:`1.5px solid ${C.border}`,borderRadius:10,position:"relative",overflow:"hidden",boxShadow:"0 1px 3px rgba(0,0,0,.06)"}}>
      <div style={{position:"absolute",inset:0,opacity:.06,background:`radial-gradient(circle at 80% 20%,${color},transparent 70%)`}}/>
      <div style={{fontSize:28,fontWeight:700,fontFamily:C.sans,color,lineHeight:1}}>{value}</div>
      <div style={{fontSize:11,fontFamily:C.mono,color:C.muted,marginTop:5,textTransform:"uppercase",letterSpacing:"0.06em"}}>{label}</div>
      {sub&&<div style={{fontSize:10,color,marginTop:2,fontFamily:C.mono}}>{sub}</div>}
    </div>
  );
}

// ── Connection status banner ──────────────────────────────────────────────────
function ConnectionBanner({piStatus,firebaseStatus}){
  const bothOk   = piStatus==="online" && firebaseStatus==="online";
  const anyError = piStatus==="error"  || firebaseStatus==="error";
  const color = bothOk ? C.vac : anyError ? C.occ : C.warn;
  const msg   = bothOk
    ? "All systems online — live data active"
    : piStatus==="checking"||firebaseStatus==="checking"
    ? "Connecting to systems..."
    : piStatus==="error"
    ? `Raspberry Pi unreachable (${PI_API_URL}) — showing last known data`
    : "Firebase disconnected — data may be stale";

  return(
    <div style={{padding:"10px 16px",borderRadius:10,background:`${color}12`,border:`1px solid ${color}33`,fontFamily:C.mono,fontSize:11,color,display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
      <LiveDot color={color} size={6}/>
      <span>{msg}</span>
      <div style={{marginLeft:"auto",display:"flex",gap:10}}>
        <span style={{color:piStatus==="online"?C.vac:piStatus==="error"?C.occ:C.warn}}>Pi: {piStatus}</span>
        <span style={{color:firebaseStatus==="online"?C.vac:firebaseStatus==="error"?C.occ:C.warn}}>Firebase: {firebaseStatus}</span>
      </div>
    </div>
  );
}

// ── Pi Selector ───────────────────────────────────────────────────────────────
function PiSelector({ piRegistry, selectedPiCode, onSelect }) {
  const now = Date.now();
  const pis = Object.values(piRegistry);
  if (!pis.length) return null;

  return (
    <div style={{
      display:"flex", alignItems:"center", gap:8, flexWrap:"wrap",
      padding:"10px 14px", background:C.surface,
      border:`1px solid ${C.border}`, borderRadius:12,
    }}>
      <span style={{fontFamily:C.mono,fontSize:10,color:C.muted,whiteSpace:"nowrap",flexShrink:0}}>
        Pi:
      </span>
      {pis.map(pi => {
        const online = (now - pi.lastSeen) < 30000;
        const sel    = pi.pinCode === selectedPiCode;
        return (
          <button key={pi.pinCode} onClick={() => onSelect(sel ? null : pi.pinCode)}
            style={{
              display:"flex", alignItems:"center", gap:5, padding:"4px 10px", borderRadius:8,
              border:`1px solid ${sel ? C.accent+"66" : online ? C.vac+"33" : C.border}`,
              background: sel ? `${C.accent}18` : online ? `${C.vac}08` : "transparent",
              color: sel ? C.accent : online ? C.text : C.muted,
              fontFamily:C.mono, fontSize:11, fontWeight: sel ? 700 : 400,
              cursor:"pointer", transition:"all .15s",
            }}>
            <span style={{
              width:6, height:6, borderRadius:"50%", flexShrink:0,
              background: online ? C.vac : "rgba(0,0,0,.1)",
              boxShadow: online ? `0 0 5px ${C.vac}88` : "none",
            }}/>
            {pi.pinCode}
            {pi.ztIp && (
              <span style={{color: sel ? C.accent+"99" : C.muted, fontSize:9}}>
                · {pi.ztIp}
              </span>
            )}
          </button>
        );
      })}
      <span style={{fontFamily:C.mono,fontSize:9,color:C.muted,marginLeft:2}}>
        {selectedPiCode && piRegistry[selectedPiCode]
          ? `→ ${piRegistry[selectedPiCode].apiUrl}`
          : `no Pi selected — using ${PI_API_URL}`}
      </span>
    </div>
  );
}

// ── Parking Map SVG ───────────────────────────────────────────────────────────
// Fix #6: renders quads as <polygon> and rects as <rect> correctly
function ParkingMap({slots,selectedSlot,onSelect,adminMode,onRemove}){
  if(!Object.keys(slots).length){
    return(
      <div style={{textAlign:"center",padding:"40px 20px",color:C.muted,fontFamily:C.mono,fontSize:12}}>
        <div style={{fontSize:36,marginBottom:12}}>🅿️</div>
        <div>No slot data yet.</div>
        <div style={{marginTop:6,fontSize:11,opacity:.7}}>Waiting for live feed or image analysis...</div>
      </div>
    );
  }
  return(
    <div style={{width:"100%",overflowX:"auto"}}>
      <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} style={{width:"100%",minWidth:320,display:"block"}}>
        <rect width={SVG_W} height={SVG_H} rx="14" fill="#EDEBE4"/>
        <defs>
          <pattern id="g" width="30" height="30" patternUnits="userSpaceOnUse">
            <path d="M30 0L0 0 0 30" fill="none" stroke="rgba(0,0,0,.07)" strokeWidth=".5"/>
          </pattern>
          <filter id="glow"><feGaussianBlur stdDeviation="2.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        </defs>
        <rect width={SVG_W} height={SVG_H} fill="url(#g)" rx="14"/>

        {Object.entries(slots).map(([id,slot])=>{
          const coords = slot.coords;
          const occ = slot.status==="Occupied";
          const res = slot.status==="Reserved";
          const sel = selectedSlot===id;
          const stroke = occ?C.occ:(res?"#f97316":C.vac);
          const quadPoints = scaleQuadToSVGPoints(coords);
          const [x1,y1,x2,y2] = scaleCoords(coords);
          const w   = Math.max(x2-x1, 20);
          const h   = Math.max(y2-y1, 15);
          const cx  = x1 + w/2;
          const cy  = y1 + h/2;

          return(
            <g key={id} onClick={()=>onSelect(sel?null:id)} style={{cursor:"pointer"}}>
              {quadPoints ? (
                <polygon points={quadPoints}
                  fill={sel?(occ?`${C.occ}50`:(res?"#f9731640":`${C.vac}45`)):(occ?`${C.occ}28`:(res?"#f9731620":`${C.vac}20`))}
                  stroke={stroke} strokeWidth={sel?2.5:1.5}
                  style={{transition:"all .3s"}}
                  filter={sel?"url(#glow)":undefined}/>
              ) : (
                <rect x={x1} y={y1} width={w} height={h} rx="5"
                  fill={sel?(occ?`${C.occ}50`:(res?"#f9731640":`${C.vac}45`)):(occ?`${C.occ}28`:(res?"#f9731620":`${C.vac}20`))}
                  stroke={stroke} strokeWidth={sel?2.5:1.5} style={{transition:"all .3s"}}
                  filter={sel?"url(#glow)":undefined}/>
              )}
              {occ&&<text x={cx} y={cy+2} textAnchor="middle" fontSize="12" style={{userSelect:"none"}}>🚗</text>}
              {res&&<text x={cx} y={cy+2} textAnchor="middle" fontSize="12" style={{userSelect:"none"}}>🔒</text>}
              {!occ&&!res&&<circle cx={cx} cy={cy-4} r="5" fill={C.vac} opacity=".35"/>}
              <text x={cx} y={y2-4} textAnchor="middle" fill={occ?"#D93A3A":(res?"#f97316":"#22A06B")} fontSize="8" fontFamily={C.mono} fontWeight="700">{id}</text>
              <rect x={x1+2} y={y2-4} width={w-4} height={2} rx="1" fill="rgba(0,0,0,.1)"/>
              <rect x={x1+2} y={y2-4} width={(w-4)*(slot.confidence||.8)} height={2} rx="1" fill={occ?C.occ:C.vac} opacity=".65"/>
              {adminMode&&sel&&(
                <g onClick={e=>{e.stopPropagation();onRemove(id);}}>
                  <rect x={x2-18} y={y1+2} width={16} height={16} rx="3" fill="#ef444488" stroke="#ef4444" strokeWidth="1"/>
                  <text x={x2-10} y={y1+13} textAnchor="middle" fill="#fff" fontSize="10" fontWeight="700">✕</text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── Live Feed Panel ───────────────────────────────────────────────────────────
function LiveFeedPanel({piStatus, mode, videoSource, setVideoSource, playState, setPlayState, progress, setProgress}){
  const [active,      setActive]      = useState(true);
  const [loaded,      setLoaded]      = useState(false);
  const [error,       setError]       = useState(false);
  const [fps,         setFps]         = useState(0);
  const [videoFile,   setVideoFile]   = useState(null);
  const [vidLoading,  setVidLoading]  = useState(false);
  const [vidError,    setVidError]    = useState(null);
  const imgRef                        = useRef(null);
  const lastTime                      = useRef(Date.now());
  const piOffline                     = piStatus === "error";
  const streamUrl                     = `${PI_API_URL}/stream`;

  // Poll /video/status while video is playing
  useEffect(() => {
    if (playState !== "playing") return;
    const iv = setInterval(async () => {
      try {
        const r = await fetch(`${PI_API_URL}/video/status`);
        const d = await r.json();
        setProgress(d);
        if (d.state === "stopped") setPlayState("stopped");
      } catch { /* silent — non-critical */ }
    }, 2000);
    return () => clearInterval(iv);
  }, [playState]);

  const videoCall = async (endpoint, body = null) => {
    const r = await fetch(`${PI_API_URL}${endpoint}`, { method: "POST", ...(body ? { body } : {}) });
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      throw new Error(data.error || `HTTP ${r.status}`);
    }
    return r.json().catch(() => null);
  };

  const handleVideoLoad = async () => {
    if (!videoFile) return;
    setVidLoading(true);
    setVidError(null);
    const fd = new FormData();
    fd.append("video", videoFile);
    try {
      await videoCall("/video/load", fd);
      setPlayState("stopped");
      setProgress(null);
    } catch (e) {
      setVidError(e.message);
    } finally {
      setVidLoading(false);
    }
  };

  const onFrameLoad = () => {
    const now     = Date.now();
    const elapsed = (now - lastTime.current) / 1000;
    if(elapsed > 0) setFps(Math.round(1 / elapsed));
    lastTime.current = now;
    setLoaded(true);
    setError(false);
  };

  const onError = () => {
    setError(true);
    setLoaded(false);
  };

  useEffect(()=>{
    const img = imgRef.current;
    if(!img) return;
    if(active && !piOffline){
      img.src = streamUrl;
    } else {
      img.src = "";
      setLoaded(false);
    }
    return ()=>{ if(img) img.src = ""; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, piOffline]);

  return(
    <div style={{display:"flex",flexDirection:"column",gap:16}}>

      {/* ── Source selector ─────────────────────────────────────────── */}
      <div style={{display:"flex",gap:6}}>
        {[["camera","📹 Camera"],["video","🎬 Video File"]].map(([src,label])=>(
          <button key={src} onClick={()=>setVideoSource(src)}
            style={{padding:"5px 14px",borderRadius:8,
              border:`1px solid ${videoSource===src?C.accent+"55":"rgba(0,0,0,.08)"}`,
              background:videoSource===src?`${C.accent}15`:"transparent",
              color:videoSource===src?C.accent:C.muted,
              fontFamily:C.mono,fontSize:10,fontWeight:700,cursor:"pointer",transition:"all .15s"}}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Video file controls ──────────────────────────────────────── */}
      {videoSource==="video" && (
        <div style={{display:"flex",flexDirection:"column",gap:10,padding:"12px 14px",
          borderRadius:10,background:"rgba(245,166,35,.07)",border:`1px solid rgba(245,166,35,.25)`}}>
          {/* File picker */}
          <label style={{cursor:"pointer",fontFamily:C.mono,fontSize:11,color:C.muted,
            padding:"8px 12px",borderRadius:8,border:`1px dashed rgba(245,166,35,.4)`,
            background:"rgba(245,166,35,.05)",textAlign:"center"}}>
            {videoFile ? videoFile.name : "📂 Click to select video (.mp4 .avi .mov)"}
            <input type="file" accept="video/*" style={{display:"none"}}
              onChange={e => { setVideoFile(e.target.files[0]); setPlayState("stopped"); setProgress(null); }}/>
          </label>
          {/* Error banner */}
          {vidError && (
            <div style={{padding:"8px 12px",borderRadius:8,background:`${C.occ}15`,
              border:`1px solid ${C.occ}44`,fontFamily:C.mono,fontSize:10,color:C.occ}}>
              ⚠ {vidError}
            </div>
          )}
          {/* Controls */}
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            <button onClick={handleVideoLoad} disabled={!videoFile||piOffline||vidLoading}
              style={{padding:"6px 14px",borderRadius:8,
                border:`1px solid ${C.accent}55`,background:`${C.accent}15`,color:C.accent,
                fontFamily:C.mono,fontSize:10,fontWeight:700,
                cursor:(!videoFile||piOffline||vidLoading)?"not-allowed":"pointer"}}>
              {vidLoading ? "Uploading…" : "⬆ Load"}
            </button>
            {playState!=="playing"
              ? <button onClick={async()=>{await videoCall("/video/start");setPlayState("playing");}}
                  disabled={piOffline}
                  style={{padding:"6px 14px",borderRadius:8,
                    border:`1px solid ${C.vac}55`,background:`${C.vac}15`,color:C.vac,
                    fontFamily:C.mono,fontSize:10,fontWeight:700,cursor:piOffline?"not-allowed":"pointer"}}>
                  ▶ {playState==="paused"?"Resume":"Start"}
                </button>
              : <button onClick={async()=>{await videoCall("/video/pause");setPlayState("paused");}}
                  style={{padding:"6px 14px",borderRadius:8,
                    border:`1px solid ${C.warn}55`,background:`${C.warn}15`,color:C.warn,
                    fontFamily:C.mono,fontSize:10,fontWeight:700,cursor:"pointer"}}>
                  ⏸ Pause
                </button>
            }
            <button onClick={async()=>{await videoCall("/video/stop");setPlayState("stopped");setProgress(null);}}
              disabled={playState==="stopped"}
              style={{padding:"6px 14px",borderRadius:8,
                border:`1px solid ${C.occ}55`,background:`${C.occ}15`,color:C.occ,
                fontFamily:C.mono,fontSize:10,fontWeight:700,
                cursor:playState==="stopped"?"not-allowed":"pointer"}}>
              ⏹ Stop
            </button>
          </div>
          {/* Progress bar */}
          {progress && progress.total > 0 && (
            <div style={{fontFamily:C.mono,fontSize:10,color:C.muted}}>
              <div style={{marginBottom:4}}>
                Frame {progress.frame} / {progress.total} · {Math.round(progress.frame/progress.total*100)}% · {progress.fps} FPS
              </div>
              <div style={{height:3,borderRadius:2,background:"rgba(0,0,0,.06)"}}>
                <div style={{height:"100%",borderRadius:2,background:C.vac,
                  width:`${Math.round(progress.frame/progress.total*100)}%`,transition:"width .5s"}}/>
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:10}}>
        <div style={{padding:"10px 16px",background:`linear-gradient(135deg,rgba(245,166,35,.1),rgba(124,58,237,.06))`,border:`1px solid rgba(245,166,35,.3)`,borderRadius:12,display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:20}}>📹</span>
          <div>
            <div style={{fontFamily:C.sans,fontWeight:800,fontSize:14,color:C.accent}}>Live Camera Feed</div>
            <div style={{fontSize:10,fontFamily:C.mono,color:C.muted}}>MJPEG stream · YOLO detections overlaid</div>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          {!piOffline && !error && loaded &&(
            <div style={{display:"flex",alignItems:"center",gap:6,padding:"5px 12px",borderRadius:8,
              background:"rgba(34,160,107,.1)",border:`1px solid ${C.vac}33`,
              fontFamily:C.mono,fontSize:10,color:C.vac}}>
              <LiveDot color={C.vac} size={6}/>
              {active ? `Live · ~${fps} FPS` : "Paused"}
            </div>
          )}
          <button onClick={()=>setActive(a=>!a)} disabled={piOffline}
            style={{padding:"6px 14px",borderRadius:8,
              border:`1px solid ${active?C.occ+"55":C.vac+"55"}`,
              background:active?`${C.occ}15`:`${C.vac}15`,
              color:active?C.occ:C.vac,
              fontFamily:C.mono,fontSize:11,fontWeight:700,
              cursor:piOffline?"not-allowed":"pointer"}}>
            {active ? "⏸ Pause" : "▶ Resume"}
          </button>
        </div>
      </div>

      <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
        {[["#fbbf24","Vehicle (YOLO)"],["#f43f5e","Occupied"],["#f97316","Reserved"],["#10b981","Vacant"]].map(([c,l])=>(
          <div key={l} style={{display:"flex",alignItems:"center",gap:6,fontSize:10,fontFamily:C.mono,color:C.muted}}>
            <span style={{width:28,height:3,background:c,display:"inline-block",borderRadius:2}}/>{l}
          </div>
        ))}
      </div>

      <div style={{position:"relative",borderRadius:14,overflow:"hidden",
        background:"#F0EEE8",border:`1.5px solid ${C.border}`,minHeight:300}}>
        {!loaded && !piOffline && !error && active &&(
          <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",
            alignItems:"center",justifyContent:"center",gap:12}}>
            <div style={{width:32,height:32,border:`3px solid rgba(245,166,35,.25)`,
              borderTopColor:C.accent,borderRadius:"50%",animation:"spin .8s linear infinite"}}/>
            <div style={{fontFamily:C.mono,fontSize:11,color:C.muted}}>Connecting to stream...</div>
          </div>
        )}
        {piOffline &&(
          <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",
            alignItems:"center",justifyContent:"center",gap:10,padding:20}}>
            <div style={{fontSize:40}}>📷</div>
            <div style={{fontFamily:C.sans,fontWeight:700,fontSize:16,color:C.occ}}>Camera Offline</div>
            <div style={{fontFamily:C.mono,fontSize:11,color:C.muted,textAlign:"center",lineHeight:1.7}}>
              Pi unreachable at {PI_API_URL}<br/>
              Make sure <span style={{color:C.accent}}>flask_api.py</span> is running
            </div>
          </div>
        )}
        {error && !piOffline &&(
          <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",
            alignItems:"center",justifyContent:"center",gap:8}}>
            <div style={{fontSize:32}}>⚠️</div>
            <div style={{fontFamily:C.mono,fontSize:11,color:C.warn,textAlign:"center"}}>
              Stream unavailable — check Pi connection
            </div>
            <button onClick={()=>{ setError(false); setActive(true); }}
              style={{marginTop:8,padding:"6px 16px",borderRadius:8,border:`1px solid ${C.accent}44`,
                background:`${C.accent}15`,color:C.accent,fontFamily:C.mono,fontSize:11,cursor:"pointer"}}>
              🔄 Retry
            </button>
          </div>
        )}
        <img
          ref={imgRef}
          alt="MJPEG live stream"
          onLoad={onFrameLoad}
          onError={onError}
          style={{width:"100%",display:"block",borderRadius:14,
            opacity: loaded && active ? 1 : 0,
            transition:"opacity .3s"}}
        />
        {loaded && active &&(
          <div style={{position:"absolute",bottom:10,right:12,
            background:"rgba(255,255,255,.95)",border:`1px solid ${C.border}`,
            borderRadius:6,padding:"4px 10px",
            fontFamily:C.mono,fontSize:9,color:C.muted}}>
            {fmtTs()} · LIVE MJPEG
          </div>
        )}
      </div>

      <div style={{padding:"10px 14px",borderRadius:10,
        background:"rgba(245,166,35,.07)",border:`1px solid rgba(245,166,35,.2)`,
        fontFamily:C.mono,fontSize:10,color:C.muted,lineHeight:1.7}}>
        ℹ️ Stream runs at ~{STREAM_FPS_DISPLAY} FPS. YOLO detections update every 1s — boxes stay visible between inferences. Pause to reduce Pi CPU load.
      </div>
    </div>
  );
}

// ── AI Terminal ───────────────────────────────────────────────────────────────
function AITerminal({logs}){
  const ref=useRef(null);
  useEffect(()=>{ref.current?.scrollIntoView({behavior:"smooth"});},[logs]);
  return(
    <div style={{background:"#F0EEE8",border:`1.5px solid ${C.border}`,borderRadius:12,padding:"14px 16px",height:260,overflowY:"auto",fontFamily:C.mono,fontSize:11,position:"relative"}}>
      <div style={{position:"absolute",left:0,right:0,height:"2px",background:"linear-gradient(90deg,transparent,rgba(245,166,35,.2),transparent)",animation:"scanline 4s linear infinite",pointerEvents:"none"}}/>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10,paddingBottom:8,borderBottom:`1px solid rgba(0,0,0,.05)`}}>
        <LiveDot color={C.accent}/>
        <span style={{color:C.accent,fontWeight:700,letterSpacing:"0.1em",fontSize:10}}>AI PROCESSING FEED</span>
        <span style={{marginLeft:"auto",color:C.muted,fontSize:10}}>{logs.length} events</span>
      </div>
      {logs.length===0&&<div style={{color:C.muted,fontSize:11,textAlign:"center",marginTop:40}}>Waiting for system connection...</div>}
      {logs.map((l,i)=>(
        <div key={l.id} style={{padding:"2px 0",color:l.type==="error"?C.occ:l.type==="sync"?C.vac:l.type==="sys"?C.warn:l.type==="img"?C.purple:"rgba(148,163,184,.85)",animation:i===logs.length-1?"fadeUp .25s ease":"none",display:"flex",gap:10}}>
          <span style={{color:"rgba(0,0,0,.35)",flexShrink:0}}>{l.time}</span>
          <span>{l.msg}</span>
        </div>
      ))}
      <div ref={ref}/>
    </div>
  );
}

// ── Confirm Dialog ────────────────────────────────────────────────────────────
function ConfirmDialog({slotId,onConfirm,onCancel}){
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.75)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:999,backdropFilter:"blur(6px)"}}>
      <div style={{background:C.card,border:`1px solid ${C.occ}44`,borderRadius:20,padding:32,maxWidth:360,width:"90%",animation:"fadeUp .2s ease"}}>
        <div style={{fontSize:32,marginBottom:12,textAlign:"center"}}>⚠️</div>
        <div style={{fontFamily:C.sans,fontWeight:700,fontSize:18,textAlign:"center",marginBottom:8}}>Remove Slot {slotId}?</div>
        <div style={{color:C.muted,fontSize:13,textAlign:"center",marginBottom:24,lineHeight:1.6}}>
          This removes <strong style={{color:C.text}}>{slotId}</strong> from the map. Re-run auto-mapping to restore.
        </div>
        <div style={{display:"flex",gap:12}}>
          <button onClick={onCancel} style={{flex:1,padding:"12px",borderRadius:10,fontFamily:C.sans,fontWeight:600,fontSize:14,cursor:"pointer",background:"rgba(0,0,0,.05)",border:`1px solid ${C.border}`,color:C.text}}>Cancel</button>
          <button onClick={onConfirm} style={{flex:1,padding:"12px",borderRadius:10,fontFamily:C.sans,fontWeight:700,fontSize:14,cursor:"pointer",background:C.occ,border:"none",color:"#fff",animation:"shake .4s ease"}}>Remove</button>
        </div>
      </div>
    </div>
  );
}

// ── Slot Detail ───────────────────────────────────────────────────────────────
function SlotDetail({slotId,slot,onClose,onRemove,adminMode}){
  if(!slot) return null;
  const occ=slot.status==="Occupied";
  // Fix #6: display coords sensibly for both quad and rect
  const coordsDisplay = isQuad(slot.coords)
    ? `Quad [${slot.coords.map(p=>p.join(",")).join(" | ")}]`
    : `[${(slot.coords||[]).join(",")}]`;
  return(
    <div style={{background:"rgba(0,0,0,.03)",border:`1px solid ${occ?C.occ+"44":C.vac+"44"}`,borderRadius:14,padding:18,marginTop:14,animation:"slideIn .25s ease"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontFamily:C.sans,fontWeight:800,fontSize:20,color:occ?C.occ:C.vac}}>Slot {slotId}</span>
          <Badge label={slot.status} color={occ?C.occ:C.vac}/>
        </div>
        <button onClick={onClose} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:18}}>✕</button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:adminMode?14:0}}>
        {[["Row",`Row ${slot.row||"?"}`],["Confidence",`${Math.round((slot.confidence||.8)*100)}%`],["Detection","YOLOv8n"],["Coords", coordsDisplay]].map(([k,v])=>(
          <div key={k} style={{background:"rgba(0,0,0,.3)",borderRadius:8,padding:"8px 12px"}}>
            <div style={{fontSize:9,color:C.muted,textTransform:"uppercase",letterSpacing:"0.1em",fontFamily:C.mono}}>{k}</div>
            <div style={{fontSize:12,fontWeight:600,marginTop:3,fontFamily:C.mono,color:C.text,wordBreak:"break-all"}}>{v}</div>
          </div>
        ))}
      </div>
      {adminMode&&(
        <button onClick={()=>onRemove(slotId)} style={{width:"100%",padding:"10px",borderRadius:10,background:`${C.occ}18`,border:`1px solid ${C.occ}55`,color:C.occ,fontFamily:C.sans,fontWeight:700,fontSize:13,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
          <span>✕</span> Remove This Slot
        </button>
      )}
    </div>
  );
}

// ── IMAGE RESULTS PAGE ────────────────────────────────────────────────────────
function ImageResultsPage({result,image,onBack,onApplyToMap}){
  const [selected,setSelected] = useState(null);
  const occupied = result.slots?.filter(s=>s.status==="Occupied").length||0;
  const reserved = result.slots?.filter(s=>s.status==="Reserved").length||0;
  const vacant   = result.slots?.filter(s=>s.status==="Vacant").length||0;

  // Build fresh slot definitions from raw vehicle detections (ignores slot_config.json).
  // Useful for discovering a new layout from any parking lot image.
  const applyDetectedAsSlots = () => {
    const boxes = result.vehicle_boxes;
    if(!boxes?.length) return;
    const [imgW, imgH] = result.image_size || [CAM_W, CAM_H];
    const derived = boxes.map((vb, i) => ({
      id:         `D${String(i+1).padStart(2,"0")}`,
      status:     "Vacant",
      confidence: vb.confidence,
      coords:     vb.coords,
      row:        vb.coords[1] < imgH/3 ? "A" : vb.coords[1] < 2*imgH/3 ? "B" : "C",
    }));
    onApplyToMap({ ...result, slots: derived, total_slots: derived.length, occupied: 0, reserved: 0, vacant: derived.length });
  };
  const total    = result.slots?.length||0;
  const p        = result.occupancy_percent||pct(occupied,total);
  const slot     = selected ? result.slots?.find(s=>s.id===selected) : null;

  return(
    <div style={{display:"flex",flexDirection:"column",gap:18,animation:"fadeUp .35s ease"}}>
      <div style={{display:"flex",alignItems:"center",gap:12}}>
        <button onClick={onBack} style={{display:"flex",alignItems:"center",gap:6,padding:"8px 14px",borderRadius:10,border:`1px solid ${C.border}`,background:"rgba(0,0,0,.04)",color:C.muted,fontFamily:C.mono,fontSize:12,cursor:"pointer"}}>← Back</button>
        <div>
          <div style={{fontFamily:C.sans,fontWeight:800,fontSize:18,color:C.text}}>YOLO Detection Results</div>
          <div style={{fontSize:11,fontFamily:C.mono,color:C.muted,marginTop:2}}>
            {result.mode==="no_slot_config"?"Estimated from vehicles detected":"Matched against slot_config.json"}
          </div>
        </div>
        <div style={{marginLeft:"auto"}}><Badge label="YOLOv8n" color={C.accent}/></div>
      </div>

      {result.mode==="no_slot_config"&&(
        <div style={{padding:"12px 16px",borderRadius:12,background:"rgba(245,158,11,.08)",border:`1px solid rgba(245,158,11,.3)`,fontFamily:C.mono,fontSize:11,color:C.warn,lineHeight:1.7}}>
          <strong>ℹ️ Running without slot map</strong> — run <span style={{color:C.accent}}>python3 flask_api.py</span> first to generate <span style={{color:C.accent}}>slot_config.json</span>.
        </div>
      )}

      <Card style={{padding:16}}>
        <div style={{fontFamily:C.sans,fontWeight:700,fontSize:13,marginBottom:12,color:C.muted}}>Analyzed Image</div>
        <div style={{position:"relative",display:"inline-block",width:"100%"}}>
          <img src={result.annotated_image||image} alt="analyzed" style={{width:"100%",borderRadius:10,display:"block",border:`1px solid ${C.border}`}}/>
          <div style={{position:"absolute",top:10,left:10,background:"rgba(255,255,255,.92)",border:`1px solid ${C.accent}44`,borderRadius:8,padding:"6px 12px",fontFamily:C.mono,fontSize:11,color:C.accent}}>
            🚗 {result.vehicles_detected} vehicles detected
          </div>
          <div style={{position:"absolute",top:10,right:10,background:"rgba(255,255,255,.92)",border:`1px solid ${C.vac}44`,borderRadius:8,padding:"6px 12px",fontFamily:C.mono,fontSize:11,color:C.vac}}>YOLOv8n ✓</div>
        </div>
      </Card>

      <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
        <StatPill label="Total Slots" value={total}    color={C.accent}/>
        <StatPill label="Occupied"    value={occupied} color={C.occ} sub={`${p}% full`}/>
        {reserved>0&&<StatPill label="Reserved" value={reserved} color="#f97316"/>}
        <StatPill label="Vacant"      value={vacant}   color={C.vac}/>
        <StatPill label="Vehicles"    value={result.vehicles_detected||0} color={C.purple}/>
      </div>

      <Card style={{padding:18}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
          <span style={{fontFamily:C.sans,fontWeight:600,fontSize:13,color:C.muted}}>Occupancy Rate</span>
          <span style={{fontFamily:C.mono,fontWeight:700,fontSize:13,color:p>75?C.occ:p>50?C.warn:C.vac}}>{p}%</span>
        </div>
        <div style={{height:12,background:"rgba(0,0,0,.08)",borderRadius:6,overflow:"hidden"}}>
          <div style={{height:"100%",width:`${p}%`,background:p>75?`linear-gradient(90deg,${C.occ},#dc2626)`:p>50?`linear-gradient(90deg,${C.warn},#d97706)`:`linear-gradient(90deg,${C.vac},#059669)`,borderRadius:6,transition:"width 1s ease"}}/>
        </div>
      </Card>

      {result.slots?.length>0&&(
        <Card style={{padding:20}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <div style={{fontFamily:C.sans,fontWeight:700,fontSize:15}}>Detected Slots<span style={{fontSize:12,fontWeight:400,color:C.muted,marginLeft:8}}>({total} total)</span></div>
            <div style={{display:"flex",gap:8}}>
              <Badge label={`${occupied} occupied`} color={C.occ}/>
              {reserved>0&&<Badge label={`${reserved} reserved`} color="#f97316"/>}
              <Badge label={`${vacant} vacant`}     color={C.vac}/>
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:10,marginBottom:16}}>
            {result.slots.map((s,i)=>{
              const occ=s.status==="Occupied", res=s.status==="Reserved", sel=selected===s.id;
              const sc=occ?C.occ:(res?"#f97316":C.vac);
              return(
                <div key={s.id} onClick={()=>setSelected(sel?null:s.id)}
                  style={{padding:"14px 12px",borderRadius:12,cursor:"pointer",background:sel?`${sc}22`:"rgba(0,0,0,.03)",border:`1.5px solid ${sel?sc:(sc+"33")}`,transition:"all .2s",animation:`fadeUp .3s ease ${i*0.04}s both`}}>
                  <div style={{fontSize:22,marginBottom:8,textAlign:"center"}}>{occ?"🚗":(res?"🔒":"🟢")}</div>
                  <div style={{fontFamily:C.mono,fontWeight:700,fontSize:13,color:sc,textAlign:"center",marginBottom:6}}>{s.id}</div>
                  <div style={{textAlign:"center",marginBottom:8}}>
                    <span style={{fontSize:9,fontWeight:700,fontFamily:C.mono,letterSpacing:"0.06em",textTransform:"uppercase",padding:"2px 8px",borderRadius:4,background:`${sc}22`,color:sc,border:`1px solid ${sc}44`}}>{s.status}</span>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:4}}>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:9,fontFamily:C.mono}}>
                      <span style={{color:C.muted}}>Row</span><span style={{color:C.text}}>{s.row||"?"}</span>
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:9,fontFamily:C.mono}}>
                      <span style={{color:C.muted}}>Conf</span><span style={{color:sc}}>{Math.round((s.confidence||.8)*100)}%</span>
                    </div>
                  </div>
                  <div style={{height:3,background:"rgba(0,0,0,.08)",borderRadius:2,marginTop:8,overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${Math.round((s.confidence||.8)*100)}%`,background:sc,borderRadius:2}}/>
                  </div>
                </div>
              );
            })}
          </div>
          {slot&&(
            <div style={{padding:18,borderRadius:14,background:"rgba(0,0,0,.03)",border:`1px solid ${slot.status==="Occupied"?C.occ+"44":(slot.status==="Reserved"?"#f9731644":C.vac+"44")}`,animation:"slideIn .2s ease"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <span style={{fontFamily:C.sans,fontWeight:800,fontSize:18,color:slot.status==="Occupied"?C.occ:(slot.status==="Reserved"?"#f97316":C.vac)}}>Slot {slot.id}</span>
                  <Badge label={slot.status} color={slot.status==="Occupied"?C.occ:(slot.status==="Reserved"?"#f97316":C.vac)}/>
                </div>
                <button onClick={()=>setSelected(null)} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:18}}>✕</button>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:8}}>
                {[["Slot ID",slot.id],["Status",slot.status],["Row",`Row ${slot.row||"?"}`],["Confidence",`${Math.round((slot.confidence||.8)*100)}%`],["Detection","YOLOv8n"],["Coordinates",slot.coords?(isQuad(slot.coords)?`Quad (${slot.coords.length} pts)`:`[${slot.coords.join(", ")}]`):"Estimated"]].map(([k,v])=>(
                  <div key={k} style={{background:"rgba(0,0,0,.3)",borderRadius:8,padding:"10px 12px"}}>
                    <div style={{fontSize:9,color:C.muted,textTransform:"uppercase",letterSpacing:"0.1em",fontFamily:C.mono,marginBottom:4}}>{k}</div>
                    <div style={{fontSize:12,fontWeight:600,fontFamily:C.mono,color:C.text,wordBreak:"break-all"}}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
        <button onClick={onBack} style={{flex:1,minWidth:120,padding:"13px",borderRadius:12,border:`1px solid ${C.border}`,background:"rgba(0,0,0,.04)",color:C.muted,fontFamily:C.sans,fontWeight:700,fontSize:13,cursor:"pointer"}}>← Analyze Another</button>
        {result.vehicle_boxes?.length>0&&(
          <button onClick={applyDetectedAsSlots}
            title="Create one slot per detected vehicle — ignores slot_config.json"
            style={{flex:1,minWidth:160,padding:"13px",borderRadius:12,border:`1px solid ${C.purple}55`,background:`${C.purple}12`,color:C.purple,fontFamily:C.sans,fontWeight:700,fontSize:13,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
            📐 Derive Slots from Detections
          </button>
        )}
        <button onClick={()=>onApplyToMap(result)} style={{flex:2,minWidth:160,padding:"13px",borderRadius:12,border:"none",background:`linear-gradient(135deg,${C.purple},${C.accent})`,color:"#fff",fontFamily:C.sans,fontWeight:800,fontSize:13,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>🗺️ Apply to Parking Map</button>
      </div>
    </div>
  );
}

// ── IMAGE TEST PANEL ──────────────────────────────────────────────────────────
function ImageTestPanel({onAnalysisComplete,addLog,piStatus}){
  const [dragOver,setDragOver]   = useState(false);
  const [image,setImage]         = useState(null);
  const [imageFile,setImageFile] = useState(null);
  const [analyzing,setAnalyzing] = useState(false);
  const [result,setResult]       = useState(null);
  const [error,setError]         = useState(null);
  const inputRef                 = useRef(null);

  const handleFile = (file) => {
    if(!file||!file.type.startsWith("image/")) return;
    setImageFile(file); setResult(null); setError(null);
    const reader = new FileReader();
    reader.onload = e => setImage(e.target.result);
    reader.readAsDataURL(file);
  };

  const analyzeImage = async () => {
    if(!imageFile) return;
    if(piStatus==="error"){ setError(`Cannot reach Pi at ${PI_API_URL}.`); return; }
    setAnalyzing(true); setError(null);
    addLog("[IMG]  Image sent to Raspberry Pi for YOLO analysis...","img");
    try {
      const formData = new FormData();
      formData.append("image", imageFile);
      const response = await fetch(`${PI_API_URL}/analyze-image`,{method:"POST",body:formData});
      if(!response.ok) throw new Error(`Pi returned ${response.status}`);
      const data = await response.json();
      setResult(data);
      addLog(`[YOLO] Analysis complete — ${data.vehicles_detected} vehicles detected`,"img");
      addLog(`[YOLO] Occupied: ${data.occupied} | Vacant: ${data.vacant} | Slots: ${data.total_slots}`,"img");
    } catch(err){
      const msg=`Failed to reach Pi API: ${err.message}`;
      setError(msg);
      addLog(`[IMG]  ERROR: ${msg}`,"error");
    } finally { setAnalyzing(false); }
  };

  if(result) return <ImageResultsPage result={result} image={image} onBack={()=>{setResult(null);setError(null);}} onApplyToMap={onAnalysisComplete}/>;

  const piOffline = piStatus==="error";
  return(
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <div style={{padding:"14px 18px",background:`linear-gradient(135deg,rgba(124,58,237,.1),rgba(245,166,35,.07))`,border:`1px solid rgba(124,58,237,.25)`,borderRadius:14,display:"flex",alignItems:"center",gap:12}}>
        <span style={{fontSize:24}}>🖼️</span>
        <div>
          <div style={{fontFamily:C.sans,fontWeight:800,fontSize:15,color:C.purple}}>Image Testing Mode</div>
          <div style={{fontSize:11,fontFamily:C.mono,color:C.muted}}>Upload a photo → Pi runs YOLO → Full results page</div>
        </div>
        <Badge label={piOffline?"PI OFFLINE":"YOLO READY"} color={piOffline?C.occ:C.vac}/>
      </div>

      {piOffline&&(
        <div style={{padding:"14px 16px",borderRadius:12,background:`${C.occ}12`,border:`1px solid ${C.occ}44`,fontFamily:C.mono,fontSize:11}}>
          <div style={{color:C.occ,fontWeight:700,marginBottom:6}}>⚠️ Raspberry Pi is offline</div>
          <div style={{color:C.muted,lineHeight:1.7}}>Run <span style={{color:C.accent}}>python3 flask_api.py</span> on the Pi</div>
        </div>
      )}

      <div onDragOver={e=>{e.preventDefault();setDragOver(true)}} onDragLeave={()=>setDragOver(false)}
        onDrop={e=>{e.preventDefault();setDragOver(false);handleFile(e.dataTransfer.files[0]);}}
        onClick={()=>inputRef.current?.click()}
        style={{border:`2px dashed ${dragOver?C.accent:"rgba(245,166,35,.35)"}`,borderRadius:16,padding:"28px 20px",textAlign:"center",cursor:"pointer",background:dragOver?"rgba(245,166,35,.07)":"rgba(0,0,0,.02)",transition:"all .2s"}}>
        <input ref={inputRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>handleFile(e.target.files[0])}/>
        {image?(
          <div>
            <img src={image} alt="uploaded" style={{maxHeight:240,maxWidth:"100%",borderRadius:10,border:`1px solid ${C.border}`,objectFit:"contain"}}/>
            <div style={{marginTop:10,fontSize:11,fontFamily:C.mono,color:C.muted}}>✓ Ready — click Analyze or drop a new image</div>
          </div>
        ):(
          <div>
            <div style={{fontSize:44,marginBottom:12}}>📷</div>
            <div style={{fontFamily:C.sans,fontWeight:700,fontSize:16,marginBottom:6}}>Drop a parking lot image here</div>
            <div style={{fontSize:11,fontFamily:C.mono,color:C.muted}}>or click to browse · JPG, PNG, WEBP</div>
          </div>
        )}
      </div>

      {image&&(
        <button onClick={analyzeImage} disabled={analyzing||piOffline}
          style={{padding:"14px",borderRadius:12,border:"none",cursor:analyzing||piOffline?"not-allowed":"pointer",fontFamily:C.sans,fontWeight:800,fontSize:15,background:analyzing?"rgba(124,58,237,.2)":piOffline?`${C.occ}33`:`linear-gradient(135deg,${C.purple},${C.accent})`,color:piOffline?C.occ:"#fff",display:"flex",alignItems:"center",justifyContent:"center",gap:10,opacity:analyzing?.7:1}}>
          {analyzing?<><span style={{width:18,height:18,border:"2px solid rgba(255,255,255,.3)",borderTopColor:"#fff",borderRadius:"50%",animation:"spin .8s linear infinite",display:"inline-block"}}/>Running YOLO on Pi...</>:piOffline?"⚠️ Pi Offline":"🔍 Send to Pi & Analyze with YOLO"}
        </button>
      )}

      {error&&<div style={{padding:"12px 16px",borderRadius:10,background:`${C.occ}15`,border:`1px solid ${C.occ}44`,fontFamily:C.mono,fontSize:11,color:C.occ}}>⚠️ {error}</div>}
    </div>
  );
}

// ── Slot Editor Panel ─────────────────────────────────────────────────────────
function SlotEditorPanel({slots, piStatus, addLog, selectedPiCode, onSlotDeleted}){
  const canvasRef                         = useRef(null);
  const [frameUrl, setFrameUrl]           = useState(null);
  const [selected, setSelected]           = useState(null);
  const [dragState, setDragState]         = useState(null);
  const [saving, setSaving]               = useState(false);
  const [msg, setMsg]                     = useState(null);
  const [editSlots, setEditSlots]         = useState({});
  // isDirty: true whenever the user has moved any corner but not yet saved/reset.
  // While dirty, incoming Firebase slot updates are ignored so edits are not wiped.
  const [isDirty, setIsDirty]             = useState(false);
  // piSlotsLoaded: true after we've successfully loaded slots from the Pi API.
  // While true the Firebase slots prop is ignored so we only show this Pi's data.
  const [piSlotsLoaded, setPiSlotsLoaded] = useState(false);

  const imgSize = {w: CAM_W, h: CAM_H};
  const piOffline = piStatus !== "online";

  const toQuad = (coords) => {
    if(!coords || coords.length === 0) return null;
    if(Array.isArray(coords[0])) return coords.map(p=>[...p]);
    const [x1,y1,x2,y2] = coords;
    return [[x1,y1],[x2,y1],[x2,y2],[x1,y2]];
  };

  // Load slots directly from the Pi API so the editor only shows slots that
  // belong to this camera, not the Firebase aggregate from all Pis.
  const loadSlotsFromPi = async () => {
    try {
      const r = await fetch(`${PI_API_URL}/slots`, {signal: AbortSignal.timeout(5000)});
      if(!r.ok) return false;
      const data = await r.json();
      if(!data || typeof data !== "object" || Array.isArray(data) || data.error) return false;
      const init = {};
      Object.entries(data).forEach(([id, s]) => {
        const q = toQuad(s.coords ?? s.quad);
        if(!q) return;
        init[id] = {...s, quad: q, status: s.status ?? "Vacant"};
      });
      if(!Object.keys(init).length) return false;
      setEditSlots(init);
      setSelected(null);
      setPiSlotsLoaded(true);
      setIsDirty(false);
      return true;
    } catch { return false; }
  };

  // Load Pi slots when Pi comes online; clear piSlotsLoaded when it goes offline.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(()=>{
    if(piStatus === "online") loadSlotsFromPi();
    else setPiSlotsLoaded(false);
  },[piStatus]);

  // When Pi slots are loaded: patch status-only from Firebase so occupancy colours
  // stay live without ever resetting coords/quad that came from the Pi.
  // When Pi slots aren't loaded (offline / GET /slots unsupported): full Firebase sync.
  useEffect(()=>{
    if(!Object.keys(slots).length) return;
    if(piSlotsLoaded){
      setEditSlots(prev => {
        const next = {...prev};
        let changed = false;
        Object.entries(slots).forEach(([id, s]) => {
          if(next[id] && next[id].status !== s.status){
            next[id] = {...next[id], status: s.status};
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    } else {
      const init = {};
      Object.keys(slots).forEach(id => {
        const q = toQuad(slots[id].coords);
        if(!q) return;
        init[id] = {...slots[id], quad: q};
      });
      setEditSlots(init);
      setIsDirty(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots, piSlotsLoaded]);

  const fetchFrame = async () => {
    if(piOffline) return;
    try {
      const res = await fetch(`${PI_API_URL}/live-frame?t=${Date.now()}`,
        {signal: AbortSignal.timeout(6000)});
      if(!res.ok) return;
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      setFrameUrl(prev=>{ if(prev) URL.revokeObjectURL(prev); return url; });
    } catch(e){ /* silent */ }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(()=>{ fetchFrame(); },[piStatus]);

  const showMsg = (text, ok=true) => {
    setMsg({text,ok}); setTimeout(()=>setMsg(null), 5000);
  };

  useEffect(()=>{
    const canvas = canvasRef.current;
    if(!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0,0,W,H);

    if(frameUrl){
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, W, H);
        drawSlots(ctx, W, H);
      };
      img.src = frameUrl;
    } else {
      ctx.fillStyle = "#0a0e1a";
      ctx.fillRect(0,0,W,H);
      ctx.fillStyle = "#334155";
      ctx.font = "14px monospace";
      ctx.textAlign = "center";
      ctx.fillText("Click 🔄 Refresh Frame to load camera image", W/2, H/2);
      drawSlots(ctx, W, H);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameUrl, editSlots, selected]);

  const drawSlots = (ctx, W, H) => {
    Object.entries(editSlots).forEach(([id, s])=>{
      const quad = s.quad;
      if(!quad || quad.length !== 4) return;
      const pts  = quad.map(p => scaleToCanvas(p, W, H));
      const isSel = id === selected;
      const isOcc = s.status === "Occupied";
      const isRes = s.status === "Reserved";

      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      pts.forEach(p => ctx.lineTo(p[0], p[1]));
      ctx.closePath();
      ctx.strokeStyle = isSel ? "#38bdf8" : (isOcc ? "#ef4444" : (isRes ? "#f97316" : "#22c55e"));
      ctx.lineWidth   = isSel ? 2.5 : 1.5;
      ctx.stroke();
      ctx.fillStyle   = isSel ? "rgba(245,166,35,0.12)" : (isOcc ? "rgba(239,68,68,0.08)" : (isRes ? "rgba(249,115,22,0.10)" : "rgba(34,197,94,0.08)"));
      ctx.fill();

      const cx = pts.reduce((s,p)=>s+p[0],0)/4;
      const cy = pts.reduce((s,p)=>s+p[1],0)/4;
      ctx.fillStyle   = isSel ? "#38bdf8" : (isOcc ? "#ef4444" : (isRes ? "#f97316" : "#94a3b8"));
      ctx.font        = `${isSel?700:500} ${isSel?13:11}px monospace`;
      ctx.textAlign   = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(id, cx, cy);

      if(isSel){
        pts.forEach((p, i)=>{
          ctx.beginPath();
          ctx.arc(p[0], p[1], 7, 0, Math.PI*2);
          ctx.fillStyle   = "#38bdf8";
          ctx.fill();
          ctx.strokeStyle = "#0f172a";
          ctx.lineWidth   = 2;
          ctx.stroke();
          ctx.fillStyle  = "#0f172a";
          ctx.font       = "bold 9px monospace";
          ctx.textAlign  = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(i+1, p[0], p[1]);
        });
      }
    });
  };

  const scaleToCanvas = (pt, W, H) => [
    (pt[0] / imgSize.w) * W,
    (pt[1] / imgSize.h) * H,
  ];

  const canvasToCamera = (x, y, W, H) => [
    Math.round((x / W) * imgSize.w),
    Math.round((y / H) * imgSize.h),
  ];

  const getCanvasPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = canvasRef.current.width  / rect.width;
    const scaleY = canvasRef.current.height / rect.height;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return [(clientX - rect.left)*scaleX, (clientY - rect.top)*scaleY];
  };

  const HIT_RADIUS = 14;

  const onMouseDown = (e) => {
    if(!selected) return;
    const [mx, my] = getCanvasPos(e);
    const W = canvasRef.current.width, H = canvasRef.current.height;
    const quad = editSlots[selected]?.quad;
    if(!quad) return;

    for(let i=0; i<4; i++){
      const [px,py] = scaleToCanvas(quad[i], W, H);
      if(Math.hypot(mx-px, my-py) < HIT_RADIUS){
        e.preventDefault();
        setDragState({slotId: selected, ptIdx: i});
        return;
      }
    }

    Object.entries(editSlots).forEach(([id, s])=>{
      if(id === selected) return;
      const pts = s.quad.map(p => scaleToCanvas(p, W, H));
      const path = new Path2D();
      path.moveTo(pts[0][0], pts[0][1]);
      pts.forEach(p => path.lineTo(p[0], p[1]));
      path.closePath();
      const ctx = canvasRef.current.getContext("2d");
      if(ctx.isPointInPath(path, mx, my)){
        setSelected(id);
      }
    });
  };

  const onMouseMove = (e) => {
    if(!dragState) return;
    e.preventDefault();
    const [mx, my] = getCanvasPos(e);
    const W = canvasRef.current.width, H = canvasRef.current.height;
    const [cx, cy] = canvasToCamera(mx, my, W, H);

    // Mark dirty on first movement so Firebase polls cannot reset corners mid-edit
    setIsDirty(true);

    setEditSlots(prev => {
      const updated = {...prev};
      const newQuad = updated[dragState.slotId].quad.map((p,i) =>
        i === dragState.ptIdx ? [cx, cy] : [...p]
      );
      updated[dragState.slotId] = {...updated[dragState.slotId], quad: newQuad};
      return updated;
    });
  };

  const onMouseUp = () => setDragState(null);

  const saveSlot = async (slotId) => {
    if(saving || piOffline || !slotId) return;
    setSaving(true);
    const quad = editSlots[slotId]?.quad;
    if(!quad){ setSaving(false); return; }
    try {
      const r = await fetch(`${PI_API_URL}/slots/${slotId}`, {
        method: "PUT",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({coords: quad}),
        signal: AbortSignal.timeout(5000),
      });
      const d = await r.json();
      if(d.error) throw new Error(d.error);
      if(selectedPiCode){
        try {
          await savePinSlotLayout(selectedPiCode, slotId, quad, editSlots[slotId]?.row ?? null);
          addLog(`[EDITOR] ${slotId} layout saved to pin ${selectedPiCode}`, "sys");
        } catch(e){
          addLog(`[EDITOR] Pin layout save failed: ${e.message}`, "error");
        }
      }
      showMsg(`Slot ${slotId} saved.`);
      addLog(`[EDITOR] ${slotId} quad updated — ${quad.map(p=>p.join(",")).join(" | ")}`, "sys");
      setIsDirty(false);  // saved — Firebase syncs are safe again
    } catch(e){
      showMsg(`Save failed: ${e.message}`, false);
    } finally { setSaving(false); }
  };

  const saveAll = async () => {
    if(saving || piOffline) return;
    setSaving(true);
    let ok=0, fail=0;
    for(const [id, s] of Object.entries(editSlots)){
      try {
        await fetch(`${PI_API_URL}/slots/${id}`, {
          method:"PUT",
          headers:{"Content-Type":"application/json"},
          body: JSON.stringify({coords: s.quad}),
          signal: AbortSignal.timeout(5000),
        });
        if(selectedPiCode){
          try {
            await savePinSlotLayout(selectedPiCode, id, s.quad, s.row ?? null);
          } catch { /* non-fatal */ }
        }
        ok++;
      } catch { fail++; }
    }
    if(selectedPiCode && ok>0) addLog(`[EDITOR] Saved ${ok} slot layouts to pin ${selectedPiCode}`, "sys");
    showMsg(`Saved ${ok} slots${fail?`, ${fail} failed`:"."}`);
    addLog(`[EDITOR] Saved all ${ok} slots to Pi`, "sys");
    if(!fail) setIsDirty(false);  // fully saved — Firebase syncs are safe again
    setSaving(false);
  };

  const resetSlot = (slotId) => {
    const orig = toQuad(slots[slotId]?.coords);
    if(!orig) return;
    setEditSlots(prev=>({...prev, [slotId]: {...prev[slotId], quad: orig}}));
    setIsDirty(false);  // user explicitly reset — Firebase syncs are safe again
    showMsg(`Slot ${slotId} reset to original.`);
  };

  const [addingSlot, setAddingSlot]     = useState(false);
  const [newSlotId,  setNewSlotId]      = useState("");
  const [newSlotRow, setNewSlotRow]     = useState("A");
  const [showAddForm, setShowAddForm]   = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const deleteSlotFromEditor = async (slotId) => {
    try {
      await fetch(`${PI_API_URL}/slots/${slotId}`, {
        method: "DELETE",
        signal: AbortSignal.timeout(5000),
      });
    } catch { /* Pi delete endpoint may not exist; continue to Firebase */ }
    try {
      await deleteSlot(slotId);
    } catch(e) {
      showMsg(`Delete failed: ${e.message}`, false);
      setConfirmDelete(null);
      return;
    }
    setEditSlots(prev => { const n = {...prev}; delete n[slotId]; return n; });
    onSlotDeleted?.(slotId);
    if(selected === slotId) setSelected(null);
    setConfirmDelete(null);
    setIsDirty(false);
    showMsg(`Slot ${slotId} removed.`);
    addLog(`[EDITOR] Slot ${slotId} deleted`, "sys");
  };

  const addSlot = async () => {
    if(!newSlotId.trim() || piOffline) return;
    // Default quad: small centred rectangle in camera space
    const cx = Math.round(CAM_W / 2), cy = Math.round(CAM_H / 2);
    const hw = 120, hh = 90;
    const defaultQuad = [[cx-hw,cy-hh],[cx+hw,cy-hh],[cx+hw,cy+hh],[cx-hw,cy+hh]];
    setAddingSlot(true);
    try {
      const r = await fetch(`${PI_API_URL}/slots`, {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({slot_id: newSlotId.trim(), coords: defaultQuad, row: newSlotRow}),
        signal: AbortSignal.timeout(5000),
      });
      const d = await r.json();
      if(d.error) throw new Error(d.error);
      const sid = newSlotId.trim();
      setEditSlots(prev => ({
        ...prev,
        [sid]: { status: "Vacant", quad: defaultQuad, row: newSlotRow },
      }));
      setSelected(sid);
      showMsg(`Slot ${sid} added — drag corners to position it.`);
      addLog(`[EDITOR] New slot ${sid} added (row ${newSlotRow})`, "sys");
      setIsDirty(true);
      setShowAddForm(false);
      setNewSlotId("");
    } catch(e){
      showMsg(`Add failed: ${e.message}`, false);
    } finally { setAddingSlot(false); }
  };

  const slotIds = Object.keys(editSlots);

  return (
    <div style={{display:"flex", flexDirection:"column", gap:14}}>
      {piOffline&&(
        <div style={{padding:"12px 16px",borderRadius:10,background:`${C.occ}12`,border:`1px solid ${C.occ}33`,fontFamily:C.mono,fontSize:11,color:C.occ}}>
          ⚠️ Pi is offline — slot editing requires a live connection.
        </div>
      )}
      {msg&&(
        <div style={{padding:"10px 14px",borderRadius:10,
          background:msg.ok?`${C.vac}12`:`${C.occ}12`,
          border:`1px solid ${msg.ok?C.vac+"33":C.occ+"33"}`,
          fontFamily:C.mono,fontSize:11,color:msg.ok?C.vac:C.occ}}>
          {msg.ok?"✅":"⚠️"} {msg.text}
        </div>
      )}

      <Card style={{padding:"12px 16px"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
          <div style={{display:"flex",alignItems:"center",gap:8,flex:1,minWidth:180}}>
            <span style={{fontFamily:C.mono,fontSize:11,color:C.muted,whiteSpace:"nowrap"}}>Select slot:</span>
            <select value={selected||""} onChange={e=>setSelected(e.target.value||null)}
              style={{flex:1,background:C.surface,border:`1px solid ${C.border}`,color:C.text,
                borderRadius:8,padding:"6px 10px",fontFamily:C.mono,fontSize:12,cursor:"pointer"}}>
              <option value="" style={{background:C.surface,color:C.text}}>— click canvas or pick —</option>
              {slotIds.map(id=>(
                <option key={id} value={id} style={{background:C.surface,color:C.text}}>
                  {id} {editSlots[id]?.status==="Occupied"?"🔴":"🟢"} {editSlots[id]?.source==="manual"?"(manual)":""}
                </option>
              ))}
            </select>
          </div>
          <button onClick={()=>{ fetchFrame(); loadSlotsFromPi(); }} disabled={piOffline}
            style={{padding:"7px 13px",borderRadius:8,border:`1px solid ${C.border}`,
              background:"rgba(0,0,0,.05)",color:C.text,fontFamily:C.mono,fontSize:11,
              cursor:piOffline?"not-allowed":"pointer"}}>
            🔄 Refresh Frame
          </button>
          {selected&&(
            <>
              <button onClick={()=>resetSlot(selected)}
                style={{padding:"7px 13px",borderRadius:8,border:`1px solid ${C.warn}44`,
                  background:`${C.warn}10`,color:C.warn,fontFamily:C.mono,fontSize:11,cursor:"pointer"}}>
                ↺ Reset {selected}
              </button>
              <button onClick={()=>setConfirmDelete(selected)}
                style={{padding:"7px 13px",borderRadius:8,border:`1px solid ${C.occ}44`,
                  background:`${C.occ}10`,color:C.occ,fontFamily:C.mono,fontSize:11,cursor:"pointer"}}>
                ✕ Delete {selected}
              </button>
              <button onClick={()=>saveSlot(selected)} disabled={saving||piOffline}
                style={{padding:"7px 13px",borderRadius:8,border:"none",
                  background:`linear-gradient(135deg,${C.accent},${C.purple})`,
                  color:"#fff",fontFamily:C.mono,fontSize:11,fontWeight:700,
                  cursor:saving||piOffline?"not-allowed":"pointer",opacity:saving?.7:1}}>
                {saving?"Saving...":"💾 Save "+selected}
              </button>
            </>
          )}
          {isDirty&&(
            <span style={{padding:"4px 10px",borderRadius:6,background:"rgba(245,158,11,.15)",
              border:"1px solid rgba(245,158,11,.4)",fontFamily:C.mono,fontSize:10,
              color:C.warn,whiteSpace:"nowrap"}}>
              ● unsaved changes
            </span>
          )}
          <button onClick={saveAll} disabled={saving||piOffline}
            style={{padding:"7px 13px",borderRadius:8,border:"none",
              background:piOffline?"rgba(0,0,0,.05)":isDirty?`linear-gradient(135deg,${C.warn},#d97706)`:`linear-gradient(135deg,#10b981,#059669)`,
              color:piOffline?C.muted:"#fff",fontFamily:C.mono,fontSize:11,fontWeight:700,
              cursor:saving||piOffline?"not-allowed":"pointer",opacity:saving?.7:1}}>
            {saving?"Saving...":"💾 Save All"}
          </button>
          <button onClick={()=>setShowAddForm(f=>!f)} disabled={piOffline}
            style={{padding:"7px 13px",borderRadius:8,
              border:`1px solid ${C.accent}44`,
              background:showAddForm?`${C.accent}22`:`${C.accent}11`,
              color:C.accent,fontFamily:C.mono,fontSize:11,fontWeight:700,
              cursor:piOffline?"not-allowed":"pointer"}}>
            {showAddForm?"✕ Cancel":"＋ Add Slot"}
          </button>
        </div>

        {/* Fix #7: inline add-slot form */}
        {showAddForm&&(
          <div style={{marginTop:10,padding:"12px 14px",borderRadius:10,
            background:`${C.accent}08`,border:`1px solid ${C.accent}33`,
            display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
            <span style={{fontFamily:C.mono,fontSize:11,color:C.muted,whiteSpace:"nowrap"}}>New slot:</span>
            <input value={newSlotId} onChange={e=>setNewSlotId(e.target.value.toUpperCase())}
              placeholder="e.g. S07"
              style={{width:80,background:"#0f172a",border:`1px solid ${C.border}`,color:C.text,
                borderRadius:6,padding:"5px 8px",fontFamily:C.mono,fontSize:12}}/>
            <span style={{fontFamily:C.mono,fontSize:11,color:C.muted}}>Row:</span>
            <select value={newSlotRow} onChange={e=>setNewSlotRow(e.target.value)}
              style={{background:"#0f172a",border:`1px solid ${C.border}`,color:C.text,
                borderRadius:6,padding:"5px 8px",fontFamily:C.mono,fontSize:12}}>
              {["A","B","C","D","M"].map(r=><option key={r} value={r}>{r}</option>)}
            </select>
            <button onClick={addSlot} disabled={!newSlotId.trim()||addingSlot||piOffline}
              style={{padding:"6px 14px",borderRadius:8,border:"none",
                background:!newSlotId.trim()||piOffline?"rgba(0,0,0,.05)":`linear-gradient(135deg,${C.accent},${C.purple})`,
                color:!newSlotId.trim()||piOffline?C.muted:"#fff",
                fontFamily:C.mono,fontSize:11,fontWeight:700,
                cursor:!newSlotId.trim()||addingSlot||piOffline?"not-allowed":"pointer"}}>
              {addingSlot?"Adding...":"＋ Add"}
            </button>
            <span style={{fontFamily:C.mono,fontSize:10,color:C.muted}}>
              Slot appears centred — drag corners to position it.
            </span>
          </div>
        )}
      </Card>

      <Card style={{padding:12}}>
        <div style={{position:"relative",borderRadius:10,overflow:"hidden",
          background:"#0a0e1a",border:`1px solid ${C.border}`}}>
          <canvas ref={canvasRef} width={1280} height={720}
            style={{width:"100%",display:"block",cursor:dragState?"crosshair":selected?"pointer":"default",
              touchAction:"none"}}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            onTouchStart={onMouseDown}
            onTouchMove={onMouseMove}
            onTouchEnd={onMouseUp}
          />
          <div style={{position:"absolute",top:10,right:10,display:"flex",flexDirection:"column",
            gap:4,background:"rgba(0,0,0,.65)",borderRadius:8,padding:"8px 12px"}}>
            <div style={{fontFamily:C.mono,fontSize:9,color:C.muted,marginBottom:2}}>LEGEND</div>
            {[["#38bdf8","Selected slot"],["#22c55e","Vacant"],["#ef4444","Occupied"]].map(([col,lbl])=>(
              <div key={lbl} style={{display:"flex",alignItems:"center",gap:6}}>
                <div style={{width:12,height:3,background:col,borderRadius:2}}/>
                <span style={{fontFamily:C.mono,fontSize:9,color:C.muted}}>{lbl}</span>
              </div>
            ))}
            <div style={{borderTop:`1px solid ${C.border}`,marginTop:4,paddingTop:4,
              fontFamily:C.mono,fontSize:9,color:C.muted}}>
              ● Drag blue corners to adjust
            </div>
          </div>
        </div>
      </Card>

      {selected && editSlots[selected]?.quad && (
        <Card style={{padding:"12px 16px"}}>
          <div style={{fontFamily:C.sans,fontWeight:700,fontSize:13,marginBottom:10}}>
            {selected} — Corner Coordinates
            <span style={{fontFamily:C.mono,fontSize:10,color:C.muted,marginLeft:8,fontWeight:400}}>
              (camera pixels, {imgSize.w}×{imgSize.h})
            </span>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            {editSlots[selected].quad.map((p,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:8,
                padding:"8px 12px",borderRadius:8,background:"rgba(245,166,35,.07)",
                border:`1px solid rgba(245,166,35,.2)`}}>
                <div style={{width:20,height:20,borderRadius:"50%",background:C.accent,
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontFamily:C.mono,fontSize:10,fontWeight:700,color:"#0f172a",flexShrink:0}}>
                  {i+1}
                </div>
                <div>
                  <div style={{fontFamily:C.mono,fontSize:11,color:C.text,fontWeight:600}}>
                    x: {p[0]}  y: {p[1]}
                  </div>
                  <div style={{fontFamily:C.mono,fontSize:9,color:C.muted}}>
                    {["Top-left","Top-right","Bottom-right","Bottom-left"][i]}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div style={{padding:"10px 14px",borderRadius:10,background:"rgba(245,166,35,.07)",
        border:`1px solid rgba(245,166,35,.2)`,fontFamily:C.mono,fontSize:10,color:C.muted,lineHeight:1.8}}>
        ℹ️ <strong style={{color:C.accent}}>How to use:</strong> Click a slot on the canvas or pick from the dropdown → blue corner handles appear → drag any corner to reposition → Save. Changes apply to the Pi immediately and persist across restarts.
        <br/>After a Remap, refresh this tab to load the new auto-mapped quads.
      </div>

      {confirmDelete&&(
        <ConfirmDialog slotId={confirmDelete}
          onConfirm={()=>deleteSlotFromEditor(confirmDelete)}
          onCancel={()=>setConfirmDelete(null)}/>
      )}
    </div>
  );
}

// ── Program Properties Panel ──────────────────────────────────────────────────
function ProgramPropertiesPanel({piStatus, addLog}){
  const DEF = {confidence:0.20,conf_cls0:0.20,conf_cls1:0.45,conf_cls2:0.45,iou_threshold:0.35,smoothing_win:5,detect_interval:1.0,firebase_every:2,yolo_every_n:1};
  const [cfg, setCfg]       = useState(DEF);
  const [saving, setSaving]   = useState(false);
  const [msg, setMsg]         = useState(null);
  const piOffline = piStatus !== "online";

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(()=>{
    if(piOffline){ return; }
    fetch(`${PI_API_URL}/program-config`,{signal:AbortSignal.timeout(4000)})
      .then(r=>r.json()).then(d=>{setCfg(d);})
      .catch(()=>{});
  },[piStatus]);

  const showMsg = (text,ok=true)=>{ setMsg({text,ok}); setTimeout(()=>setMsg(null),5000); };

  const apply = async()=>{
    if(saving||piOffline) return;
    setSaving(true);
    try{
      const r = await fetch(`${PI_API_URL}/program-config`,{
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify(cfg), signal:AbortSignal.timeout(5000),
      });
      const d = await r.json();
      showMsg(d.message||"Config applied.");
      addLog(`[PROPS] Config saved — interval:${cfg.detect_interval}s conf:${cfg.confidence} cls0:${cfg.conf_cls0} cls1:${cfg.conf_cls1} cls2:${cfg.conf_cls2} yolo_every:${cfg.yolo_every_n}`,"sys");
    }catch(e){ showMsg(`Failed: ${e.message}`,false); }
    finally{ setSaving(false); }
  };

  const reset = ()=>{ setCfg(DEF); showMsg("Reset to defaults — click Apply to save.",true); };

  const Row = ({label,hint,children})=>(
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 0",borderBottom:`1px solid ${C.border}`}}>
      <div style={{flex:1,paddingRight:20}}>
        <div style={{fontFamily:C.mono,fontSize:12,color:C.text,fontWeight:600}}>{label}</div>
        {hint&&<div style={{fontFamily:C.mono,fontSize:10,color:C.muted,marginTop:3,lineHeight:1.5}}>{hint}</div>}
      </div>
      <div style={{flexShrink:0}}>{children}</div>
    </div>
  );

  const NumInput = ({val,min,max,step,onChange,unit=""})=>(
    <div style={{display:"flex",alignItems:"center",gap:6}}>
      <button onClick={()=>onChange(Math.max(min,parseFloat((val-step).toFixed(10))))}
        disabled={piOffline} style={{width:28,height:28,borderRadius:6,border:`1px solid ${C.border}`,background:"rgba(0,0,0,.05)",color:C.text,cursor:piOffline?"not-allowed":"pointer",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center"}}>−</button>
      <div style={{minWidth:64,textAlign:"center",fontFamily:C.mono,fontWeight:700,fontSize:14,color:C.accent,padding:"4px 8px",background:"rgba(245,166,35,.1)",borderRadius:6,border:`1px solid rgba(245,166,35,.25)`}}>
        {val}{unit}
      </div>
      <button onClick={()=>onChange(Math.min(max,parseFloat((val+step).toFixed(10))))}
        disabled={piOffline} style={{width:28,height:28,borderRadius:6,border:`1px solid ${C.border}`,background:"rgba(0,0,0,.05)",color:C.text,cursor:piOffline?"not-allowed":"pointer",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
    </div>
  );

  return(
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      {piOffline&&(
        <div style={{padding:"12px 16px",borderRadius:10,background:`${C.occ}12`,border:`1px solid ${C.occ}33`,fontFamily:C.mono,fontSize:11,color:C.occ}}>
          ⚠️ Pi is offline — connect Pi to adjust program properties.
        </div>
      )}
      {msg&&(
        <div style={{padding:"10px 14px",borderRadius:10,background:msg.ok?`${C.vac}12`:`${C.occ}12`,border:`1px solid ${msg.ok?C.vac+"33":C.occ+"33"}`,fontFamily:C.mono,fontSize:11,color:msg.ok?C.vac:C.occ,animation:"fadeUp .2s ease"}}>
          {msg.ok?"✅":"⚠️"} {msg.text}
        </div>
      )}

      <Card style={{padding:"4px 20px 20px"}}>
        <div style={{fontFamily:C.sans,fontWeight:700,fontSize:13,color:C.muted,textTransform:"uppercase",letterSpacing:"0.08em",marginTop:18,marginBottom:2}}>Performance</div>
        <Row label="Detect Interval" hint="Seconds between detection cycles. 0 = as fast as Pi allows (~2–3 FPS). Raise to reduce CPU load.">
          <NumInput val={cfg.detect_interval} min={0.0} max={5.0} step={0.1} unit="s"
            onChange={v=>setCfg(p=>({...p,detect_interval:Math.round(v*10)/10}))}/>
        </Row>
        <Row label="YOLO Every N Frames" hint="Run YOLO inference only every N frames. Previous result reused on skipped frames. 1 = every frame, 3 = 3× faster.">
          <NumInput val={cfg.yolo_every_n} min={1} max={10} step={1}
            onChange={v=>setCfg(p=>({...p,yolo_every_n:v}))}/>
        </Row>
        <Row label="Firebase Push Every N" hint="Push occupancy to Firebase every N detection cycles. Higher = fewer Firebase writes.">
          <NumInput val={cfg.firebase_every} min={1} max={30} step={1}
            onChange={v=>setCfg(p=>({...p,firebase_every:v}))}/>
        </Row>
        <div style={{fontFamily:C.sans,fontWeight:700,fontSize:13,color:C.muted,textTransform:"uppercase",letterSpacing:"0.08em",marginTop:24,marginBottom:2}}>Detection Accuracy</div>
        <Row label="YOLO Confidence" hint="Global minimum confidence floor for all classes.">
          <NumInput val={cfg.confidence} min={0.05} max={0.9} step={0.05}
            onChange={v=>setCfg(p=>({...p,confidence:Math.round(v*100)/100}))}/>
        </Row>
        <div style={{fontFamily:C.sans,fontWeight:700,fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:"0.08em",marginTop:18,marginBottom:2,opacity:.7}}>Per-Class Confidence</div>
        <Row label="Class 0 — Cars" hint="Min confidence to count a detection as a car. Raise if parked slots flicker on/off.">
          <NumInput val={cfg.conf_cls0??0.20} min={0.05} max={0.95} step={0.05}
            onChange={v=>setCfg(p=>({...p,conf_cls0:Math.round(v*100)/100}))}/>
        </Row>
        <Row label="Class 1 — Cones" hint="Min confidence for traffic cones. Raise to prevent people/bags from triggering Reserved.">
          <NumInput val={cfg.conf_cls1??0.45} min={0.05} max={0.95} step={0.05}
            onChange={v=>setCfg(p=>({...p,conf_cls1:Math.round(v*100)/100}))}/>
        </Row>
        <Row label="Class 2 — Stands" hint="Min confidence for reserve stands (dean spots). Raise to reduce false Reserved slots.">
          <NumInput val={cfg.conf_cls2??0.45} min={0.05} max={0.95} step={0.05}
            onChange={v=>setCfg(p=>({...p,conf_cls2:Math.round(v*100)/100}))}/>
        </Row>
        <Row label="IoU Threshold" hint="Overlap fraction required to mark a slot occupied. Lower = easier to trigger occupied. Raise if false occupancy.">
          <NumInput val={cfg.iou_threshold} min={0.1} max={0.9} step={0.05}
            onChange={v=>setCfg(p=>({...p,iou_threshold:Math.round(v*100)/100}))}/>
        </Row>
        <Row label="Smoothing Window" hint="Frames for majority-vote smoothing. Higher = more stable but slower to react to changes. 1 = no smoothing.">
          <NumInput val={cfg.smoothing_win} min={1} max={30} step={1}
            onChange={v=>setCfg(p=>({...p,smoothing_win:v}))}/>
        </Row>
        <div style={{display:"flex",gap:10,marginTop:20}}>
          <button onClick={apply} disabled={saving||piOffline}
            style={{flex:2,padding:"11px",borderRadius:10,border:"none",cursor:saving||piOffline?"not-allowed":"pointer",fontFamily:C.sans,fontWeight:700,fontSize:13,background:piOffline?`rgba(0,0,0,.05)`:`linear-gradient(135deg,${C.accent},${C.purple})`,color:piOffline?C.muted:"#fff",opacity:saving?.7:1,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
            {saving?<><span style={{width:14,height:14,border:"2px solid rgba(255,255,255,.3)",borderTopColor:"#fff",borderRadius:"50%",animation:"spin .8s linear infinite",display:"inline-block"}}/>Saving...</>:"💾 Apply to Pi"}
          </button>
          <button onClick={reset} disabled={piOffline}
            style={{flex:1,padding:"11px",borderRadius:10,border:`1px solid ${C.border}`,cursor:piOffline?"not-allowed":"pointer",fontFamily:C.sans,fontWeight:700,fontSize:13,background:"rgba(0,0,0,.03)",color:C.muted}}>
            ↺ Defaults
          </button>
        </div>
      </Card>

      <div style={{padding:"10px 14px",borderRadius:10,background:"rgba(245,166,35,.07)",border:`1px solid rgba(245,166,35,.2)`,fontFamily:C.mono,fontSize:10,color:C.muted,lineHeight:1.8}}>
        ℹ️ Changes apply within 5 seconds without restarting. For fastest testing set <strong style={{color:C.text}}>Interval=0, YOLO Every=1</strong>. To reduce Pi CPU load raise Interval or YOLO Every N.
      </div>
    </div>
  );
}

// ── Distortion Panel ──────────────────────────────────────────────────────────
function DistortionPanel({piStatus, addLog}){
  const DEFAULTS = {enabled:false, k1:-0.3, k2:0.1, alpha:0.0};
  const [cfg, setCfg]               = useState(DEFAULTS);
  const [saving, setSaving]         = useState(false);
  const [calibrating, setCalib]     = useState(false);
  const [previewing, setPrev]       = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [msg, setMsg]               = useState(null);
  const piOffline = piStatus !== "online";

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(()=>{
    if(piOffline){ return; }
    fetch(`${PI_API_URL}/undistort-config`,{signal:AbortSignal.timeout(4000)})
      .then(r=>r.json())
      .then(d=>{ setCfg(d); })
      .catch(()=>{});
  },[]);

  const showMsg = (text, ok=true) => {
    setMsg({text, ok});
    setTimeout(()=>setMsg(null), 6000);
  };

  const postConfig = async (newCfg) => {
    await fetch(`${PI_API_URL}/undistort-config`,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify(newCfg),
      signal: AbortSignal.timeout(5000),
    });
  };

  const handleToggle = async () => {
    if(piOffline || saving || calibrating) return;
    const enabling = !cfg.enabled;

    if(enabling){
      setCalib(true);
      showMsg("Running auto-calibration — detecting line straightness...", true);
      try {
        const r = await fetch(`${PI_API_URL}/undistort-autocal`,{
          method:"POST",
          signal: AbortSignal.timeout(30000),
        });
        const d = await r.json();
        if(d.error) throw new Error(d.error);
        const newCfg = {...d.config};
        setCfg(newCfg);
        showMsg(`✨ Auto-calibrated! k1=${newCfg.k1}, k2=${newCfg.k2} — applied to Pi (${d.lines_found} lines analysed)`);
        addLog(`[DISTORT] Auto-cal complete — k1=${newCfg.k1} k2=${newCfg.k2} score=${d.score} lines=${d.lines_found}`,"sys");
      } catch(e){
        const fallback = {...DEFAULTS, enabled:true};
        setCfg(fallback);
        await postConfig(fallback).catch(()=>{});
        showMsg(`Auto-cal failed (${e.message}) — using defaults k1=-0.3 k2=0.1`, false);
        addLog(`[DISTORT] Auto-cal failed: ${e.message} — using defaults`,"error");
      } finally { setCalib(false); }
    } else {
      setSaving(true);
      const resetCfg = {...DEFAULTS, enabled:false};
      setCfg(resetCfg);
      try {
        await postConfig(resetCfg);
        showMsg("Distortion correction disabled and reset to defaults.");
        addLog("[DISTORT] Disabled — reset to defaults","sys");
      } catch(e){
        showMsg(`Failed to disable: ${e.message}`, false);
      } finally { setSaving(false); }
    }
  };

  const applyConfig = async () => {
    if(saving||piOffline) return;
    setSaving(true);
    try {
      await postConfig(cfg);
      showMsg("Config applied to Pi.");
      addLog(`[DISTORT] Manual apply — k1:${cfg.k1} k2:${cfg.k2} alpha:${cfg.alpha}`,"sys");
    } catch(e){
      showMsg(`Failed to save: ${e.message}`, false);
      addLog(`[DISTORT] Save failed: ${e.message}`,"error");
    } finally { setSaving(false); }
  };

  const fetchPreview = async () => {
    if(previewing||piOffline) return;
    setPrev(true);
    setPreviewUrl(null);
    try {
      const res = await fetch(`${PI_API_URL}/undistort-preview?t=${Date.now()}`,{signal:AbortSignal.timeout(10000)});
      if(!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      setPreviewUrl(prev=>{ if(prev) URL.revokeObjectURL(prev); return url; });
      addLog("[DISTORT] Preview fetched","sys");
    } catch(e){
      showMsg(`Preview failed: ${e.message}`, false);
    } finally { setPrev(false); }
  };

  const busy = saving || calibrating;

  const Slider = ({label, value, min, max, step, onChange, unit=""}) => (
    <div style={{marginBottom:18}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
        <span style={{fontFamily:C.mono,fontSize:12,color:C.muted}}>{label}</span>
        <span style={{fontFamily:C.mono,fontSize:13,fontWeight:700,color:C.accent}}>{value}{unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e=>onChange(parseFloat(e.target.value))}
        disabled={piOffline||!cfg.enabled}
        style={{width:"100%",accentColor:C.accent,cursor:piOffline||!cfg.enabled?"not-allowed":"pointer",height:4}}/>
      <div style={{display:"flex",justifyContent:"space-between",marginTop:3}}>
        <span style={{fontFamily:C.mono,fontSize:9,color:"rgba(0,0,0,.3)"}}>{min}{unit}</span>
        <span style={{fontFamily:C.mono,fontSize:9,color:"rgba(0,0,0,.3)"}}>{max}{unit}</span>
      </div>
    </div>
  );

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      {piOffline&&(
        <div style={{padding:"12px 16px",borderRadius:10,background:`${C.occ}12`,border:`1px solid ${C.occ}33`,fontFamily:C.mono,fontSize:11,color:C.occ}}>
          ⚠️ Pi is offline — connect Pi to adjust distortion settings.
        </div>
      )}
      {msg&&(
        <div style={{padding:"10px 14px",borderRadius:10,background:msg.ok?`${C.vac}12`:`${C.occ}12`,border:`1px solid ${msg.ok?C.vac+"33":C.occ+"33"}`,fontFamily:C.mono,fontSize:11,color:msg.ok?C.vac:C.occ,animation:"fadeUp .2s ease"}}>
          {msg.ok?"✅":"⚠️"} {msg.text}
        </div>
      )}

      <Card style={{padding:20}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
          <div>
            <div style={{fontFamily:C.sans,fontWeight:700,fontSize:15}}>Barrel Distortion Correction</div>
            <div style={{fontFamily:C.mono,fontSize:10,color:C.muted,marginTop:3}}>
              {calibrating
                ? "🔄 Auto-calibrating — analysing line straightness..."
                : cfg.enabled
                ? "Enabled — values auto-calibrated from live frame"
                : "Toggle on to auto-calibrate from live frame"}
            </div>
          </div>
          <div onClick={handleToggle}
            style={{display:"flex",alignItems:"center",gap:8,cursor:busy||piOffline?"not-allowed":"pointer",opacity:piOffline?.5:1}}>
            <span style={{fontFamily:C.mono,fontSize:11,color:calibrating?C.warn:cfg.enabled?C.vac:C.muted}}>
              {calibrating?"Calibrating...":(cfg.enabled?"Enabled":"Disabled")}
            </span>
            <div style={{width:42,height:24,borderRadius:12,
              background:calibrating?C.warn:cfg.enabled?C.vac:"rgba(0,0,0,.08)",
              border:`1px solid ${calibrating?C.warn+"66":cfg.enabled?C.vac+"66":C.border}`,
              position:"relative",transition:"all .25s",opacity:busy?.6:1}}>
              {calibrating
                ? <div style={{position:"absolute",top:4,left:13,width:16,height:16,border:`2px solid rgba(255,255,255,.3)`,borderTopColor:"#fff",borderRadius:"50%",animation:"spin .8s linear infinite"}}/>
                : <div style={{position:"absolute",top:3,left:cfg.enabled?20:3,width:16,height:16,borderRadius:"50%",background:"#fff",transition:"left .25s",boxShadow:"0 1px 4px rgba(0,0,0,.4)"}}/>
              }
            </div>
          </div>
        </div>

        <div style={{opacity:cfg.enabled?1:.4,transition:"opacity .3s"}}>
          <div style={{fontFamily:C.mono,fontSize:10,color:C.muted,marginBottom:14,padding:"8px 12px",borderRadius:8,background:"rgba(0,0,0,.03)",border:`1px solid ${C.border}`}}>
            💡 Values below are auto-calibrated. Fine-tune manually then click <strong style={{color:C.text}}>Apply</strong> if needed.
          </div>
          <Slider label="k1 — Primary radial distortion" value={cfg.k1} min={-0.8} max={0.0} step={0.05}
            onChange={v=>setCfg(p=>({...p,k1:v}))}/>
          <Slider label="k2 — Secondary radial distortion" value={cfg.k2} min={0.0} max={0.3} step={0.01}
            onChange={v=>setCfg(p=>({...p,k2:v}))}/>
          <Slider label="Alpha — 0.0 crops black edges, 1.0 keeps full frame" value={cfg.alpha} min={0.0} max={1.0} step={0.1}
            onChange={v=>setCfg(p=>({...p,alpha:v}))}/>
        </div>

        <div style={{display:"flex",gap:10,marginTop:4}}>
          <button onClick={applyConfig} disabled={busy||piOffline||!cfg.enabled}
            style={{flex:1,padding:"11px",borderRadius:10,border:"none",
              cursor:busy||piOffline||!cfg.enabled?"not-allowed":"pointer",
              fontFamily:C.sans,fontWeight:700,fontSize:13,
              background:piOffline||!cfg.enabled?`rgba(0,0,0,.05)`:`linear-gradient(135deg,${C.accent},${C.purple})`,
              color:piOffline||!cfg.enabled?C.muted:"#fff",opacity:saving?.7:1,
              display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
            {saving?<><span style={{width:14,height:14,border:"2px solid rgba(255,255,255,.3)",borderTopColor:"#fff",borderRadius:"50%",animation:"spin .8s linear infinite",display:"inline-block"}}/>Saving...</>:"💾 Apply Manual Tweaks"}
          </button>
          <button onClick={fetchPreview} disabled={previewing||piOffline}
            style={{flex:1,padding:"11px",borderRadius:10,border:`1px solid ${piOffline?C.border:C.vac+"44"}`,
              cursor:previewing||piOffline?"not-allowed":"pointer",fontFamily:C.sans,fontWeight:700,fontSize:13,
              background:piOffline?"rgba(0,0,0,.03)":`${C.vac}12`,color:piOffline?C.muted:C.vac,
              opacity:previewing?.7:1,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
            {previewing?<><span style={{width:14,height:14,border:`2px solid ${C.vac}44`,borderTopColor:C.vac,borderRadius:"50%",animation:"spin .8s linear infinite",display:"inline-block"}}/>Fetching...</>:"🔍 Preview"}
          </button>
        </div>
      </Card>

      <Card style={{padding:16}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
          <span style={{fontFamily:C.sans,fontWeight:700,fontSize:14}}>Before / After Preview</span>
          <span style={{fontFamily:C.mono,fontSize:10,color:C.muted,marginLeft:4}}>— left: original · right: corrected</span>
        </div>
        {previewUrl?(
          <img src={previewUrl} alt="distortion preview"
            style={{width:"100%",borderRadius:10,display:"block",border:`1px solid ${C.border}`}}/>
        ):(
          <div style={{height:180,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:10,background:"rgba(0,0,0,.3)",borderRadius:10,border:`1px dashed ${C.border}`}}>
            <span style={{fontSize:32}}>🔍</span>
            <div style={{fontFamily:C.mono,fontSize:11,color:C.muted,textAlign:"center",lineHeight:1.7}}>
              {piOffline?"Pi is offline — no preview available":"Click Preview to fetch a live frame from the Pi"}
            </div>
          </div>
        )}
      </Card>

      <div style={{padding:"10px 14px",borderRadius:10,background:"rgba(245,166,35,.07)",border:`1px solid rgba(245,166,35,.2)`,fontFamily:C.mono,fontSize:10,color:C.muted,lineHeight:1.8}}>
        ℹ️ <strong style={{color:C.accent}}>How it works:</strong> Toggle ON → Pi analyses line straightness in the live frame → best k1/k2 values are found automatically and applied → sliders update to reflect the calibrated values. Toggle OFF → immediately resets and disables.
        <br/>For best results make sure the camera can see straight parking lot lines or edges before calibrating.
      </div>
    </div>
  );
}

// ── Driver UI Settings Panel ──────────────────────────────────────────────────
// Reads and writes /settings/showSelectedBox in Firebase via REST so the Driver
// Interface can conditionally render the Selected Box card without a page reload.
function DriverUISettingsPanel(){
  const [showSelectedBox, setShowSelectedBox] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [msg,    setMsg]      = useState(null);

  useEffect(()=>{
    fetch(`${FIREBASE_URL}/settings.json`,{signal:AbortSignal.timeout(4000)})
      .then(r=>r.ok?r.json():null)
      .then(d=>{ if(d && typeof d.showSelectedBox==="boolean") setShowSelectedBox(d.showSelectedBox); })
      .catch(()=>{});
  },[]);

  const showMsg = (text,ok=true)=>{ setMsg({text,ok}); setTimeout(()=>setMsg(null),4000); };

  const save = async (val)=>{
    if(saving) return;
    setSaving(true);
    setShowSelectedBox(val);
    try{
      const r = await fetch(`${FIREBASE_URL}/settings.json`,{
        method:"PATCH",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({showSelectedBox:val}),
        signal:AbortSignal.timeout(5000),
      });
      if(!r.ok) throw new Error(`HTTP ${r.status}`);
      showMsg(`Selected Box card ${val?"shown":"hidden"} in Driver UI.`);
    }catch(e){
      showMsg(`Save failed: ${e.message}`,false);
      setShowSelectedBox(!val); // revert
    }finally{ setSaving(false); }
  };

  return(
    <Card style={{padding:"4px 20px 20px",marginTop:4}}>
      <div style={{fontFamily:C.sans,fontWeight:700,fontSize:13,color:C.muted,textTransform:"uppercase",letterSpacing:"0.08em",marginTop:18,marginBottom:14}}>
        Driver UI Settings
      </div>
      {msg&&(
        <div style={{marginBottom:12,padding:"10px 14px",borderRadius:10,background:msg.ok?`${C.vac}12`:`${C.occ}12`,border:`1px solid ${msg.ok?C.vac+"33":C.occ+"33"}`,fontFamily:C.mono,fontSize:11,color:msg.ok?C.vac:C.occ,animation:"fadeUp .2s ease"}}>
          {msg.ok?"✅":"⚠️"} {msg.text}
        </div>
      )}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 0",borderBottom:`1px solid ${C.border}`}}>
        <div style={{flex:1,paddingRight:20}}>
          <div style={{fontFamily:C.mono,fontSize:12,color:C.text,fontWeight:600}}>Show Selected Box Card</div>
          <div style={{fontFamily:C.mono,fontSize:10,color:C.muted,marginTop:3,lineHeight:1.5}}>
            When ON, drivers can click a parking slot to view details and manually override its status.
            Toggle OFF to hide the card entirely from the Driver Interface.
          </div>
        </div>
        <div onClick={()=>!saving&&save(!showSelectedBox)}
          style={{display:"flex",alignItems:"center",gap:8,cursor:saving?"not-allowed":"pointer",flexShrink:0}}>
          <span style={{fontFamily:C.mono,fontSize:11,color:showSelectedBox?C.vac:C.muted}}>
            {showSelectedBox?"Visible":"Hidden"}
          </span>
          <div style={{width:42,height:24,borderRadius:12,
            background:showSelectedBox?C.vac:"rgba(0,0,0,.08)",
            border:`1px solid ${showSelectedBox?C.vac+"66":C.border}`,
            position:"relative",transition:"all .25s",opacity:saving?.6:1}}>
            {saving
              ? <div style={{position:"absolute",top:4,left:13,width:16,height:16,border:`2px solid rgba(255,255,255,.3)`,borderTopColor:"#fff",borderRadius:"50%",animation:"spin .8s linear infinite"}}/>
              : <div style={{position:"absolute",top:3,left:showSelectedBox?20:3,width:16,height:16,borderRadius:"50%",background:"#fff",transition:"left .25s",boxShadow:"0 1px 4px rgba(0,0,0,.4)"}}/>
            }
          </div>
        </div>
      </div>
      <div style={{marginTop:14,padding:"10px 14px",borderRadius:10,background:"rgba(245,166,35,.07)",border:`1px solid rgba(245,166,35,.2)`,fontFamily:C.mono,fontSize:10,color:C.muted,lineHeight:1.8}}>
        ℹ️ The toggle syncs instantly to Firebase. The Driver Interface picks up the change within 5 seconds without a reload.
      </div>
    </Card>
  );
}

// ── Remap Wizard ──────────────────────────────────────────────────────────────
// Multi-step overlay: Step 1 = choose row guide method, Step 2 = draw guide lines
// on a live-frame snapshot (manual only), Step 3 = layout mode + confirm.
function RemapWizard({ piStatus, addLog, onClose }) {
  const [step,        setStep]        = useState(1);          // 1 | 2 | 3 | 4 | 5
  const [guideMethod, setGuideMethod] = useState("auto");     // "manual" | "auto"
  const [layoutMode,  setLayoutMode]  = useState("auto");
  const [rowLines,    setRowLines]    = useState([]);         // [{id, y}] in camera px
  const [remapping,   setRemapping]   = useState(false);
  const [remapMsg,    setRemapMsg]    = useState(null);
  const [statusData,  setStatusData]  = useState({ mapping_phase: true, frame_count: 0, slots_loaded: 0 });
  const [aiPhase,     setAiPhase]     = useState("idle");     // "idle"|"generating"|"review"|"error"
  const [aiSlotCount, setAiSlotCount] = useState(0);
  const [aiSlots,     setAiSlots]     = useState({});
  const [aiError,     setAiError]     = useState("");
  const [aiImageTs,   setAiImageTs]   = useState(0);
  const canvasRef = useRef(null);
  const frameImg  = useRef(null);    // HTMLImageElement holding the live-frame snapshot
  const dragRef   = useRef(null);    // {lineId} while dragging a line

  const LAYOUT_MODES = [
    {id:"horizontal", label:"Horizontal", hint:"Rows of slots side by side"},
    {id:"vertical",   label:"Vertical",   hint:"Columns of slots stacked"},
    {id:"grid",       label:"Grid",       hint:"Both rows and columns"},
    {id:"auto",       label:"Auto",       hint:"Detect orientation from data"},
  ];

  // ── Fetch snapshot when entering step 2 ─────────────────────────────────────
  useEffect(() => {
    if (step !== 2) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.onload = () => {
      frameImg.current = img;
      redraw(ctx, canvas.width, canvas.height, img, rowLines);
    };
    img.onerror = () => {
      ctx.fillStyle = "#0a0e1a";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#94a3b8";
      ctx.font = "14px monospace";
      ctx.textAlign = "center";
      ctx.fillText("Could not load live frame", canvas.width / 2, canvas.height / 2);
    };
    img.src = `${PI_API_URL}/live-frame?t=${Date.now()}`;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // ── Redraw canvas whenever lines change ──────────────────────────────────────
  useEffect(() => {
    if (step !== 2) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    redraw(ctx, canvas.width, canvas.height, frameImg.current, rowLines);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowLines, step]);

  // ── Poll /status and /ai-mapping/status while in steps 4-5 ──────────────────
  useEffect(() => {
    if (step < 4) return;
    const pollId = setInterval(async () => {
      try {
        const [sr, ar] = await Promise.all([
          fetch(`${PI_API_URL}/status`,            { signal: AbortSignal.timeout(3000) }),
          fetch(`${PI_API_URL}/ai-mapping/status`, { signal: AbortSignal.timeout(3000) }),
        ]);
        const sd = await sr.json();
        const ad = await ar.json();
        setStatusData(sd);
        setAiPhase(ad.phase);
        setAiSlotCount(ad.proposed_slot_count || 0);
        setAiError(ad.error || "");
      } catch {}
    }, 3000);
    return () => clearInterval(pollId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // ── Advance to step 5 + fetch proposed slots when AI review is ready ─────────
  useEffect(() => {
    if (aiPhase !== "review") return;
    setStep(5);
    setAiImageTs(Date.now());
    fetch(`${PI_API_URL}/ai-mapping/proposed-slots`, { signal: AbortSignal.timeout(5000) })
      .then(r => r.json()).then(setAiSlots).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiPhase]);

  const redraw = (ctx, W, H, img, lines) => {
    ctx.clearRect(0, 0, W, H);
    if (img) {
      ctx.drawImage(img, 0, 0, W, H);
    } else {
      ctx.fillStyle = "#0a0e1a";
      ctx.fillRect(0, 0, W, H);
    }
    lines.forEach((line, idx) => {
      const cy = (line.y / CAM_H) * H;
      ctx.save();
      ctx.strokeStyle = "#facc15";
      ctx.lineWidth   = 2;
      ctx.setLineDash([10, 6]);
      ctx.beginPath();
      ctx.moveTo(0, cy);
      ctx.lineTo(W, cy);
      ctx.stroke();
      ctx.setLineDash([]);
      // Label pill
      const label = `Row ${String.fromCharCode(65 + idx)}`;
      ctx.fillStyle = "rgba(0,0,0,.65)";
      ctx.beginPath();
      ctx.roundRect(6, cy - 14, 56, 20, 4);
      ctx.fill();
      ctx.fillStyle = "#facc15";
      ctx.font = "bold 11px monospace";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(label, 10, cy);
      // Drag handle (circle at right edge)
      ctx.beginPath();
      ctx.arc(W - 14, cy, 7, 0, Math.PI * 2);
      ctx.fillStyle = "#facc15";
      ctx.fill();
      ctx.restore();
    });
  };

  const canvasToY = (e) => {
    const canvas = canvasRef.current;
    const rect   = canvas.getBoundingClientRect();
    const scaleY = canvas.height / rect.height;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const canvasY = (clientY - rect.top) * scaleY;
    return Math.round((canvasY / canvas.height) * CAM_H);
  };

  const onCanvasMouseDown = (e) => {
    const y = canvasToY(e);
    // Check if clicking near an existing line (within 12px in canvas space)
    const canvas = canvasRef.current;
    const scaleY = canvas.height / canvas.getBoundingClientRect().height;
    const tolY   = (12 / scaleY) * (CAM_H / canvas.height);
    const hit    = rowLines.find(l => Math.abs(l.y - y) < tolY);
    if (hit) {
      dragRef.current = hit.id;
    } else {
      if (rowLines.length >= 6) return;
      const newLine = { id: Date.now(), y };
      setRowLines(prev => [...prev, newLine].sort((a, b) => a.y - b.y));
    }
  };

  const onCanvasMouseMove = (e) => {
    if (!dragRef.current) return;
    const y = canvasToY(e);
    setRowLines(prev =>
      [...prev.map(l => l.id === dragRef.current ? { ...l, y } : l)]
        .sort((a, b) => a.y - b.y)
    );
  };

  const onCanvasMouseUp = () => { dragRef.current = null; };

  const triggerRemap = async () => {
    if (remapping) return;
    setRemapping(true);
    setRemapMsg(null);
    try {
      const body = {
        layout_mode: layoutMode,
        row_guides:  guideMethod === "manual" ? rowLines.map(l => l.y) : [],
      };
      const r = await fetch(`${PI_API_URL}/remap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
      });
      await r.json();
      const modeLabel = LAYOUT_MODES.find(m => m.id === layoutMode)?.label ?? layoutMode;
      const guideInfo = guideMethod === "manual" && rowLines.length > 0
        ? ` with ${rowLines.length} row guide(s)`
        : " (auto row detection)";
      addLog(`[ADMIN] Remap triggered — ${modeLabel} mode${guideInfo}.`, "sys");
      setStep(4);
    } catch (e) {
      setRemapMsg({ ok: false, text: `Remap failed: ${e.message}` });
    } finally {
      setRemapping(false);
    }
  };

  const triggerAiGenerate = async () => {
    setAiPhase("generating");
    setStep(5);
    try {
      await fetch(`${PI_API_URL}/ai-mapping/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(8000),
      });
      addLog("[AI] Nano Banana Pro generation started.", "sys");
    } catch (e) {
      setAiPhase("error");
      setAiError(e.message);
    }
  };

  const confirmAiSlots = async () => {
    try {
      const r = await fetch(`${PI_API_URL}/ai-mapping/confirm`, {
        method: "POST",
        signal: AbortSignal.timeout(8000),
      });
      const d = await r.json();
      addLog(`[AI] Confirmed ${d.saved} AI-generated slots (total ${d.total}).`, "sys");
      onClose();
    } catch (e) {
      setAiError(e.message);
    }
  };

  const rejectAiSlots = async () => {
    try {
      await fetch(`${PI_API_URL}/ai-mapping/reject`, {
        method: "POST",
        signal: AbortSignal.timeout(5000),
      });
    } catch {}
    addLog("[AI] AI slot generation rejected — keeping original auto-mapped slots.", "sys");
    onClose();
  };

  const CARD_STYLE = {
    background: C.card,
    border: `1.5px solid ${C.border}`,
    borderRadius: 14,
    padding: 20,
    cursor: "pointer",
    transition: "all .15s",
    flex: 1,
  };
  const SELECTED_CARD = (active) => active
    ? { ...CARD_STYLE, border: `2px solid ${C.purple}`, background: `${C.purple}0f` }
    : CARD_STYLE;

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.75)", display:"flex",
      alignItems:"center", justifyContent:"center", zIndex:1000, backdropFilter:"blur(6px)" }}>
      <div style={{ background: C.card, border: `1.5px solid ${C.border}`, borderRadius: 20,
        width: step === 2 || step === 5 ? "min(92vw, 860px)" : "min(92vw, 500px)",
        maxHeight: "92vh", overflowY: "auto",
        display:"flex", flexDirection:"column", gap:0, animation:"fadeUp .2s ease" }}>

        {/* Header */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
          padding:"16px 20px", borderBottom:`1px solid ${C.border}` }}>
          <div>
            <div style={{ fontFamily:C.sans, fontWeight:800, fontSize:15 }}>
              🔄 Remap Slots
            </div>
            <div style={{ fontFamily:C.mono, fontSize:10, color:C.muted, marginTop:2 }}>
              {(() => {
                const labels = ["Choose row guide method","Draw row guide lines","Choose layout & confirm","Mapping in progress","Review AI slots"];
                const total  = guideMethod === "auto" ? 4 : 5;
                const num    = guideMethod === "auto"
                  ? (step <= 1 ? 1 : step === 3 ? 2 : step === 4 ? 3 : 4)
                  : step;
                return `Step ${num} of ${total} — ${labels[step - 1] ?? ""}`;
              })()}
            </div>
          </div>
          <button onClick={onClose} style={{ background:"none", border:"none", fontSize:20,
            color:C.muted, cursor:"pointer", padding:"2px 6px" }}>✕</button>
        </div>

        {/* Step indicator */}
        <div style={{ display:"flex", gap:4, padding:"12px 20px 0" }}>
          {[1,2,3,4,5].filter(s => guideMethod === "auto" ? s !== 2 : true).map(s => (
            <div key={s} style={{ flex:1, height:3, borderRadius:2,
              background: s <= step ? C.purple : "rgba(0,0,0,.08)" }}/>
          ))}
        </div>

        <div style={{ padding: 20, display:"flex", flexDirection:"column", gap:16 }}>

          {/* ── Step 1: choose method ─────────────────────────────────────────── */}
          {step === 1 && (
            <>
              <div style={{ fontFamily:C.sans, fontWeight:700, fontSize:14 }}>
                How should parking rows be identified?
              </div>
              <div style={{ display:"flex", gap:12 }}>
                {[
                  { id:"manual", icon:"✏️", title:"Draw row lines",
                    desc:"You drag yellow lines on the camera frame to mark each row boundary." },
                  { id:"auto",   icon:"🤖", title:"Auto-detect",
                    desc:"The API figures out row positions from the vehicle clustering data." },
                ].map(opt => (
                  <div key={opt.id} onClick={() => setGuideMethod(opt.id)}
                    style={SELECTED_CARD(guideMethod === opt.id)}>
                    <div style={{ fontSize:24, marginBottom:8 }}>{opt.icon}</div>
                    <div style={{ fontFamily:C.sans, fontWeight:700, fontSize:13,
                      color: guideMethod === opt.id ? C.purple : C.text, marginBottom:6 }}>
                      {opt.title}
                    </div>
                    <div style={{ fontFamily:C.mono, fontSize:10, color:C.muted, lineHeight:1.6 }}>
                      {opt.desc}
                    </div>
                    {guideMethod === opt.id && (
                      <div style={{ marginTop:10, width:16, height:16, borderRadius:"50%",
                        background:C.purple, display:"flex", alignItems:"center",
                        justifyContent:"center", color:"#fff", fontSize:10, fontWeight:700 }}>✓</div>
                    )}
                  </div>
                ))}
              </div>
              <button onClick={() => setStep(guideMethod === "manual" ? 2 : 3)}
                style={{ padding:"11px", borderRadius:10, border:"none", cursor:"pointer",
                  background:`linear-gradient(135deg,${C.purple},${C.accent})`,
                  color:"#fff", fontFamily:C.sans, fontWeight:700, fontSize:13 }}>
                Next →
              </button>
            </>
          )}

          {/* ── Step 2: draw row lines ────────────────────────────────────────── */}
          {step === 2 && (
            <>
              <div style={{ fontFamily:C.sans, fontWeight:700, fontSize:14 }}>
                Draw row guide lines
              </div>
              <div style={{ fontFamily:C.mono, fontSize:10, color:C.muted, lineHeight:1.7 }}>
                Click on the image to place a yellow row line. Drag a line to reposition it.
                Each line marks the centre of a parking row. Max 6 lines.
              </div>
              <div style={{ position:"relative", borderRadius:10, overflow:"hidden",
                border:`1.5px solid ${C.border}` }}>
                <canvas ref={canvasRef} width={1280} height={720}
                  style={{ width:"100%", display:"block", cursor:"crosshair" }}
                  onMouseDown={onCanvasMouseDown}
                  onMouseMove={onCanvasMouseMove}
                  onMouseUp={onCanvasMouseUp}
                  onMouseLeave={onCanvasMouseUp}
                  onTouchStart={onCanvasMouseDown}
                  onTouchMove={onCanvasMouseMove}
                  onTouchEnd={onCanvasMouseUp}
                />
                {rowLines.length === 0 && (
                  <div style={{ position:"absolute", inset:0, display:"flex",
                    alignItems:"center", justifyContent:"center", pointerEvents:"none" }}>
                    <div style={{ background:"rgba(0,0,0,.6)", borderRadius:10,
                      padding:"10px 18px", fontFamily:C.mono, fontSize:11, color:"#facc15" }}>
                      Click anywhere to add a row line
                    </div>
                  </div>
                )}
              </div>
              <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
                <button onClick={() => {
                  const mid = Math.round(CAM_H / 2);
                  setRowLines(prev => prev.length < 6
                    ? [...prev, { id: Date.now(), y: mid }].sort((a,b)=>a.y-b.y)
                    : prev);
                }} disabled={rowLines.length >= 6}
                  style={{ padding:"6px 14px", borderRadius:8, border:`1px solid ${C.accent}44`,
                    background:`${C.accent}15`, color:C.accent, fontFamily:C.mono, fontSize:11,
                    fontWeight:700, cursor:rowLines.length>=6?"not-allowed":"pointer" }}>
                  + Add Line
                </button>
                <button onClick={() => setRowLines([])}
                  style={{ padding:"6px 14px", borderRadius:8, border:`1px solid ${C.occ}44`,
                    background:`${C.occ}12`, color:C.occ, fontFamily:C.mono, fontSize:11,
                    fontWeight:700, cursor:"pointer" }}>
                  Clear All
                </button>
                <span style={{ fontFamily:C.mono, fontSize:10, color:C.muted, marginLeft:"auto" }}>
                  {rowLines.length}/6 lines
                </span>
              </div>
              {rowLines.length > 0 && (
                <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                  {rowLines.map((l, i) => (
                    <div key={l.id} style={{ display:"flex", alignItems:"center", gap:6,
                      padding:"4px 10px", borderRadius:20, background:"rgba(250,204,21,.12)",
                      border:"1px solid rgba(250,204,21,.35)", fontFamily:C.mono, fontSize:10 }}>
                      <span style={{ color:"#facc15", fontWeight:700 }}>
                        Row {String.fromCharCode(65+i)}
                      </span>
                      <span style={{ color:C.muted }}>y={l.y}px</span>
                      <button onClick={() => setRowLines(prev => prev.filter(x => x.id !== l.id))}
                        style={{ background:"none", border:"none", color:C.muted, cursor:"pointer",
                          fontSize:12, lineHeight:1, padding:"0 2px" }}>✕</button>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display:"flex", gap:8 }}>
                <button onClick={() => setStep(1)}
                  style={{ flex:1, padding:"10px", borderRadius:10,
                    border:`1px solid ${C.border}`, background:"transparent",
                    color:C.muted, fontFamily:C.sans, fontWeight:700, fontSize:13, cursor:"pointer" }}>
                  ← Back
                </button>
                <button onClick={() => setStep(3)}
                  style={{ flex:2, padding:"10px", borderRadius:10, border:"none", cursor:"pointer",
                    background:`linear-gradient(135deg,${C.purple},${C.accent})`,
                    color:"#fff", fontFamily:C.sans, fontWeight:700, fontSize:13 }}>
                  Next →
                </button>
              </div>
            </>
          )}

          {/* ── Step 3: layout mode + confirm ────────────────────────────────── */}
          {step === 3 && (
            <>
              <div style={{ fontFamily:C.sans, fontWeight:700, fontSize:14 }}>
                Choose slot layout mode
              </div>
              {/* Summary of row guide choice */}
              <div style={{ padding:"10px 14px", borderRadius:10,
                background: guideMethod==="manual"&&rowLines.length>0
                  ? "rgba(250,204,21,.1)" : "rgba(124,58,237,.08)",
                border:`1px solid ${guideMethod==="manual"&&rowLines.length>0
                  ? "rgba(250,204,21,.3)" : "rgba(124,58,237,.25)"}`,
                fontFamily:C.mono, fontSize:11, color:C.muted }}>
                {guideMethod==="manual"&&rowLines.length>0
                  ? `✏️ ${rowLines.length} manual row guide${rowLines.length>1?"s":""} set`
                  : "🤖 Row guides will be auto-detected"}
              </div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                {LAYOUT_MODES.map(m => (
                  <button key={m.id} onClick={() => setLayoutMode(m.id)} title={m.hint}
                    style={{ padding:"8px 16px", borderRadius:8, border:`1.5px solid ${layoutMode===m.id?C.purple+"55":C.border}`,
                      background:layoutMode===m.id?`${C.purple}15`:"transparent",
                      color:layoutMode===m.id?C.purple:C.muted,
                      fontFamily:C.mono, fontSize:11, fontWeight:700, cursor:"pointer",
                      transition:"all .15s" }}>
                    {m.label}
                  </button>
                ))}
              </div>
              <div style={{ fontFamily:C.mono, fontSize:10, color:C.muted,
                padding:"8px 12px", borderRadius:8, background:"rgba(0,0,0,.04)" }}>
                {LAYOUT_MODES.find(m=>m.id===layoutMode)?.hint}
              </div>
              {remapMsg && (
                <div style={{ padding:"10px 14px", borderRadius:10,
                  background:remapMsg.ok?`${C.vac}12`:`${C.occ}12`,
                  border:`1px solid ${remapMsg.ok?C.vac+"33":C.occ+"33"}`,
                  fontFamily:C.mono, fontSize:11, color:remapMsg.ok?C.vac:C.occ,
                  animation:"fadeUp .2s ease" }}>
                  {remapMsg.ok?"✅":"⚠️"} {remapMsg.text}
                </div>
              )}
              <div style={{ display:"flex", gap:8 }}>
                <button onClick={() => setStep(guideMethod==="manual" ? 2 : 1)}
                  style={{ flex:1, padding:"10px", borderRadius:10,
                    border:`1px solid ${C.border}`, background:"transparent",
                    color:C.muted, fontFamily:C.sans, fontWeight:700, fontSize:13, cursor:"pointer" }}>
                  ← Back
                </button>
                <button onClick={triggerRemap} disabled={remapping||piStatus!=="online"}
                  style={{ flex:2, padding:"10px", borderRadius:10, border:"none",
                    cursor:remapping||piStatus!=="online"?"not-allowed":"pointer",
                    background:piStatus!=="online"?`${C.border}`:`linear-gradient(135deg,${C.purple},${C.accent})`,
                    color:piStatus!=="online"?C.muted:"#fff",
                    fontFamily:C.sans, fontWeight:700, fontSize:13,
                    display:"flex", alignItems:"center", justifyContent:"center", gap:8,
                    opacity:remapping?.7:1 }}>
                  {remapping
                    ? <><span style={{ width:14, height:14, border:`2px solid rgba(255,255,255,.3)`,
                        borderTopColor:"#fff", borderRadius:"50%",
                        animation:"spin .8s linear infinite", display:"inline-block" }}/>Remapping…</>
                    : "🔄 Start Remapping"}
                </button>
              </div>
            </>
          )}

          {/* ── Step 4: Mapping in progress ──────────────────────────────────── */}
          {step === 4 && (
            <>
              <div style={{ fontFamily:C.sans, fontWeight:700, fontSize:14 }}>
                Auto-mapping in progress
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:12,
                padding:"12px 14px", borderRadius:10,
                background: statusData.mapping_phase ? "rgba(124,58,237,.07)" : `${C.vac}12`,
                border:`1px solid ${statusData.mapping_phase ? C.purple+"33" : C.vac+"44"}` }}>
                {statusData.mapping_phase ? (
                  <>
                    <span style={{ width:16, height:16, border:`2px solid rgba(124,58,237,.3)`,
                      borderTopColor:C.purple, borderRadius:"50%",
                      animation:"spin .8s linear infinite", flexShrink:0, display:"inline-block" }}/>
                    <span style={{ fontFamily:C.mono, fontSize:11, color:C.muted }}>
                      Collecting frames… {statusData.frame_count ?? 0} / 150
                    </span>
                  </>
                ) : (
                  <span style={{ fontFamily:C.mono, fontSize:11, color:C.vac }}>
                    Mapping complete — {statusData.slots_loaded ?? 0} slot{statusData.slots_loaded !== 1 ? "s" : ""} found via DBSCAN
                  </span>
                )}
              </div>
              {!statusData.mapping_phase && aiPhase !== "generating" && aiPhase !== "error" && (
                <>
                  <div style={{ fontFamily:C.mono, fontSize:10, color:C.muted,
                    padding:"10px 12px", borderRadius:8, background:"rgba(0,0,0,.04)", lineHeight:1.8 }}>
                    The auto-mapper found slots from real cars. Optionally, use AI to discover
                    all possible parking spots by generating a fully-parked version of the lot.
                  </div>
                  <button onClick={triggerAiGenerate}
                    style={{ padding:"11px", borderRadius:10, border:"none", cursor:"pointer",
                      background:"linear-gradient(135deg,#7c3aed,#ec4899)",
                      color:"#fff", fontFamily:C.sans, fontWeight:700, fontSize:13,
                      display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
                    ✨ Generate AI Slots
                  </button>
                  <button onClick={onClose}
                    style={{ padding:"10px", borderRadius:10, border:`1px solid ${C.border}`,
                      background:"transparent", color:C.muted,
                      fontFamily:C.sans, fontWeight:700, fontSize:13, cursor:"pointer" }}>
                    Finish (keep DBSCAN slots only)
                  </button>
                </>
              )}
              {aiPhase === "generating" && (
                <div style={{ display:"flex", alignItems:"center", gap:8,
                  padding:"10px 12px", borderRadius:8,
                  background:"rgba(124,58,237,.08)", border:`1px solid ${C.purple}33`,
                  fontFamily:C.mono, fontSize:11, color:C.purple }}>
                  <span style={{ width:14, height:14, border:`2px solid rgba(124,58,237,.3)`,
                    borderTopColor:C.purple, borderRadius:"50%",
                    animation:"spin .8s linear infinite", display:"inline-block" }}/>
                  Generating filled parking lot with Nano Banana Pro…
                </div>
              )}
              {aiPhase === "error" && (
                <>
                  <div style={{ padding:"10px 12px", borderRadius:8,
                    background:`${C.occ}12`, border:`1px solid ${C.occ}33`,
                    fontFamily:C.mono, fontSize:11, color:C.occ }}>
                    ⚠️ Generation failed: {aiError}
                  </div>
                  <button onClick={onClose}
                    style={{ padding:"10px", borderRadius:10, border:`1px solid ${C.border}`,
                      background:"transparent", color:C.muted,
                      fontFamily:C.sans, fontWeight:700, fontSize:13, cursor:"pointer" }}>
                    Close (keep DBSCAN slots)
                  </button>
                </>
              )}
            </>
          )}

          {/* ── Step 5: AI Slot Review ────────────────────────────────────────── */}
          {step === 5 && (
            <>
              <div style={{ fontFamily:C.sans, fontWeight:700, fontSize:14 }}>
                Review AI-Generated Slots
              </div>
              {aiPhase === "generating" && (
                <div style={{ display:"flex", alignItems:"center", gap:10,
                  padding:"16px", borderRadius:10,
                  background:"rgba(124,58,237,.06)", border:`1px solid ${C.purple}33`,
                  fontFamily:C.mono, fontSize:11, color:C.purple }}>
                  <span style={{ width:18, height:18, border:`2px solid rgba(124,58,237,.3)`,
                    borderTopColor:C.purple, borderRadius:"50%",
                    animation:"spin .8s linear infinite", flexShrink:0, display:"inline-block" }}/>
                  Nano Banana Pro is generating a fully-parked version of the lot…
                </div>
              )}
              {aiPhase === "review" && (
                <>
                  <div style={{ fontFamily:C.mono, fontSize:10, color:C.muted, lineHeight:1.8 }}>
                    AI detected{" "}
                    <strong style={{ color:C.purple }}>{aiSlotCount}</strong> possible
                    parking slot{aiSlotCount !== 1 ? "s" : ""} in the generated image.
                    Confirm to apply them (merged with DBSCAN slots), or reject to keep
                    only the original auto-mapped slots.
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                    <div>
                      <div style={{ fontFamily:C.mono, fontSize:10, color:C.muted, marginBottom:4 }}>
                        Best captured frame
                      </div>
                      <div style={{ borderRadius:8, overflow:"hidden",
                        border:`1px solid ${C.border}` }}>
                        <img src={`${PI_API_URL}/ai-mapping/best-frame?t=${aiImageTs}`}
                          style={{ width:"100%", display:"block" }} alt="best frame" />
                      </div>
                    </div>
                    <div>
                      <div style={{ fontFamily:C.mono, fontSize:10, color:C.muted, marginBottom:4 }}>
                        AI-generated (all slots filled) — <span style={{ color:C.purple }}>{aiSlotCount} slots</span>
                      </div>
                      <div style={{ borderRadius:8, overflow:"hidden",
                        border:`1px solid ${C.border}`, position:"relative" }}>
                        <img src={`${PI_API_URL}/ai-mapping/generated-image?t=${aiImageTs}`}
                          style={{ width:"100%", display:"block" }} alt="AI generated" />
                        <svg style={{ position:"absolute", inset:0, width:"100%", height:"100%",
                          pointerEvents:"none" }}
                          viewBox={`0 0 ${CAM_W} ${CAM_H}`}
                          preserveAspectRatio="none">
                          {Object.entries(aiSlots).map(([id, s]) => {
                            const pts = (s.coords || []).map(p => `${p[0]},${p[1]}`).join(" ");
                            return pts ? (
                              <polygon key={id} points={pts}
                                fill="rgba(250,204,21,0.25)"
                                stroke="#facc15" strokeWidth={14} />
                            ) : null;
                          })}
                        </svg>
                      </div>
                    </div>
                  </div>
                  <div style={{ display:"flex", gap:8 }}>
                    <button onClick={confirmAiSlots}
                      style={{ flex:2, padding:"11px", borderRadius:10, border:"none",
                        cursor:"pointer",
                        background:`linear-gradient(135deg,${C.vac},#16a34a)`,
                        color:"#fff", fontFamily:C.sans, fontWeight:700, fontSize:13 }}>
                      Confirm & Apply
                    </button>
                    <button onClick={rejectAiSlots}
                      style={{ flex:1, padding:"10px", borderRadius:10,
                        border:`1px solid ${C.occ}44`, background:`${C.occ}12`,
                        color:C.occ, fontFamily:C.sans, fontWeight:700, fontSize:13,
                        cursor:"pointer" }}>
                      Reject
                    </button>
                  </div>
                </>
              )}
              {aiPhase === "error" && (
                <>
                  <div style={{ padding:"12px", borderRadius:10,
                    background:`${C.occ}12`, border:`1px solid ${C.occ}33`,
                    fontFamily:C.mono, fontSize:11, color:C.occ }}>
                    ⚠️ {aiError || "Generation failed"}
                  </div>
                  <button onClick={onClose}
                    style={{ padding:"10px", borderRadius:10, border:`1px solid ${C.border}`,
                      background:"transparent", color:C.muted,
                      fontFamily:C.sans, fontWeight:700, fontSize:13, cursor:"pointer" }}>
                    Close (keep DBSCAN slots)
                  </button>
                </>
              )}
            </>
          )}

        </div>
      </div>
    </div>
  );
}

// ── Admin Panel ───────────────────────────────────────────────────────────────
function AdminPanel({slots,logs,onRemove,onSlotDeleted,removedSlots,addLog,onImageAnalysis,piStatus,firebaseStatus,mode,section,setSection,videoSource,setVideoSource,videoPlayState,setVideoPlayState,videoProgress,setVideoProgress,piRegistry,selectedPiCode,onSelectPi}){
  const [selected,setSelected]   = useState(null);
  const [confirm,setConfirm]           = useState(null);
  const [showRemapWizard,setShowRemap] = useState(false);
  const [mapView,setMapView]           = useState("vector");   // "vector" | "card"
  const total    = Object.keys(slots).length;
  const occupied = Object.values(slots).filter(s=>s.status==="Occupied").length;
  const reserved = Object.values(slots).filter(s=>s.status==="Reserved").length;
  const vacant   = total - occupied - reserved;

  const TABS = [
    {id:"map",        label:"🗺️ Live Map"},
    {id:"feed",       label:"📹 Camera Feed"},
    {id:"editor",     label:"✏️ Slot Editor"},
    {id:"distortion", label:"🔧 Distortion"},
    {id:"program",    label:"⚙️ Properties"},
    {id:"image",      label:"🖼️ Image Test"},
    {id:"logs",       label:"📡 AI Feed"},
    {id:"mapped",     label:"📍 Pins"},
  ];

  return(
    <div style={{display:"flex",flexDirection:"column",gap:18}}>
      <div style={{padding:"14px 18px",background:`linear-gradient(135deg,rgba(244,63,94,.08),rgba(251,191,36,.05))`,border:`1px solid rgba(244,63,94,.2)`,borderRadius:14,display:"flex",alignItems:"center",gap:12}}>
        <span style={{fontSize:22}}>🛡️</span>
        <div>
          <div style={{fontFamily:C.sans,fontWeight:800,fontSize:15,color:"#D93A3A"}}>Admin Panel</div>
          <div style={{fontSize:11,fontFamily:C.mono,color:C.muted}}>Full system access · CIT-U Parking</div>
        </div>
        <div style={{marginLeft:"auto",display:"flex",gap:8}}>
          <Badge label={piStatus==="online"?"PI ONLINE":"PI OFFLINE"} color={piStatus==="online"?C.vac:C.occ}/>
          <Badge label="ADMIN" color={C.occ}/>
        </div>
      </div>

      <ConnectionBanner piStatus={piStatus} firebaseStatus={firebaseStatus}/>

      <PiSelector piRegistry={piRegistry} selectedPiCode={selectedPiCode} onSelect={onSelectPi}/>

      {!selectedPiCode ? (
        <div style={{padding:"40px 20px",textAlign:"center",borderRadius:14,
          background:"rgba(0,0,0,.03)",border:`1px dashed ${C.border}`}}>
          <div style={{fontSize:32,marginBottom:12}}>📡</div>
          <div style={{fontFamily:C.sans,fontWeight:700,fontSize:15,color:C.text,marginBottom:6}}>
            Select a Pi to continue
          </div>
          <div style={{fontFamily:C.mono,fontSize:11,color:C.muted}}>
            Choose a Pi unit above to load its camera feed, slots, and controls.
          </div>
        </div>
      ) : (<>

      <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
        <StatPill label="Active Slots" value={total||"—"}    color={C.accent}/>
        <StatPill label="Occupied"     value={occupied||"—"} color={C.occ} sub={total?`${pct(occupied,total)}% full`:undefined}/>
        <StatPill label="Reserved"     value={reserved||"—"} color="#f97316"/>
        <StatPill label="Available"    value={vacant||"—"}   color={C.vac}/>
        <StatPill label="Removed"      value={removedSlots.length} color={C.warn}/>
      </div>

      <div style={{display:"flex",gap:2,background:C.surface,borderRadius:12,padding:4,border:`1px solid ${C.border}`}}>
        {TABS.map(s=>(
          <button key={s.id} onClick={()=>setSection(s.id)}
            style={{flex:1,padding:"9px 6px",borderRadius:9,border:"none",cursor:"pointer",fontFamily:C.sans,fontWeight:700,fontSize:11,background:section===s.id?"rgba(0,0,0,.06)":"transparent",color:section===s.id?C.text:C.muted,transition:"all .2s"}}>{s.label}</button>
        ))}
      </div>

      {section==="map"&&(
        <Card style={{padding:20}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14,flexWrap:"wrap",gap:10}}>
            <span style={{fontFamily:C.sans,fontWeight:700,fontSize:15}}>Live Parking Map</span>
            <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
              {firebaseStatus==="online"
                ?<><LiveDot/><span style={{fontFamily:C.mono,fontSize:10,color:C.muted}}>Live from Firebase</span></>
                :<span style={{fontFamily:C.mono,fontSize:10,color:C.warn}}>⚠ No live data</span>}

              {/* View toggle: vector ↔ card */}
              <div style={{display:"flex",gap:2,background:C.surface,borderRadius:8,padding:3,border:`1px solid ${C.border}`}}>
                {[["vector","◈ Vector"],["card","⊞ Cards"]].map(([mode,label])=>(
                  <button key={mode} onClick={()=>setMapView(mode)}
                    title={mode==="vector"?"Show detection polygons on camera frame":"Show uniform slot cards grouped by row"}
                    style={{padding:"5px 12px",borderRadius:6,border:"none",cursor:"pointer",fontFamily:C.mono,fontWeight:700,fontSize:10,letterSpacing:".03em",background:mapView===mode?`${C.accent}22`:"transparent",color:mapView===mode?C.accent:C.muted,transition:"all .15s"}}>
                    {label}
                  </button>
                ))}
              </div>

              <button onClick={()=>setShowRemap(true)} disabled={piStatus!=="online"}
                title={piStatus!=="online"?"Pi must be online to remap":"Open remap wizard"}
                style={{display:"flex",alignItems:"center",gap:6,padding:"6px 12px",borderRadius:8,
                  border:`1px solid ${piStatus!=="online"?C.border:C.purple+"55"}`,
                  background:piStatus!=="online"?"rgba(0,0,0,.03)":`${C.purple}15`,
                  color:piStatus!=="online"?C.muted:C.purple,
                  fontFamily:C.mono,fontSize:10,fontWeight:700,
                  cursor:piStatus!=="online"?"not-allowed":"pointer",
                  transition:"all .2s",opacity:piStatus!=="online"?.5:1}}>
                🔄 Remap Slots
              </button>
            </div>
          </div>
          {mapView==="vector"
            ? <ParkingMap slots={slots} selectedSlot={selected} onSelect={setSelected} adminMode={true} onRemove={id=>setConfirm(id)}/>
            : <ParkingCardGrid
                slots={normalizeAdminSlotsObject(slots)}
                selected={selected}
                onSelect={setSelected}
                theme="admin"
              />
          }
          <SlotDetail slotId={selected} slot={selected?slots[selected]:null} onClose={()=>setSelected(null)} onRemove={id=>setConfirm(id)} adminMode={true}/>
          {total>0&&(
            <div style={{marginTop:20,paddingTop:20,borderTop:`1px solid ${C.border}`}}>
              <div style={{fontFamily:C.sans,fontWeight:700,fontSize:13,marginBottom:12,color:C.muted}}>Row Breakdown</div>
              {[...new Set(Object.values(slots).map(s=>s.row).filter(Boolean))].sort().map(row=>{
                const rs=Object.values(slots).filter(s=>s.row===row);
                const o=rs.filter(s=>s.status==="Occupied").length;
                const r=rs.filter(s=>s.status==="Reserved").length;
                const t=rs.length;
                const p=pct(o+r,t);
                if(!t) return null;
                return(
                  <div key={row} style={{marginBottom:12}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                      <span style={{fontFamily:C.mono,fontSize:12}}>Row {row}</span>
                      <div style={{display:"flex",gap:8,alignItems:"center"}}>
                        {r>0&&<span style={{fontFamily:C.mono,fontSize:11,color:"#f97316",fontWeight:700}}>{r} res</span>}
                        <span style={{fontFamily:C.mono,fontSize:12,color:p>75?C.occ:p>50?C.warn:C.vac,fontWeight:700}}>{o}/{t} ({p}%)</span>
                      </div>
                    </div>
                    <div style={{height:7,background:"rgba(0,0,0,.08)",borderRadius:3,overflow:"hidden",display:"flex"}}>
                      <div style={{height:"100%",width:`${pct(o,t)}%`,background:`linear-gradient(90deg,${C.occ},#dc2626)`,borderRadius:3,transition:"width .8s ease"}}/>
                      <div style={{height:"100%",width:`${pct(r,t)}%`,background:"linear-gradient(90deg,#f97316,#ea580c)",transition:"width .8s ease"}}/>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}
      {showRemapWizard&&(
        <RemapWizard piStatus={piStatus} addLog={addLog} onClose={()=>setShowRemap(false)}/>
      )}

      {section==="feed"&&(
        <Card style={{padding:20}}>
          <LiveFeedPanel piStatus={piStatus} mode={mode}
            videoSource={videoSource} setVideoSource={setVideoSource}
            playState={videoPlayState} setPlayState={setVideoPlayState}
            progress={videoProgress} setProgress={setVideoProgress}/>
        </Card>
      )}

      {section==="editor"&&(
        <SlotEditorPanel slots={slots} piStatus={piStatus} addLog={addLog} selectedPiCode={selectedPiCode} onSlotDeleted={onSlotDeleted}/>
      )}

      {section==="program"&&(
        <div style={{display:"flex",flexDirection:"column",gap:18}}>
          <Card style={{padding:20}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16}}>
              <span style={{fontFamily:C.sans,fontWeight:700,fontSize:15}}>Program Properties</span>
              <span style={{fontFamily:C.mono,fontSize:10,color:C.muted}}>— hot-reloaded, no restart needed</span>
            </div>
            <ProgramPropertiesPanel piStatus={piStatus} addLog={addLog}/>
          </Card>
          <DriverUISettingsPanel/>
        </div>
      )}

      {section==="distortion"&&(
        <Card style={{padding:20}}>
          <DistortionPanel piStatus={piStatus} addLog={addLog}/>
        </Card>
      )}

      {section==="image"&&(
        <Card style={{padding:20}}>
          <ImageTestPanel onAnalysisComplete={onImageAnalysis} addLog={addLog} piStatus={piStatus}/>
        </Card>
      )}

      {section==="logs"&&(
        <Card style={{padding:20}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
            <span style={{fontFamily:C.sans,fontWeight:700,fontSize:15}}>AI Processing Feed</span>
            <span style={{fontFamily:C.mono,fontSize:10,color:C.accent,animation:"blink 1.2s infinite",marginLeft:4}}>●</span>
          </div>
          <AITerminal logs={logs}/>
        </Card>
      )}

      {section==="mapped"&&(
        <Card style={{padding:20}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16}}>
            <span style={{fontFamily:C.sans,fontWeight:700,fontSize:15}}>Mapped Locations</span>
            <span style={{fontFamily:C.mono,fontSize:10,color:C.muted}}>— geo pins saved to Firebase</span>
          </div>
          <AdminMapEditor/>
        </Card>
      )}

      {removedSlots.length>0&&(
        <Card style={{padding:20}}>
          <div style={{fontFamily:C.sans,fontWeight:700,fontSize:14,marginBottom:12,color:C.warn}}>⚠️ Removed Slots ({removedSlots.length})</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
            {removedSlots.map(({id,time})=>(
              <div key={id+time} style={{padding:"6px 12px",borderRadius:8,background:"rgba(245,158,11,.1)",border:"1px solid rgba(245,158,11,.3)",fontFamily:C.mono,fontSize:11}}>
                <span style={{color:C.warn,fontWeight:700}}>{id}</span>
                <span style={{color:C.muted,marginLeft:8}}>{time}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {confirm&&<ConfirmDialog slotId={confirm} onConfirm={()=>{onRemove(confirm);setConfirm(null);setSelected(null);}} onCancel={()=>setConfirm(null)}/>}
      </>)}
    </div>
  );
}

// ── Driver View ───────────────────────────────────────────────────────────────
function UserView({slots,firebaseStatus}){
  const [selected,setSelected] = useState(null);
  const [filter,setFilter]     = useState("All");
  const [viewMode,setViewMode] = useState("grid");
  const total    = Object.keys(slots).length;
  const occupied = Object.values(slots).filter(s=>s.status==="Occupied").length;
  const reservedCount = Object.values(slots).filter(s=>s.status==="Reserved").length;
  const vacant   = total - occupied - reservedCount, p=pct(occupied,total);
  const filtered = Object.fromEntries(Object.entries(slots).filter(([,s])=>filter==="All"||s.status===filter));

  // Derive a row key from slot metadata or slot ID prefix
  const getRow = (id,slot) => {
    if(slot.row) return String(slot.row);
    const m = id.match(/^([A-Za-z]+)/);
    return m ? m[1] : "?";
  };
  // Center X/Y from quad or legacy coords — used to sort slots within rows
  const centerX = (slot) => {
    const c=slot.coords; if(!c||c.length<2) return 0;
    return isQuad(c)?c.reduce((s,pt)=>s+pt[0],0)/c.length:(c[0]+c[2])/2;
  };
  const centerY = (slot) => {
    const c=slot.coords; if(!c||c.length<2) return 0;
    return isQuad(c)?c.reduce((s,pt)=>s+pt[1],0)/c.length:(c[1]+c[3])/2;
  };

  // Group filtered slots by row, then sort rows top-to-bottom by average Y
  const rowGroups = {};
  Object.entries(filtered).forEach(([id,slot])=>{
    const row=getRow(id,slot);
    if(!rowGroups[row]) rowGroups[row]=[];
    rowGroups[row].push({id,slot});
  });
  const sortedRows = Object.entries(rowGroups).sort(([,a],[,b])=>{
    const avgY=(ss)=>ss.reduce((s,{slot:sl})=>s+centerY(sl),0)/ss.length;
    return avgY(a)-avgY(b);
  });

  return(
    <div style={{display:"flex",flexDirection:"column",gap:18}}>
      {firebaseStatus!=="online"&&(
        <div style={{padding:"10px 16px",borderRadius:10,background:`${C.warn}12`,border:`1px solid ${C.warn}33`,fontFamily:C.mono,fontSize:11,color:C.warn}}>
          ⚠️ Not connected to live data — configure Firebase URL to see real-time updates
        </div>
      )}
      <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
        <StatPill label="Total Slots" value={total||"—"}           color={C.accent}/>
        <StatPill label="Occupied"    value={occupied||"—"}        color={C.occ} sub={total?`${p}% full`:undefined}/>
        {reservedCount>0&&<StatPill label="Reserved" value={reservedCount} color="#f97316"/>}
        <StatPill label="Available"   value={vacant||"—"}          color={C.vac} sub={total?"Free now":undefined}/>
      </div>
      {total>0&&(
        <Card style={{padding:18}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
            <span style={{fontFamily:C.sans,fontWeight:600,fontSize:13,color:C.muted}}>Lot Capacity</span>
            <span style={{fontFamily:C.mono,fontWeight:700,fontSize:13,color:p>80?C.occ:p>60?C.warn:C.vac}}>{p}% occupied</span>
          </div>
          <div style={{height:10,background:"rgba(0,0,0,.08)",borderRadius:5,overflow:"hidden"}}>
            <div style={{height:"100%",width:`${p}%`,background:p>80?`linear-gradient(90deg,${C.occ},#dc2626)`:p>60?`linear-gradient(90deg,${C.warn},#d97706)`:`linear-gradient(90deg,${C.vac},#059669)`,borderRadius:5,transition:"width .8s ease"}}/>
          </div>
          {vacant===0&&total>0&&<div style={{marginTop:10,padding:"8px 14px",borderRadius:8,background:`${C.occ}15`,border:`1px solid ${C.occ}44`,fontFamily:C.mono,fontSize:11,color:C.occ,textAlign:"center"}}>🚫 Parking lot is full</div>}
        </Card>
      )}
      <Card style={{padding:20}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8}}>
          <span style={{fontFamily:C.sans,fontWeight:700,fontSize:15}}>Find a Spot</span>
          <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
            {["All","Vacant","Occupied","Reserved"].map(f=>(
              <button key={f} onClick={()=>setFilter(f)}
                style={{padding:"4px 12px",borderRadius:20,fontSize:11,fontWeight:700,fontFamily:C.mono,cursor:"pointer",border:filter===f?"none":`1px solid ${C.border}`,background:filter===f?f==="Vacant"?"#10b98133":f==="Occupied"?`${C.occ}33`:f==="Reserved"?"#f9731633":"#38bdf833":"transparent",color:filter===f?f==="Vacant"?C.vac:f==="Occupied"?C.occ:f==="Reserved"?"#f97316":C.accent:C.muted}}>{f}</button>
            ))}
            <div style={{width:1,height:16,background:C.border,margin:"0 2px"}}/>
            {[["grid","⊞ Grid"],["map","◈ Map"]].map(([mode,label])=>(
              <button key={mode} onClick={()=>setViewMode(mode)}
                style={{padding:"4px 12px",borderRadius:20,fontSize:11,fontWeight:700,fontFamily:C.mono,cursor:"pointer",border:viewMode===mode?"none":`1px solid ${C.border}`,background:viewMode===mode?`${C.accent}22`:"transparent",color:viewMode===mode?C.accent:C.muted}}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {viewMode==="map" ? (
          <ParkingMap slots={filtered} selectedSlot={selected} onSelect={setSelected} adminMode={false} onRemove={()=>{}}/>
        ) : (
          <div style={{display:"flex",flexDirection:"column",gap:18}}>
            {sortedRows.length===0&&(
              <div style={{textAlign:"center",padding:"30px 0",color:C.muted,fontFamily:C.mono,fontSize:12}}>
                No slots match the current filter.
              </div>
            )}
            {sortedRows.map(([row,rowSlots])=>(
              <div key={row}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                  <span style={{fontFamily:C.mono,fontSize:10,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:"0.08em"}}>
                    Row {row}
                  </span>
                  <div style={{flex:1,height:1,background:C.border}}/>
                  <span style={{fontFamily:C.mono,fontSize:10,color:C.muted}}>
                    {rowSlots.filter(({slot:s})=>s.status==="Vacant").length}/{rowSlots.length} free
                  </span>
                </div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  {[...rowSlots].sort((a,b)=>centerX(a.slot)-centerX(b.slot)).map(({id,slot})=>{
                    const occ=slot.status==="Occupied";
                    const res=slot.status==="Reserved";
                    const sel=selected===id;
                    const dotColor=occ?C.occ:(res?"#f97316":C.vac);
                    const bgColor=sel?(occ?`${C.occ}35`:(res?"#f9731635":`${C.vac}30`)):(occ?`${C.occ}18`:(res?"#f9731612":`${C.vac}10`));
                    const borderColor=sel?(occ?C.occ:(res?"#f97316":C.vac)):(occ?`${C.occ}55`:(res?"#f9731655":`${C.vac}40`));
                    return(
                      <div key={id} onClick={()=>setSelected(sel?null:id)}
                        style={{
                          width:72,minHeight:90,borderRadius:12,cursor:"pointer",position:"relative",
                          display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
                          gap:6,padding:"10px 6px 8px",
                          background:bgColor, border:`1.5px solid ${borderColor}`,
                          boxShadow:sel?`0 0 14px ${dotColor}55`:"none",
                          transition:"all .2s",
                        }}>
                        <div style={{position:"absolute",top:6,right:6,width:6,height:6,borderRadius:"50%",
                          background:dotColor, boxShadow:`0 0 5px ${dotColor}`}}/>
                        <div style={{fontSize:22,lineHeight:1}}>{occ?"🚗":(res?"🔒":"🅿️")}</div>
                        <div style={{fontFamily:C.mono,fontSize:10,fontWeight:700,color:occ?"#D93A3A":(res?"#f97316":"#22A06B")}}>{id}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        <SlotDetail slotId={selected} slot={selected?slots[selected]:null} onClose={()=>setSelected(null)} onRemove={()=>{}} adminMode={false}/>
        <div style={{display:"flex",gap:20,marginTop:14,justifyContent:"center",flexWrap:"wrap"}}>
          {[[C.vac,"Available"],[C.occ,"Occupied"],["#f97316","Reserved"]].map(([c,l])=>(
            <div key={l} style={{display:"flex",alignItems:"center",gap:6,fontSize:11,fontFamily:C.mono,color:C.muted}}>
              <span style={{width:10,height:10,borderRadius:2,background:c,display:"inline-block"}}/>{l}
            </div>
          ))}
        </div>
      </Card>
      {total>0&&(
        <Card style={{padding:20}}>
          <div style={{fontFamily:C.sans,fontWeight:700,fontSize:15,marginBottom:14}}>All Slots</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(80px,1fr))",gap:8}}>
            {Object.entries(filtered).map(([id,slot])=>{
              const occ=slot.status==="Occupied";
              const res=slot.status==="Reserved";
              const dotColor=occ?C.occ:(res?"#f97316":C.vac);
              return(
                <div key={id} onClick={()=>setSelected(id===selected?null:id)}
                  style={{padding:"10px 6px",borderRadius:10,textAlign:"center",cursor:"pointer",
                    background:selected===id?(occ?`${C.occ}30`:(res?"#f9731630":`${C.vac}30`)):"rgba(0,0,0,.03)",
                    border:`1px solid ${occ?C.occ+"33":(res?"#f9731633":C.vac+"25")}`,transition:"all .2s"}}>
                  <div style={{fontSize:15,marginBottom:4}}>{occ?"🚗":(res?"🔒":"🟢")}</div>
                  <div style={{fontSize:10,fontFamily:C.mono,fontWeight:700,color:dotColor}}>{id}</div>
                  <div style={{fontSize:8,color:C.muted,marginTop:2,fontFamily:C.mono}}>Row {slot.row||"?"}</div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────
export default function AdminApp(){
  const [slots,setSlots]             = useState({});
  const [tab,setTab]                 = useState("user");
  const [logs,setLogs]               = useState([]);
  const [removed,setRemoved]         = useState([]);
  const [piStatus,setPiStatus]       = useState("checking");
  const [fbStatus,setFbStatus]       = useState("checking");
  const [lastUpdated,setLastUpdated] = useState(null);
  const [piRegistry,setPiRegistry]   = useState({});
  const [selectedPiCode,setSelectedPiCode] = useState(null);
  const [mode, setModeState]         = useState(getMode);
  const [firebasePath, setFirebasePathState] = useState(getFirebasePath);
  // Lifted so state survives tab switches
  const [adminSection,   setAdminSection]   = useState("map");
  const [videoSource,    setVideoSource]    = useState("camera");
  const [videoPlayState, setVideoPlayState] = useState("stopped");
  const [videoProgress,  setVideoProgress]  = useState(null);
  const logId = useRef(0);

  const switchMode = useCallback((newMode) => {
    PI_API_URL = setMode(newMode);  // update module-level var + localStorage
    setModeState(newMode);          // trigger full re-render
    setPiStatus("checking");        // amber dot immediately
  }, []);

  const handleSelectPi = useCallback((code) => {
    if (code && piRegistry[code]?.apiUrl) {
      PI_API_URL = piRegistry[code].apiUrl;
    } else {
      PI_API_URL = getApiUrl();     // reset to configured default
    }
    setSelectedPiCode(code ?? null);
    setPiStatus("checking");
  }, [piRegistry]);

  const switchFirebasePath = useCallback((newPath) => {
    setFirebasePath(newPath);       // persist to localStorage + module var
    setFirebasePathState(newPath);  // trigger re-render + effect restart
    setFbStatus("checking");
  }, []);

  const addLog = useCallback((msg,type="info")=>{
    setLogs(p=>[...p.slice(-150),{id:logId.current++,msg,type,time:fmtTs()}]);
  },[]);

  // Poll Pi registry from Firebase every 15s
  useEffect(()=>{
    const load = async () => {
      try {
        const r = await fetch(`${FIREBASE_URL}/pi_registry.json`,{signal:AbortSignal.timeout(5000)});
        if(!r.ok) return;
        const data = await r.json();
        if(data && typeof data === "object") setPiRegistry(data);
      } catch { /* silent — non-critical */ }
    };
    load();
    const iv = setInterval(load, 15000);
    return () => clearInterval(iv);
  },[]);

  useEffect(()=>{
    if(!selectedPiCode){ setPiStatus("checking"); return; }
    const checkPi = async () => {
      try {
        const r = await fetch(`${PI_API_URL}/status`,{signal:AbortSignal.timeout(4000)});
        const d = await r.json();
        setPiStatus("online");
        addLog(`[SYS]  Pi online — camera:${d.camera?"✓":"✗"} slots:${d.slots_loaded}`,"sys");
      } catch {
        setPiStatus("error");
        addLog(`[SYS]  Pi unreachable at ${PI_API_URL}`,"error");
      }
    };
    checkPi();
    const iv = setInterval(checkPi,15000);
    return ()=>clearInterval(iv);
  },[addLog, mode, selectedPiCode]);

  // Fix #8: removed the dead slot_layout merge from inside the /parking poll.
  // slot_layout is loaded once on mount from /slot_layout.json (its actual path).
  // The /parking node only contains {slots, summary} — no slot_layout key there.
  useEffect(()=>{
    if(!selectedPiCode){ setSlots({}); setFbStatus("checking"); return; }
    if(!FIREBASE_URL||FIREBASE_URL.includes("YOUR_PROJECT")){
      setFbStatus("error");
      addLog("[FB]   Firebase URL not configured","error");
      return;
    }

    // Fix #4: exponential backoff on Firebase errors so we don't spam requests
    // when Firebase is unreachable. Resets to BASE_INTERVAL on success.
    const BASE_INTERVAL = 3000;
    const MAX_INTERVAL  = 30000;
    let   currentDelay  = BASE_INTERVAL;
    let   failStreak    = 0;
    let   timerId       = null;

    const poll = async () => {
      try {
        const r = await fetch(`${FIREBASE_URL}/locations/${selectedPiCode}/slots.json`);
        if(!r.ok) throw new Error(`HTTP ${r.status}`);
        const d = await r.json();
        if(d && typeof d === "object"){
          setSlots(prev => {
            const merged = {};
            Object.entries(d).forEach(([id, val]) => {
              const status = typeof val === "string" ? val : (val?.status ?? "Vacant");
              merged[id] = {
                ...(prev[id] || {}),
                status,
                ...(typeof val === "object" && val !== null ? {
                  coords:     val.coords     ?? prev[id]?.coords,
                  row:        val.row        ?? prev[id]?.row,
                  confidence: val.confidence ?? prev[id]?.confidence,
                } : {}),
              };
            });
            return merged;
          });
          setLastUpdated(Date.now());
          setFbStatus("online");
          addLog(`[FB]   Slots updated — ${Object.keys(d).length} slots`,"sync");
        }
        // Reset backoff on success
        failStreak    = 0;
        currentDelay  = BASE_INTERVAL;
      } catch {
        failStreak++;
        setFbStatus("error");
        addLog("[FB]   Firebase read failed","error");
        // Exponential backoff: 3s → 6s → 12s → ... → 30s cap
        currentDelay = Math.min(BASE_INTERVAL * Math.pow(2, failStreak - 1), MAX_INTERVAL);
        addLog(`[FB]   Retrying in ${Math.round(currentDelay/1000)}s...`,"error");
      }
      // Schedule next poll with current (possibly backed-off) delay
      timerId = setTimeout(poll, currentDelay);
    };

    poll();
    return ()=>{ if(timerId) clearTimeout(timerId); };
  },[addLog, mode, firebasePath, selectedPiCode]);

  // Fix #5: slot_layout is the authoritative source of coords.
  // Poll it every 10s so the map updates automatically after a Remap
  // without requiring a page reload. Uses a simple interval (not backoff)
  // since a failed layout fetch is non-critical — occupancy still works.
  useEffect(()=>{
    if(!selectedPiCode) return;
    if(!FIREBASE_URL||FIREBASE_URL.includes("YOUR_PROJECT")) return;
    let lastLayoutKey = "";   // detect when the layout actually changed

    const loadLayout = async () => {
      try {
        const r = await fetch(`${FIREBASE_URL}/locations/${selectedPiCode}/layout.json`);
        if(!r.ok) return;
        const layout = await r.json();
        if(!layout || typeof layout !== "object") return;

        // Only update state if the slot set actually changed (avoids noisy re-renders)
        const layoutKey = Object.keys(layout).sort().join(",");
        if(layoutKey === lastLayoutKey) return;
        lastLayoutKey = layoutKey;

        setSlots(prev => {
          const merged = {...prev};
          Object.entries(layout).forEach(([id, data]) => {
            merged[id] = {
              ...(prev[id] || {}),   // keep live status/confidence
              coords: data.coords,   // always overwrite with fresh layout coords
              row:    data.row,
            };
          });
          return merged;
        });
        addLog(`[FB]   Slot layout refreshed — ${Object.keys(layout).length} slots`,"sys");
      } catch { /* layout fetch failing is non-critical */ }
    };

    loadLayout();
    const iv = setInterval(loadLayout, 10000);   // refresh every 10s to catch Remaps
    return ()=>clearInterval(iv);
  },[addLog, mode, firebasePath, selectedPiCode]);

  // Poll Pi /occupancy directly every 2s when Pi is online — much faster than
  // Firebase's 3–30s backoff. Only patches status; never touches coords/row.
  useEffect(()=>{
    if(piStatus !== "online" || !selectedPiCode) return;
    let timerId = null;
    const poll = async () => {
      try {
        const r = await fetch(`${PI_API_URL}/occupancy`,{signal:AbortSignal.timeout(3000)});
        if(!r.ok) return;
        const d = await r.json();
        if(!d?.slots) return;
        setSlots(prev => {
          const next = {...prev};
          let changed = false;
          Object.entries(d.slots).forEach(([id, status]) => {
            if(next[id] && next[id].status !== status){
              next[id] = {...next[id], status};
              changed = true;
            }
          });
          return changed ? next : prev;
        });
      } catch { /* silent — Firebase is fallback */ }
      timerId = setTimeout(poll, 2000);
    };
    poll();
    return ()=>{ if(timerId) clearTimeout(timerId); };
  },[piStatus, mode, selectedPiCode]);

  const handleRemove = useCallback(async (id)=>{
    // Optimistically remove from UI so the action feels instant.
    setSlots(p=>{const n={...p};delete n[id];return n;});
    setRemoved(p=>[...p,{id,time:fmtTs()}]);
    addLog(`[ADMIN] Slot ${id} removing from Firebase…`,"sys");
    try {
      await deleteSlot(selectedPiCode, id);
      addLog(`[ADMIN] Slot ${id} deleted from Firebase`,"sys");
    } catch(err) {
      // Rollback: restore the slot and remove it from the removed list.
      addLog(`[ADMIN] Failed to delete ${id} from Firebase: ${err.message}`,"err");
      setRemoved(p=>p.filter(s=>!(s.id===id)));
      // Re-fetch from Firebase to restore accurate state.
      try {
        const r = await fetch(`${FIREBASE_URL}/locations/${selectedPiCode}/slots/${id}.json`);
        if(r.ok){
          const val = await r.json();
          if(val) setSlots(p=>({...p,[id]:val}));
        }
      } catch { /* silent — next poll will restore */ }
    }
  },[addLog, selectedPiCode]);

  const handleImageAnalysis = useCallback((result)=>{
    if(!result?.slots?.length) return;
    const cols = Math.ceil(Math.sqrt(result.slots.length));
    const newSlots = {};
    result.slots.forEach((s,i)=>{
      const coords = s.coords || (()=>{
        const row=Math.floor(i/cols), col=i%cols;
        return [40+col*140, 70+row*145, 155+col*140, 165+row*145];
      })();
      newSlots[s.id]={ status:s.status, coords, row:s.row||["A","B","C"][Math.floor(i/cols)]||"A", confidence:s.confidence||.85 };
    });
    setSlots(newSlots);
    addLog(`[ADMIN] Map updated from YOLO image — ${result.slots.length} slots applied`,"img");
  },[addLog]);

  return(
    <div style={{minHeight:"100vh",background:C.bg,color:C.text,fontFamily:C.sans,paddingBottom:48}}>
      <style>{GLOBAL_STYLES}</style>
      <div style={{borderBottom:`1.5px solid ${C.border}`,background:"rgba(255,255,255,.95)",backdropFilter:"blur(16px)",padding:"0 20px",position:"sticky",top:0,zIndex:100}}>
        <div style={{maxWidth:960,margin:"0 auto",display:"flex",alignItems:"center",gap:16,height:58}}>
          <div style={{fontFamily:"'DM Serif Display',serif",fontSize:26,letterSpacing:"-0.3px",lineHeight:1,display:"flex",alignItems:"center",gap:4,marginRight:6}}>
            <img src="/topbar-logo.png" alt="Rizz.Park" style={{height:40,width:"auto",display:"block"}} />
            <span>Rizz<em style={{color:C.accent,fontStyle:"normal"}}>.</em>Park</span>
          </div>
          {[{id:"user",label:"🚗 Driver View"},{id:"admin",label:"🛡️ Admin Panel"}].map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)}
              style={{padding:"0 16px",height:58,border:"none",cursor:"pointer",fontFamily:C.sans,fontWeight:700,fontSize:13,background:"transparent",color:tab===t.id?t.id==="admin"?C.occ:C.accent:C.muted,borderBottom:tab===t.id?`2px solid ${t.id==="admin"?C.occ:C.accent}`:"2px solid transparent",transition:"all .2s"}}>{t.label}</button>
          ))}
          <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:10}}>
            <button
              onClick={() => switchFirebasePath(firebasePath === "parking" ? "parking_desktop" : "parking")}
              title={`Firebase path: /${firebasePath}. Click to switch.`}
              style={{display:"flex",alignItems:"center",gap:6,padding:"4px 10px",borderRadius:8,
                border:`1px solid ${firebasePath==="parking"?"rgba(34,160,107,.4)":"rgba(251,191,36,.4)"}`,
                background:firebasePath==="parking"?"rgba(34,160,107,.12)":"rgba(251,191,36,.12)",
                color:firebasePath==="parking"?C.vac:"#FBBF24",
                fontFamily:C.mono,fontSize:10,fontWeight:700,cursor:"pointer",transition:"all .2s"}}>
              {firebasePath === "parking" ? "🔥 Prod DB" : "🧪 Test DB"}
            </button>
            <button
              onClick={() => switchMode(mode === "pi" ? "desktop" : "pi")}
              title={`${mode === "pi" ? "Pi" : "Desktop"} Mode — API: ${PI_API_URL}. Click to switch.`}
              style={{display:"flex",alignItems:"center",gap:6,padding:"4px 10px",borderRadius:8,
                border:`1px solid ${mode==="pi"?"rgba(124,58,237,.4)":"rgba(245,166,35,.45)"}`,
                background:mode==="pi"?"rgba(124,58,237,.12)":"rgba(245,166,35,.12)",
                color:mode==="pi"?C.purple:C.accent,
                fontFamily:C.mono,fontSize:10,fontWeight:700,cursor:"pointer",transition:"all .2s"}}>
              {mode === "pi" ? "🔌 Pi" : "💻 Desktop"}
            </button>
            <LiveDot color={piStatus==="online"?C.vac:piStatus==="error"?C.occ:C.warn}/>
            <span style={{fontFamily:C.mono,fontSize:10,color:C.muted}}>
              {lastUpdated?`Updated ${fmtTs()}`:"No data yet"}
            </span>
          </div>
        </div>
      </div>
      <div style={{maxWidth:960,margin:"0 auto",padding:"24px 16px"}}>
        {tab==="user"
          ?<UserView slots={slots} firebaseStatus={fbStatus}/>
          :<AdminPanel slots={slots} logs={logs} onRemove={handleRemove} onSlotDeleted={(id)=>setSlots(p=>{const n={...p};delete n[id];return n;})} removedSlots={removed} addLog={addLog} onImageAnalysis={handleImageAnalysis} piStatus={piStatus} firebaseStatus={fbStatus} mode={mode}
              section={adminSection} setSection={setAdminSection}
              videoSource={videoSource} setVideoSource={setVideoSource}
              videoPlayState={videoPlayState} setVideoPlayState={setVideoPlayState}
              videoProgress={videoProgress} setVideoProgress={setVideoProgress}
              piRegistry={piRegistry} selectedPiCode={selectedPiCode} onSelectPi={handleSelectPi}/>}
      </div>
    </div>
  );
}