import { useId } from "react";
import type { VolumePoint } from "../lib/types";

const dayFormatter = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });

export function VolumeChart({ data }: { data: VolumePoint[] }) {
  const gradientId = useId().replace(/:/g, "");
  if (!data.length) return <p className="muted small" style={{ padding: 16 }}>No volume data yet.</p>;

  const width = 680;
  const height = 216;
  const pad = { top: 14, right: 12, bottom: 26, left: 30 };
  const innerWidth = width - pad.left - pad.right;
  const innerHeight = height - pad.top - pad.bottom;
  const max = Math.max(1, ...data.map((point) => Math.max(point.created, point.resolved)));
  const roundedMax = max <= 4 ? 4 : Math.ceil(max / 4) * 4;
  const step = data.length > 1 ? innerWidth / (data.length - 1) : innerWidth;
  const x = (index: number) => pad.left + index * step;
  const y = (value: number) => pad.top + innerHeight * (1 - value / roundedMax);
  const baseline = pad.top + innerHeight;

  const pathFor = (key: "created" | "resolved") =>
    data.map((point, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)},${y(point[key]).toFixed(1)}`).join(" ");

  const areaPath = `${pathFor("created")} L${x(data.length - 1).toFixed(1)},${baseline} L${x(0).toFixed(1)},${baseline} Z`;
  const ticks = [roundedMax, Math.round(roundedMax / 2), 0];
  const labelEvery = data.length > 10 ? Math.ceil(data.length / 5) : 1;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="volume-chart"
      role="img"
      aria-label="Requests created and resolved over the last 14 days"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.17" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {ticks.map((tick) => (
        <g key={tick}>
          <line
            x1={pad.left}
            x2={width - pad.right}
            y1={y(tick)}
            y2={y(tick)}
            stroke="var(--line)"
            strokeWidth="1"
            strokeDasharray={tick === 0 ? undefined : "3 4"}
          />
          <text x={pad.left - 8} y={y(tick) + 3.5} textAnchor="end" fontSize="9.5" fill="var(--muted-2)">
            {tick}
          </text>
        </g>
      ))}

      <path d={areaPath} fill={`url(#${gradientId})`} />
      <path d={pathFor("created")} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" />
      <path
        d={pathFor("resolved")}
        fill="none"
        stroke="#c7a46a"
        strokeWidth="1.8"
        strokeDasharray="4 4"
        strokeLinejoin="round"
      />

      {data.map((point, index) => (
        <g key={point.date}>
          <circle cx={x(index)} cy={y(point.created)} r="2.5" fill="var(--accent)">
            <title>
              {dayFormatter.format(new Date(`${point.date}T12:00:00`))}: {point.created} created, {point.resolved} resolved
            </title>
          </circle>
          {index % labelEvery === 0 || index === data.length - 1 ? (
            <text
              x={Math.min(Math.max(x(index), pad.left + 12), width - pad.right - 12)}
              y={height - 8}
              textAnchor="middle"
              fontSize="9.5"
              fill="var(--muted-2)"
            >
              {dayFormatter.format(new Date(`${point.date}T12:00:00`))}
            </text>
          ) : null}
        </g>
      ))}
    </svg>
  );
}
