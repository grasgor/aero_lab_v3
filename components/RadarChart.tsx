import React from 'react';

interface RadarChartProps {
  labels: string[];
  data: number[];
  size?: number;
}

const RadarChart: React.FC<RadarChartProps> = ({ labels, data, size = 160 }) => {
  const center = size / 2;
  const radius = size * 0.4;

  if (!labels || !data || labels.length !== data.length) {
    return <div style={{width: size, height: size}} className="flex items-center justify-center text-xs text-slate-500">Invalid Chart Data</div>;
  }

  const numAxes = labels.length;
  const angleSlice = (Math.PI * 2) / numAxes;

  // Calculate points for the data polygon
  const dataPoints = data.map((value, i) => {
    const angle = angleSlice * i - Math.PI / 2; // Start from top
    const safeValue = Math.max(0, Math.min(10, value));
    const r = (safeValue / 10) * radius;
    const x = center + r * Math.cos(angle);
    const y = center + r * Math.sin(angle);
    return `${x},${y}`;
  }).join(' ');

  // Calculate points for axes and labels
  const axes = labels.map((_, i) => {
    const angle = angleSlice * i - Math.PI / 2;
    const x = center + radius * Math.cos(angle);
    const y = center + radius * Math.sin(angle);
    return { x, y };
  });

  const labelPoints = labels.map((_, i) => {
    const angle = angleSlice * i - Math.PI / 2;
    const r = radius * 1.15;
    let x = center + r * Math.cos(angle);
    let y = center + r * Math.sin(angle);

    let textAnchor = "middle";
    if (x > center + 2) textAnchor = "start";
    if (x < center - 2) textAnchor = "end";
    
    if (y < center - 5) y -= 2;
    if (y > center + 5) y += 8;

    return { x, y, textAnchor };
  });

  // Background grid lines (concentric polygons)
  const gridLevels = 4;
  const gridPolygons = Array.from({ length: gridLevels }).map((_, levelIndex) => {
    const r = radius * ((levelIndex + 1) / gridLevels);
    return Array.from({ length: numAxes }).map((__, i) => {
      const angle = angleSlice * i - Math.PI / 2;
      const x = center + r * Math.cos(angle);
      const y = center + r * Math.sin(angle);
      return `${x},${y}`;
    }).join(' ');
  });

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full overflow-visible">
      <g>
        {gridPolygons.map((points, i) => (
          <polygon key={i} points={points} fill="none" stroke="#334155" strokeWidth="0.5" />
        ))}
        {axes.map((point, i) => (
          <line
            key={i}
            x1={center}
            y1={center}
            x2={point.x}
            y2={point.y}
            stroke="#475569"
            strokeWidth="0.5"
          />
        ))}
        <polygon
          points={dataPoints}
          fill="rgba(6, 182, 212, 0.2)"
          stroke="#06b6d4"
          strokeWidth="1.5"
        />
        {dataPoints.split(' ').map((point, i) => {
           const [x, y] = point.split(',').map(Number);
           return <circle key={i} cx={x} cy={y} r="2" fill="#22d3ee" />;
        })}
        {labels.map((label, i) => (
          <text
            key={i}
            x={labelPoints[i].x}
            y={labelPoints[i].y}
            textAnchor={labelPoints[i].textAnchor as any}
            fontSize="8"
            fill="#94a3b8"
            className="font-sans font-bold uppercase tracking-wider"
          >
            {label}
          </text>
        ))}
      </g>
    </svg>
  );
};

export default RadarChart;
