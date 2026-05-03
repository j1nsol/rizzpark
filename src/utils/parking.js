// ── Data constants ────────────────────────────────────────────────────────────
export const ROWS = ['A', 'B', 'C', 'D', 'E'];
export const COLS = 5;

// ── Slot builders ─────────────────────────────────────────────────────────────
export function buildSlots() {
  return ROWS.flatMap((row) =>
    Array.from({ length: COLS }, (_, c) => {
      const id = `${row}${c + 1}`;
      return {
        id,
        row,
        col: c + 1,
        status: Math.random() > 0.48 ? 'occupied' : 'vacant',
        updatedAt: Date.now() - Math.floor(Math.random() * 600_000),
        justChanged: false,
      };
    })
  );
}

export function loadSlots() {
  try {
    const raw = localStorage.getItem('rizzpark_v2_slots');
    if (raw) {
      const parsed = JSON.parse(raw);
      return parsed.map((s) => ({ ...s, justChanged: false }));
    }
  } catch {
    // ignore corrupt storage
  }
  return buildSlots();
}

// ── Formatters ────────────────────────────────────────────────────────────────
export function timeAgo(ts) {
  const d = Math.floor((Date.now() - ts) / 1000);
  if (d < 60) return `${d}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  return `${Math.floor(d / 3600)}h ago`;
}

export function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

// ── Notification helpers ──────────────────────────────────────────────────────
export const canNotify = () => 'Notification' in window;
export const isGranted = () => canNotify() && Notification.permission === 'granted';

export async function requestPerm() {
  if (!canNotify()) return false;
  return (await Notification.requestPermission()) === 'granted';
}

export function fireNotif(slot) {
  if (!isGranted()) return;
  if (document.visibilityState !== 'visible') return;
  new Notification('Rizz Park — Slot Available!', {
    body: `Slot ${slot.id} (Row ${slot.row}) just opened up.`,
    icon: `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='8' fill='%23F5A623'/><text x='7' y='22' font-size='18' fill='white' font-family='sans-serif' font-weight='bold'>P</text></svg>`,
    tag: `slot-${slot.id}`,
  });
}

// ── Device detection ──────────────────────────────────────────────────────────
export const isMobile =
  /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent) ||
  (navigator.maxTouchPoints > 1 && /MacIntel/.test(navigator.platform));

export const isIOS =
  /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
  (navigator.maxTouchPoints > 1 && /MacIntel/.test(navigator.platform));

export const ONBOARDING_KEY = 'rizzpark_onboarded';
