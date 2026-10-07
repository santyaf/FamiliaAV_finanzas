import React from 'react';
import { T, FONT_MONO } from '../ui/theme';

// Línea de evolución en SVG (sin librerías): serie [{ date, value }] ascendente y, opcional, una línea de
// referencia (por ejemplo tu costo promedio). Se adapta al ancho y muestra el mínimo y el máximo.
export function sparklinePoints(series, refValue, { width = 300, height = 110, pad = 6 } = {}) {
  if (!series || series.length < 2) return null;
  const values = series.map((p) => p.value);
  let min = Math.min(...values); let max = Math.max(...values);
  if (refValue > 0) { min = Math.min(min, refValue); max = Math.max(max, refValue); }
  const range = max - min || 1;
  min -= range * 0.08; max += range * 0.08;
  const x = (i) => pad + (i * (width - pad * 2)) / (series.length - 1);
  const y = (v) => pad + ((max - v) * (height - pad * 2)) / (max - min);
  return {
    d: series.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' '),
    area: `M${x(0).toFixed(1)},${(height - pad).toFixed(1)} ${series.map((p, i) => `L${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')} L${x(series.length - 1).toFixed(1)},${(height - pad).toFixed(1)} Z`,
    refY: refValue > 0 ? y(refValue) : null,
    last: { x: x(series.length - 1), y: y(series[series.length - 1].value) },
    min: Math.min(...values), max: Math.max(...values),
  };
}

export function Sparkline({ series, refValue, refLabel, label, format = (n) => String(Math.round(n)), height = 110 }) {
  const geo = sparklinePoints(series, refValue, { height });
  if (!geo) return <p style={{ fontSize: 12, color: T.inkSoft }}>Aún no hay suficientes datos para dibujar la evolución.</p>;
  const first = series[0]; const last = series[series.length - 1];
  return (
    <figure style={{ margin: 0 }}>
      <svg viewBox={`0 0 300 ${height}`} preserveAspectRatio="none" role="img" style={{ width: '100%', height }}
        aria-label={`${label || 'Evolución'}: de ${format(first.value)} el ${first.date} a ${format(last.value)} el ${last.date}${refLabel ? `; ${refLabel} ${format(refValue)}` : ''}`}>
        <path d={geo.area} fill={T.teal} opacity="0.12" />
        {geo.refY != null && <line x1="0" x2="300" y1={geo.refY} y2={geo.refY} stroke={T.amber} strokeWidth="1.5" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />}
        <path d={geo.d} fill="none" stroke={T.teal} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        <circle cx={geo.last.x} cy={geo.last.y} r="3.5" fill={T.teal} />
      </svg>
      <figcaption className="flex justify-between" style={{ fontSize: 10.5, color: T.inkSoft, fontFamily: FONT_MONO }}>
        <span>{first.date.slice(5)} · mín {format(geo.min)}</span>
        <span>máx {format(geo.max)} · {last.date.slice(5)}</span>
      </figcaption>
      {geo.refY != null && refLabel && <p style={{ fontSize: 10.5, color: T.amber, fontFamily: FONT_MONO }}>{refLabel}: {format(refValue)}</p>}
    </figure>
  );
}
