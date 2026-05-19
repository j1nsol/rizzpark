import { Fragment, useEffect, useRef, useState, useMemo } from 'react';
import ParkingSlotCard from './ParkingSlotCard';
import { computeCentroid, groupSlotsByRowField } from '../utils/slotModel';

const CARD_W = 60;
const CARD_H = 100;
const PAD    = 64;

export default function ParkingMapSpatial({
  slots       = [],
  selected    = null,
  onSelect    = () => {},
  showCarIcon = true,
  filter      = 'all',
  movingCars  = {},
}) {
  const wrapRef = useRef(null);
  const [containerW, setContainerW] = useState(700);

  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(([e]) =>
      setContainerW(e.contentRect.width || 700)
    );
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const filtered = filter === 'all' ? slots : slots.filter(s => s.status === filter);

  const layout = useMemo(() => {
    const cardW = containerW <= 370 ? 18 : containerW <= 480 ? 22 : 60;
    const cardH = containerW <= 370 ? 30 : containerW <= 480 ? 36 : 100;
    const pad   = containerW <= 480 ? 16 : 64;

    const withCoords = filtered.filter(s => s.coords?.length >= 3);
    const noCoords   = filtered.filter(s => !s.coords?.length);

    if (!withCoords.length) {
      return { mode: 'rows', rows: groupSlotsByRowField(filtered), noCoords: [] };
    }

    const pts = withCoords.map(s => {
      const { x: cx, y: cy } = computeCentroid(s.coords);
      return { ...s, cx, cy };
    });

    const allX = pts.map(p => p.cx);
    const allY = pts.map(p => p.cy);
    const minX = Math.min(...allX), maxX = Math.max(...allX);
    const minY = Math.min(...allY), maxY = Math.max(...allY);
    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;

    const innerW = Math.max(containerW - 2 * pad - cardW, 100);
    const aspect = Math.min(Math.max(rangeY / rangeX, 0.3), 2.0);
    const innerH = innerW * aspect;

    const toLeft = cx => pad + ((cx - minX) / rangeX) * innerW;
    const toTop  = cy => pad + ((cy - minY) / rangeY) * innerH;

    // 1. Initial screen positions from camera coords
    const rawPositioned = pts.map(s => ({ ...s, left: toLeft(s.cx), top: toTop(s.cy) }));

    // 2. Group by row field, snap Y to row average, enforce min horizontal gap
    const rowGroups = {};
    rawPositioned.forEach(s => {
      const r = s.row ?? '?';
      if (!rowGroups[r]) rowGroups[r] = [];
      rowGroups[r].push(s);
    });

    const MIN_X_GAP = cardW + 10;
    const maxLeft   = containerW - pad;

    const snapped   = [];
    const rowLabels = [];

    Object.entries(rowGroups)
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([label, group]) => {
        const avgTop = group.reduce((sum, s) => sum + s.top, 0) / group.length;

        const sorted = [...group].sort((a, b) => a.left - b.left);
        for (let i = 1; i < sorted.length; i++) {
          if (sorted[i].left - sorted[i - 1].left < MIN_X_GAP) {
            sorted[i] = { ...sorted[i], left: sorted[i - 1].left + MIN_X_GAP };
          }
        }

        const overflow = sorted[sorted.length - 1].left - maxLeft;
        if (overflow > 0) {
          sorted.forEach((s, i) => { sorted[i] = { ...s, left: s.left - overflow }; });
        }

        sorted.forEach(s => snapped.push({ ...s, top: avgTop }));

        const groupCenterX = sorted.reduce((sum, s) => sum + s.left, 0) / sorted.length;
        rowLabels.push({ label, left: groupCenterX, top: avgTop - cardH * 0.7, centerY: avgTop });
      });

    const containerH = Math.max(...snapped.map(s => s.top)) + cardH / 2 + pad;

    const GAP_THRESHOLD = cardH * 0.8;

    const driveways = [];
    const rowsByY = rowLabels.slice().sort((a, b) => a.centerY - b.centerY);
    for (let i = 0; i < rowsByY.length - 1; i++) {
      const gap = rowsByY[i + 1].centerY - rowsByY[i].centerY - cardH;
      if (gap > GAP_THRESHOLD) {
        const LANE_PAD = 18;
        driveways.push({
          top:    rowsByY[i].centerY + cardH / 2 + LANE_PAD,
          height: gap - 2 * LANE_PAD,
          label:  `Drive Lane ${i + 1}`,
        });
      }
    }

    return { mode: 'spatial', positioned: snapped, rowLabels, driveways, containerH, noCoords, toLeft, toTop };
  }, [filtered, containerW]);

  // ── Fallback: no coord data → stable row-grid ──────────────────────────────
  if (layout.mode === 'rows') {
    return (
      <div className="parking-map" ref={wrapRef}>
        <div className="map-inner" style={{ width: 'fit-content', margin: '0 auto' }}>
          {layout.rows.length === 0 && (
            <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-2)', fontSize: 12 }}>
              No slots match the current filter.
            </div>
          )}
          {layout.rows.map(({ label, slots: rowSlots }, ri) => (
            <Fragment key={label}>
              {ri > 0 && (
                <div className="map-road">
                  <span className="road-label">Drive Lane {ri}</span>
                </div>
              )}
              <div className="slot-row">
                <span className="slot-row-label">Row {label}</span>
                <div className="slot-row-wrap" style={{ justifyContent: 'flex-start' }}>
                  {rowSlots.map(slot => (
                    <ParkingSlotCard
                      key={slot.id}
                      slot={slot}
                      isSelected={selected === slot.id}
                      onClick={() => onSelect(selected === slot.id ? null : slot.id)}
                      theme="driver"
                      showCarIcon={showCarIcon}
                    />
                  ))}
                </div>
              </div>
            </Fragment>
          ))}
        </div>
      </div>
    );
  }

  // ── Spatial mode: absolute positioning from camera coords ──────────────────
  return (
    <div className="parking-map" ref={wrapRef} style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ position: 'relative', width: '100%', height: layout.containerH }}>

        {layout.driveways.map(({ top, height, label }) => (
          <div
            key={label}
            className="map-road"
            style={{ position: 'absolute', left: 0, right: 0, top, height, margin: 0 }}
          >
            <span className="road-label">{label}</span>
          </div>
        ))}

        {layout.positioned.map(slot => (
          <div key={slot.id} style={{
            position: 'absolute',
            left: slot.left,
            top:  slot.top,
            transform: 'translate(-50%, -50%)',
          }}>
            <ParkingSlotCard
              slot={slot}
              isSelected={selected === slot.id}
              onClick={() => onSelect(selected === slot.id ? null : slot.id)}
              theme="driver"
              showCarIcon={showCarIcon}
            />
          </div>
        ))}

        {Object.entries(movingCars).map(([key, { cx, cy }]) => (
          <div
            key={key}
            className="moving-car-emoji"
            style={{
              left: layout.toLeft(cx),
              top:  layout.toTop(cy),
            }}
          >
            🚗
          </div>
        ))}
      </div>

      {layout.noCoords.length > 0 && (
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.06em' }}>
            Other slots
          </div>
          <div className="slot-row-wrap" style={{ justifyContent: 'flex-start' }}>
            {layout.noCoords.map(slot => (
              <ParkingSlotCard
                key={slot.id}
                slot={slot}
                isSelected={selected === slot.id}
                onClick={() => onSelect(selected === slot.id ? null : slot.id)}
                theme="driver"
                showCarIcon={showCarIcon}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
