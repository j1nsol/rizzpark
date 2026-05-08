export const PI_URL      = "http://192.168.192.138:5000";
export const DESKTOP_URL = "http://localhost:5000";

const STORAGE_KEY       = "parking_admin_mode";
const FIREBASE_PATH_KEY = "parking_firebase_path";

let _mode         = localStorage.getItem(STORAGE_KEY) === "desktop" ? "desktop" : "pi";
let _firebasePath = localStorage.getItem(FIREBASE_PATH_KEY) || "parking";

export function getMode()   { return _mode; }
export function getApiUrl() { return _mode === "desktop" ? DESKTOP_URL : PI_URL; }

export function getFirebasePath() { return _firebasePath; }
export function setFirebasePath(path) {
  _firebasePath = path;
  localStorage.setItem(FIREBASE_PATH_KEY, path);
}

// Alias kept for callers — now driven by _firebasePath, not _mode
export function getFirebaseParkingPath() { return _firebasePath; }

export function setMode(newMode) {
  _mode = newMode === "desktop" ? "desktop" : "pi";
  localStorage.setItem(STORAGE_KEY, _mode);
  return getApiUrl();
}
