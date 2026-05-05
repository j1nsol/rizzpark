// ── Shared Parking Slot Data Model ────────────────────────────────────────────
// Normalized structure linking detection vectors (coords) to UI data.
// Consumed by both the Admin Panel and the Public Driver Interface.
//
// NormalizedSlot shape:
//   id         : string                         — e.g. "A1"
//   status     : "occupied" | "vacant"          — always lowercase
//   row        : string | null                  — letter label, e.g. "A"
//   col        : number | null                  — column index
//   coords     : [[x,y],[x,y],[x,y],[x,y]] | null — detection quad (camera pixels)
//   confidence : number                         — YOLO confidence 0–1
//   updatedAt  : number                         — Unix ms timestamp
//   justChanged: boolean                        — animation hint

// ── Normalisers ───────────────────────────────────────────────────────────────

export function normalizeAdminSlot(id, raw) {
  return {
    id,
    status: raw.status?.toLowerCase() === 'occupied' ? 'occupied' : 'vacant',
    row: raw.row ?? null,
    col: null,
    coords: raw.coords ?? null,
    confidence: raw.confidence ?? 0.8,
    updatedAt: raw.updatedAt ?? Date.now(),
    justChanged: false,
  };
}

export function normalizeDriverSlot(slot) {
  return {
    id: slot.id,
    status: slot.status,
    row: slot.row ?? null,
    col: slot.col ?? null,
    coords: slot.coords ?? null,
    confidence: slot.confidence ?? null,
    updatedAt: slot.updatedAt ?? Date.now(),
    justChanged: slot.justChanged ?? false,
  };
}

// Convert admin slots object { id: rawSlot } → NormalizedSlot[]
export function normalizeAdminSlotsObject(slotsObj) {
  return Object.entries(slotsObj).map(([id, raw]) => normalizeAdminSlot(id, raw));
}

// ── Geometry helpers ──────────────────────────────────────────────────────────

// Returns {x, y} centroid of quad [[x,y]×4] or legacy rect [x1,y1,x2,y2]
export function computeCentroid(coords) {
  if (!coords || coords.length === 0) return { x: 0, y: 0 };
  if (Array.isArray(coords[0])) {
    return {
      x: coords.reduce((s, p) => s + p[0], 0) / coords.length,
      y: coords.reduce((s, p) => s + p[1], 0) / coords.length,
    };
  }
  // legacy [x1, y1, x2, y2]
  return { x: (coords[0] + coords[2]) / 2, y: (coords[1] + coords[3]) / 2 };
}

// ── Row grouping ─────────────────────────────────────────────────────────────

// Groups NormalizedSlot[] into rows by Y-axis proximity of their coord centroids.
// Adaptive threshold: 2× the median consecutive Y gap is the row separator.
// Falls back to groupSlotsByRowField when no slots have coords.
//
// Returns [{ label: string, slots: NormalizedSlot[] }] sorted top → bottom.
export function groupSlotsByYProximity(slots, gapThreshold) {
  if (!slots.length) return [];

  const withY = slots.map(s => ({
    ...s,
    _cy: s.coords ? computeCentroid(s.coords).y : null,
  }));

  const withCoords = withY.filter(s => s._cy !== null).sort((a, b) => a._cy - b._cy);
  const noCoords   = withY.filter(s => s._cy === null);

  if (!withCoords.length) return groupSlotsByRowField(slots);

  // Auto-compute separation threshold when not supplied
  if (gapThreshold === undefined) {
    const gaps = [];
    for (let i = 1; i < withCoords.length; i++) {
      gaps.push(withCoords[i]._cy - withCoords[i - 1]._cy);
    }
    if (gaps.length) {
      const sorted = [...gaps].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      gapThreshold = Math.max(median * 2, 50);
    } else {
      gapThreshold = 100;
    }
  }

  // Cluster consecutive slots whose Y gap exceeds the threshold into separate rows
  const rowBuckets = [];
  let current = [withCoords[0]];
  for (let i = 1; i < withCoords.length; i++) {
    if (withCoords[i]._cy - withCoords[i - 1]._cy > gapThreshold) {
      rowBuckets.push(current);
      current = [];
    }
    current.push(withCoords[i]);
  }
  rowBuckets.push(current);

  // Append any coord-less slots to the last row
  if (noCoords.length) rowBuckets[rowBuckets.length - 1].push(...noCoords);

  // Label each row: prefer the existing row field, else derive A / B / C …
  return rowBuckets.map((rowSlots, i) => {
    const label = rowSlots.find(s => s.row)?.row ?? String.fromCharCode(65 + i);
    const sorted = [...rowSlots].sort((a, b) => {
      const ax = a.coords ? computeCentroid(a.coords).x : (a.col ?? 0) * 100;
      const bx = b.coords ? computeCentroid(b.coords).x : (b.col ?? 0) * 100;
      return ax - bx;
    });
    return { label, slots: sorted.map(({ _cy, ...rest }) => rest) };
  });
}

// Groups NormalizedSlot[] by the explicit row field (no coords required).
// Sorts rows alphabetically and slots within each row by col.
export function groupSlotsByRowField(slots) {
  const map = {};
  slots.forEach(s => {
    const row = s.row ?? s.id?.match(/^([A-Za-z]+)/)?.[1] ?? '?';
    if (!map[row]) map[row] = [];
    map[row].push(s);
  });
  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, rowSlots]) => ({
      label,
      slots: rowSlots.sort((a, b) => (a.col ?? 0) - (b.col ?? 0)),
    }));
}

// Auto-selects grouping strategy:
//   • coords present  → Y-proximity clustering (dynamic, no hardcoding)
//   • coords absent   → row field grouping
export function groupSlots(slots, gapThreshold) {
  return slots.some(s => s.coords)
    ? groupSlotsByYProximity(slots, gapThreshold)
    : groupSlotsByRowField(slots);
}
