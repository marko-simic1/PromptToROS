import React, {
  useRef,
  useEffect,
  useCallback,
  useState,
  useMemo,
} from 'react';
import { Map, Trash2, ZoomIn, ZoomOut, Crosshair, PenLine } from 'lucide-react';
import useRobotStore from '../store/useRobotStore';

/* ─── constants ─────────────────────────────────────── */
const BASE_SCALE = 50; // px per metre at zoom=1
const GRID_STEP  = 1;  // metres between grid lines

/** Convert ROS world coords → canvas pixel coords */
function rosToCanvas(rx, ry, canvas, zoom, offset) {
  const cx = canvas.width  / 2 + offset.x;
  const cy = canvas.height / 2 + offset.y;
  return { x: cx + rx * BASE_SCALE * zoom, y: cy - ry * BASE_SCALE * zoom };
}

/** Convert canvas pixel coords → ROS world coords */
function canvasToRos(px, py, canvas, zoom, offset) {
  const cx = canvas.width  / 2 + offset.x;
  const cy = canvas.height / 2 + offset.y;
  return {
    x:  (px - cx) / (BASE_SCALE * zoom),
    y: -(py - cy) / (BASE_SCALE * zoom),
  };
}

/* ─── draw ───────────────────────────────────────────── */
function drawMap({ canvas, position, orientation, noGoZones, zoom, offset, drawingRect }) {
  if (!canvas) return;
  const ctx  = canvas.getContext('2d');
  const { width: W, height: H } = canvas;

  /* Background */
  ctx.fillStyle = '#09090b';
  ctx.fillRect(0, 0, W, H);

  const cx = W / 2 + offset.x;
  const cy = H / 2 + offset.y;
  const gp = GRID_STEP * BASE_SCALE * zoom;

  /* ── minor grid lines ── */
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth   = 1;
  for (let x = ((cx % gp) + gp) % gp; x < W; x += gp) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let y = ((cy % gp) + gp) % gp; y < H; y += gp) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }

  /* ── axes ── */
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.lineWidth   = 1;
  ctx.setLineDash([6, 4]);
  ctx.beginPath(); ctx.moveTo(cx, 0);  ctx.lineTo(cx, H); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0,  cy); ctx.lineTo(W, cy); ctx.stroke();
  ctx.setLineDash([]);

  /* ── axis labels ── */
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.font      = '10px monospace';
  ctx.fillText('+X', cx + 6, cy - 6);
  ctx.fillText('+Y', cx + 6, 14);

  /* ── metre labels on X axis ── */
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.font      = '9px monospace';
  for (let m = -20; m <= 20; m++) {
    if (m === 0) continue;
    const px = cx + m * BASE_SCALE * zoom;
    if (px < 0 || px > W) continue;
    ctx.fillText(`${m}m`, px - 7, cy + 12);
  }

  /* ── no-go zones ── */
  noGoZones.forEach((zone) => {
    const s = rosToCanvas(zone.x1, zone.y1, canvas, zoom, offset);
    const e = rosToCanvas(zone.x2, zone.y2, canvas, zoom, offset);
    const rx = Math.min(s.x, e.x);
    const ry = Math.min(s.y, e.y);
    const rw = Math.abs(e.x - s.x);
    const rh = Math.abs(e.y - s.y);

    ctx.fillStyle   = 'rgba(239,68,68,0.12)';
    ctx.strokeStyle = 'rgba(239,68,68,0.55)';
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([5, 3]);
    ctx.fillRect(rx, ry, rw, rh);
    ctx.strokeRect(rx, ry, rw, rh);
    ctx.setLineDash([]);

    /* Label */
    ctx.fillStyle = 'rgba(239,68,68,0.7)';
    ctx.font      = '9px monospace';
    ctx.fillText('NO-GO', rx + 4, ry + 12);
  });

  /* ── live drawing rect ── */
  if (drawingRect) {
    const { x, y, w, h } = drawingRect;
    ctx.fillStyle   = 'rgba(239,68,68,0.08)';
    ctx.strokeStyle = 'rgba(239,68,68,0.4)';
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);
  }

  /* ── robot ── */
  const rp  = rosToCanvas(position.x, position.y, canvas, zoom, offset);
  const yaw = orientation.yaw;
  const r   = Math.max(8, 10 * zoom);

  ctx.save();
  ctx.translate(rp.x, rp.y);
  ctx.rotate(-yaw);

  // outer glow
  ctx.shadowColor = 'rgba(59,130,246,0.7)';
  ctx.shadowBlur  = 18;

  // body circle
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle   = 'rgba(59,130,246,0.25)';
  ctx.strokeStyle = '#3b82f6';
  ctx.lineWidth   = 2;
  ctx.fill();
  ctx.stroke();

  // direction arrow (triangle pointing +X in ROS = up on canvas after rotation)
  const ah = r * 1.3;
  ctx.shadowBlur  = 0;
  ctx.beginPath();
  ctx.moveTo(0, -ah);
  ctx.lineTo(-r * 0.45, r * 0.4);
  ctx.lineTo( r * 0.45, r * 0.4);
  ctx.closePath();
  ctx.fillStyle = '#60a5fa';
  ctx.fill();

  ctx.restore();

  /* ── origin cross ── */
  const o = rosToCanvas(0, 0, canvas, zoom, offset);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth   = 1;
  ctx.beginPath(); ctx.moveTo(o.x - 6, o.y); ctx.lineTo(o.x + 6, o.y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(o.x, o.y - 6); ctx.lineTo(o.x, o.y + 6); ctx.stroke();

  /* ── HUD: coordinate readout ── */
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.font      = '10px monospace';
  ctx.fillText(
    `x: ${position.x.toFixed(2)} m   y: ${position.y.toFixed(2)} m`,
    8,
    H - 8
  );
}

/* ─── component ──────────────────────────────────────── */
export default function CanvasMap() {
  const { position, orientation, noGoZones, addNoGoZone, clearNoGoZones } = useRobotStore();

  const canvasRef    = useRef(null);
  const drawFnRef    = useRef(null); // always-latest draw closure for ResizeObserver
  const [zoom,   setZoom]   = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [mode,   setMode]   = useState('view'); // 'view' | 'draw'

  /* Drawing state */
  const [isDrawing,   setIsDrawing]   = useState(false);
  const [drawStart,   setDrawStart]   = useState(null);
  const [drawingRect, setDrawingRect] = useState(null);

  /* Stable draw function */
  const draw = useCallback(() => {
    drawMap({
      canvas: canvasRef.current,
      position, orientation, noGoZones, zoom, offset, drawingRect,
    });
  }, [position, orientation, noGoZones, zoom, offset, drawingRect]);

  // Keep the ref updated so ResizeObserver always calls latest version
  useEffect(() => { drawFnRef.current = draw; }, [draw]);

  /* Resize observer — keeps canvas resolution = container pixels */
  useEffect(() => {
    const canvas    = canvasRef.current;
    if (!canvas) return;
    const container = canvas.parentElement;
    if (!container) return;

    const ro = new ResizeObserver(() => {
      canvas.width  = container.clientWidth;
      canvas.height = container.clientHeight;
      drawFnRef.current?.();
    });
    ro.observe(container);
    // Initial size
    canvas.width  = container.clientWidth;
    canvas.height = container.clientHeight;
    draw();

    return () => ro.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* Redraw when state changes */
  useEffect(() => { draw(); }, [draw]);

  /* ── Mouse handlers for no-go zone drawing ── */
  const getCanvasXY = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handleMouseDown = useCallback((e) => {
    if (mode !== 'draw') return;
    const { x, y } = getCanvasXY(e);
    setIsDrawing(true);
    setDrawStart({ x, y });
    setDrawingRect({ x, y, w: 0, h: 0 });
  }, [mode]);

  const handleMouseMove = useCallback((e) => {
    if (!isDrawing || mode !== 'draw') return;
    const { x, y } = getCanvasXY(e);
    setDrawingRect({
      x: Math.min(drawStart.x, x),
      y: Math.min(drawStart.y, y),
      w: Math.abs(x - drawStart.x),
      h: Math.abs(y - drawStart.y),
    });
  }, [isDrawing, drawStart, mode]);

  const handleMouseUp = useCallback((e) => {
    if (!isDrawing || mode !== 'draw') return;
    const canvas  = canvasRef.current;
    const { x, y } = getCanvasXY(e);

    if (Math.abs(x - drawStart.x) > 8 && Math.abs(y - drawStart.y) > 8) {
      const r1 = canvasToRos(drawStart.x, drawStart.y, canvas, zoom, offset);
      const r2 = canvasToRos(x, y, canvas, zoom, offset);
      addNoGoZone({
        x1: Math.min(r1.x, r2.x),
        y1: Math.min(r1.y, r2.y),
        x2: Math.max(r1.x, r2.x),
        y2: Math.max(r1.y, r2.y),
      });
    }
    setIsDrawing(false);
    setDrawStart(null);
    setDrawingRect(null);
  }, [isDrawing, drawStart, zoom, offset, addNoGoZone, mode]);

  const cancelDraw = useCallback(() => {
    setIsDrawing(false);
    setDrawStart(null);
    setDrawingRect(null);
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 shrink-0">
        <div className="flex items-center gap-2">
          <Map size={13} className="text-zinc-400" />
          <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">2D Map</span>
          {noGoZones.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-950/50 border border-red-800/40 text-red-400 font-mono">
              {noGoZones.length} no-go
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {/* Draw mode toggle */}
          <button
            onClick={() => { setMode((m) => (m === 'draw' ? 'view' : 'draw')); cancelDraw(); }}
            title="Toggle no-go zone drawing"
            className={[
              'flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border transition-colors',
              mode === 'draw'
                ? 'bg-red-950/50 border-red-500/50 text-red-400'
                : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200',
            ].join(' ')}
          >
            <PenLine size={11} />
            <span className="hidden sm:inline">{mode === 'draw' ? 'Drawing…' : 'No-Go Zone'}</span>
          </button>

          {/* Clear zones */}
          <button
            onClick={clearNoGoZones}
            title="Clear all no-go zones"
            className="p-1.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <Trash2 size={11} />
          </button>

          {/* Zoom controls */}
          <button
            onClick={() => setZoom((z) => Math.min(z + 0.25, 5))}
            className="p-1.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <ZoomIn size={11} />
          </button>
          <span className="text-[10px] font-mono text-zinc-500 w-9 text-center">
            {(zoom * 100).toFixed(0)}%
          </span>
          <button
            onClick={() => setZoom((z) => Math.max(z - 0.25, 0.25))}
            className="p-1.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <ZoomOut size={11} />
          </button>

          {/* Re-centre */}
          <button
            onClick={() => setOffset({ x: 0, y: 0 })}
            title="Re-centre on origin"
            className="p-1.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <Crosshair size={11} />
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 relative min-h-0">
        <canvas
          ref={canvasRef}
          className={[
            'w-full h-full block',
            mode === 'draw' ? 'cursor-crosshair' : 'cursor-default',
          ].join(' ')}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={cancelDraw}
        />
      </div>
    </div>
  );
}
