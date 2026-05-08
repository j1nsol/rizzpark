/**
 * AdminPanel page — accessible at /admin
 *
 * This is the Pi control dashboard (MJPEG stream, slot editor, program config,
 * undistort tuning, remap controls). It requires LAN access to the Raspberry Pi.
 *
 * The full admin UI lives in AdminApp.jsx (the original monolithic App.js).
 * This wrapper just mounts it at the /admin route.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * VIDEO FILE FEATURES — available in both Pi mode and Desktop mode
 * (all calls go through PI_API_URL which resolves to the correct host per mode)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 1. SOURCE SELECTOR TOGGLE  (AdminApp.jsx › LiveFeedPanel, ~line 267)
 *    - Two buttons always visible: "Camera" | "Video File"
 *    - Drives the `videoSource` / `setVideoSource` props
 *    - State is lifted to AdminApp root (see #3) so it survives tab switches
 *
 * 2. VIDEO FILE UPLOAD + PLAYBACK CONTROLS  (AdminApp.jsx › LiveFeedPanel, ~line 282)
 *    - Rendered only when `videoSource === "video"`
 *    - File picker (<input type="file" accept="video/*">) stores selection in local
 *      `videoFile` state inside LiveFeedPanel
 *    - "Load" button  → POST ${PI_API_URL}/video/load  (multipart FormData, field "video")
 *    - "Start/Resume" → POST ${PI_API_URL}/video/start
 *    - "Pause"        → POST ${PI_API_URL}/video/pause
 *    - "Stop"         → POST ${PI_API_URL}/video/stop  (also clears progress)
 *    - Progress bar polls GET ${PI_API_URL}/video/status every 2 s while playing
 *        Response shape: { state: "playing"|"paused"|"stopped", frame, total, fps }
 *        Auto-transitions playState → "stopped" when d.state === "stopped"
 *
 * 3. LIFTED STATE IN AdminApp ROOT  (AdminApp.jsx ~line 2031)
 *    const [videoSource,    setVideoSource]    = useState("camera");
 *    const [videoPlayState, setVideoPlayState] = useState("stopped");
 *    const [videoProgress,  setVideoProgress]  = useState(null);
 *    Passed as props to <LiveFeedPanel> so state survives tab switches.
 *
 * 4. FLASK API ENDPOINTS REQUIRED ON BOTH SERVERS  (flask_api.py)
 *    POST /video/load    — accept multipart "video" file, cache it for playback
 *    POST /video/start   — begin frame-by-frame MJPEG playback from cached file
 *    POST /video/pause   — pause playback (resume with /video/start)
 *    POST /video/stop    — stop and reset playback state
 *    GET  /video/status  — return { state, frame, total, fps }
 *    (Already on the desktop server. Pi server needs the same five routes.)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import AdminApp from './AdminApp';

export default function AdminPanel() {
  return <AdminApp />;
}
