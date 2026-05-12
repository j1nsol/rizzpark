# Python Backend — Pi Registry & Consolidated Firebase Paths

## Context

This is the Raspberry Pi backend for a multi-location smart parking system.
The web admin panel (`/admin`) can have multiple Pis registered and switch between them.
Each Pi self-registers to Firebase so the admin panel can discover it and route requests
to the correct ZeroTier IP.

There may be **one Pi or several**. Each physical Pi has its own copy of these files with
a unique `LOCAL_PIN_CODE`. All data is isolated under `/locations/{pinCode}/` in Firebase.

---

## Firebase Path Structure (Consolidated)

```
/locations/{pinCode}/slots        → live occupancy per slot (written by Pi every cycle)
/locations/{pinCode}/layout       → slot coordinate layout (written by Pi on remap)
/map_pins/{pinCode}               → geo pin metadata (name, lat, lng — written by web admin)
/pi_registry/{LOCAL_PIN_CODE}     → this Pi's registration record (written by Pi, read by web)
/pi_config/active_pin             → optional manual override pin code (written by web admin)
```

**Never write to the old paths** (`/parking/`, `/parking_locations/`, `/pin_slot_layouts/`).
All reads and writes must use `/locations/{pinCode}/` as the prefix.

---

## Required Changes

### `firebase_sync.py`

**Goal:** Route all Firebase writes to `/locations/{active_pin}/` instead of a hardcoded path.
The active pin is resolved at startup: check `/pi_config/active_pin` first (manual override
from the web admin), fall back to `LOCAL_PIN_CODE` from `flask_api.py`.

#### 1. Constructor — accept `pin_code` param and store base path

Find the `__init__` method of `FirebaseSync`. Change it so it:
- Accepts a `pin_code: str` parameter (the resolved pin code, passed in from `flask_api.py`)
- Sets `self._base = f"locations/{pin_code.strip('/')}"` — used as prefix for all writes

```python
def __init__(self, credentials_path: str, database_url: str, pin_code: str = "default"):
    # ... existing Firebase Admin SDK init (cred, initialize_app, etc.) stays unchanged ...
    self._base = f"locations/{pin_code.strip('/')}"
```

#### 2. `push_occupancy` — write to `/locations/{pinCode}/slots`

Find the method that pushes slot occupancy status to Firebase.
Replace its Firebase write with:

```python
def push_occupancy(self, statuses: dict):
    """Write {slotId: status_string} to /locations/{pinCode}/slots."""
    payload = {
        slot_id: {
            "status":    status,
            "updatedAt": int(time.time() * 1000),
        }
        for slot_id, status in statuses.items()
    }
    try:
        db.reference(f"/{self._base}/slots").update(payload)
    except Exception as e:
        log.warning(f"Firebase occupancy push failed: {e}")
```

Use `.update()` (not `.set()`) so each slot is written independently — a partial update
won't erase other slots if one fails.

#### 3. `push_slot_layout` — write to `/locations/{pinCode}/layout`

Find the method that pushes slot layout (coords, row) to Firebase.
Replace its Firebase write with:

```python
def push_slot_layout(self, slots: dict):
    """Write full slot layout to /locations/{pinCode}/layout."""
    layout = {
        slot_id: {
            "coords": s.get("coords"),
            "row":    s.get("row"),
        }
        for slot_id, s in slots.items()
    }
    try:
        db.reference(f"/{self._base}/layout").set(layout)
    except Exception as e:
        log.warning(f"Firebase layout push failed: {e}")
```

Use `.set()` here — the layout is a complete snapshot, replacing the old one atomically.

---

### `flask_api.py`

**Goal:** Give this Pi a unique identity (`LOCAL_PIN_CODE`), detect its ZeroTier IP at
startup, and self-register to Firebase so the web admin panel can see it and route requests
to it. Also resolve the active pin code (manual override vs. local default).

#### 1. Add config constants near the top of the file

Add these after existing imports, near other config constants:

```python
LOCAL_PIN_CODE = "CITU-A"   # CHANGE THIS per physical Pi (must be unique, URL-safe)
FLASK_PORT     = 5000        # must match the port Flask listens on
```

`LOCAL_PIN_CODE` is the fallback pin code if no manual override is set in Firebase.
It must match an entry in `/map_pins/` in Firebase (created via the web admin Pins tab).

#### 2. Add `get_zerotier_ip()` function

Add this function. It finds the ZeroTier virtual network interface (always named `zt*`
on Linux/Raspberry Pi OS) and returns its IPv4 address.

```python
def get_zerotier_ip() -> str | None:
    """Return the IPv4 address of the ZeroTier interface, or None if not connected."""
    try:
        import netifaces
        for iface in netifaces.interfaces():
            if iface.startswith("zt"):
                addrs = netifaces.ifaddresses(iface).get(netifaces.AF_INET, [])
                if addrs:
                    return addrs[0]["addr"]
    except ImportError:
        log.warning("netifaces not installed — run: pip install netifaces")
    return None
```

#### 3. Add `resolve_pin_code()` function

This checks Firebase for a manual override first, falls back to `LOCAL_PIN_CODE`.

```python
def resolve_pin_code() -> str:
    """
    Check /pi_config/active_pin in Firebase.
    If the web admin has set a manual override, use it.
    Otherwise use this Pi's LOCAL_PIN_CODE.
    """
    try:
        manual = db.reference("/pi_config/active_pin").get()
        if manual and isinstance(manual, str):
            log.info(f"Manual pin override active: {manual}")
            return manual
    except Exception as e:
        log.warning(f"Could not read pi_config/active_pin: {e}")
    return LOCAL_PIN_CODE
```

#### 4. Add `register_pi()` and heartbeat

Add these two functions. `register_pi()` writes this Pi's metadata to
`/pi_registry/{LOCAL_PIN_CODE}` using `.update()` (idempotent — safe to call on every restart).

```python
def register_pi() -> None:
    """Write Pi metadata to /pi_registry/{LOCAL_PIN_CODE} in Firebase."""
    zt_ip = get_zerotier_ip()
    if not zt_ip:
        log.warning("ZeroTier not connected — skipping Pi registration")
        return
    try:
        active_pin = resolve_pin_code()
        db.reference(f"/pi_registry/{LOCAL_PIN_CODE}").update({
            "pinCode":       LOCAL_PIN_CODE,
            "activePinCode": active_pin,
            "apiUrl":        f"http://{zt_ip}:{FLASK_PORT}",
            "ztIp":          zt_ip,
            "lastSeen":      int(time.time() * 1000),
        })
        log.info(f"Registered as {LOCAL_PIN_CODE} → {zt_ip}:{FLASK_PORT} (active pin: {active_pin})")
    except Exception as e:
        log.warning(f"Pi registration failed: {e}")


def _heartbeat_loop() -> None:
    """Update lastSeen and ZeroTier IP in Firebase every 15 seconds."""
    while True:
        time.sleep(15)
        try:
            register_pi()
        except Exception as e:
            log.warning(f"Heartbeat failed: {e}")
```

#### 5. Start registration + heartbeat before `app.run()`

Find where `app.run(...)` is called at the bottom of the file. Add these lines **before** it:

```python
# Resolve active pin code (manual override > local default)
active_pin = resolve_pin_code()

# Instantiate FirebaseSync with the resolved pin code
# Replace the existing FirebaseSync(...) instantiation with this:
firebase = FirebaseSync(
    credentials_path=CREDENTIALS,   # use whatever variable name holds the path
    database_url=FIREBASE_URL,
    pin_code=active_pin,
)

# Register this Pi in Firebase and start heartbeat
register_pi()
threading.Thread(target=_heartbeat_loop, daemon=True).start()
```

If `FirebaseSync` is already instantiated earlier in the file, move or update that
instantiation so `pin_code=active_pin` is passed to it.

Make sure `import threading` and `import time` are present at the top of the file.

#### 6. Install `netifaces` on the Pi

Run on the Raspberry Pi:
```bash
pip install netifaces
```

---

### `detector.py`

`detector.py` should not need to know the pin code directly — it produces detection results
and passes them to `FirebaseSync` (or via `flask_api.py`). No changes are required here
**unless** `detector.py` directly writes to Firebase itself, in which case:

- Find any `db.reference(...)` calls inside `detector.py`
- Check if they write to `/parking/`, `/parking_locations/`, or `/pin_slot_layouts/`
- If they do, replace those writes with calls to `firebase_sync.push_occupancy()` or
  `firebase_sync.push_slot_layout()` instead, so all Firebase writes go through
  `FirebaseSync` and use the correct `/locations/{pinCode}/` path

If `detector.py` only calls methods on a `FirebaseSync` instance (or calls functions in
`flask_api.py`), no changes are needed.

---

## Verification

After applying changes:

1. Start one Pi (`flask_api.py`). Check Firebase console:
   - `/pi_registry/CITU-A` should appear within a few seconds with `apiUrl`, `ztIp`, `lastSeen`
   - `/locations/CITU-A/slots` should populate when the camera sees parking slots
   - `/locations/CITU-A/layout` should appear after a remap

2. Open the web admin panel → Admin Panel. A pill labelled `CITU-A` with a green dot
   should appear between the connection banner and the stats row.

3. Click the pill to select it. The Camera Feed, Slot Editor, Properties, and Image Test
   tabs should now connect to that Pi's ZeroTier IP.

4. In the Pins tab, set the Pi Assignment to `CITU-A`. The badge should turn green:
   "Manual Override → CITU-A". Check `/pi_config/active_pin` in Firebase = `"CITU-A"`.
   Restart the Pi — `resolve_pin_code()` should log "Manual pin override active: CITU-A".

5. Click "Clear Override" in the Pins tab. Restart the Pi — it should fall back to
   its `LOCAL_PIN_CODE`.
