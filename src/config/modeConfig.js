export const PI_URL      = "http://192.168.1.104:5000";
export const DESKTOP_URL = "http://localhost:5000";

const STORAGE_KEY = "parking_admin_mode";
let _mode = localStorage.getItem(STORAGE_KEY) === "desktop" ? "desktop" : "pi";

export function getMode()   { return _mode; }
export function getApiUrl() { return _mode === "desktop" ? DESKTOP_URL : PI_URL; }

// Desktop reads/writes a separate Firebase node to avoid polluting production data
export function getFirebaseParkingPath() {
  return _mode === "desktop" ? "parking_desktop" : "parking";
}

export function setMode(newMode) {
  _mode = newMode === "desktop" ? "desktop" : "pi";
  localStorage.setItem(STORAGE_KEY, _mode);
  return getApiUrl();
}
