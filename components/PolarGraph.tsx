import React from 'react';

interface PolarGraphProps {
  lift: number; // Downforce is negative lift
  drag: number; // This is drag *efficiency* (0=high drag, 10=low drag)
  liftToDrag: number;
}

const PolarGraph: React.FC<PolarGraphProps> = ({ lift, drag, liftToDrag }) => {
  const size = 200;
  const center = size / 2;
  const radius = size * 0.38;
  
  const maxVal = 10;
  
  // Invert drag efficiency (10=good) to drag force (10=bad) for plotting on the x-axis
  const dragForce = 10 - drag;
  const dragVal = (dragForce / maxVal) * radius;
  // Lift/Downforce is plotted on the y-axis
  const liftVal = (lift / maxVal) * radius;

  // atan2(y, x) -> y is lift, x is drag
  const angle = Math.atan2(liftVal, dragVal);
  const magnitude = Math.min(radius, Math.sqrt(liftVal*liftVal + dragVal*dragVal));

  const arrowX = center + magnitude * Math.cos(angle);
  const arrowY = center + magnitude * Math.sin(angle);

  const showArrow = magnitude > 0.1;

  return (
    <div className="flex flex-col items-center justify-center text-slate-400 h-full">
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-48 overflow-visible">
        {/* Grid circles */}
        {[0.25, 0.5, 0.75, 1].map(r => (
          <circle key={r} cx={center} cy={center} r={radius * r} fill="none" stroke="#334155" strokeWidth="0.5" />
        ))}
        {/* Axes */}
        <line x1={center} y1={center - radius - 5} x2={center} y2={center + radius + 5} stroke="#475569" strokeWidth="0.5" />
        <line x1={center - radius - 5} y1={center} x2={center + radius + 5} y2={center} stroke="#475569" strokeWidth="0.5" />
        
        {/* Labels */}
        <text x={center} y={center - radius - 8} textAnchor="middle" fontSize="9" fill="#94a3b8" className="font-sans font-bold uppercase tracking-wider">Lift/Downforce</text>
        <text x={center + radius + 8} y={center + 3} textAnchor="start" fontSize="9" fill="#94a3b8" className="font-sans font-bold uppercase tracking-wider">Drag</text>

        {/* Arrow */}
        {showArrow && (
          <>
            <defs>
              <marker id="arrowhead" markerWidth="5" markerHeight="3.5" refX="5" refY="1.75" orient="auto">
                <polygon points="0 0, 5 1.75, 0 3.5" fill="#22d3ee" />
              </marker>
            </defs>
            <line 
              x1={center} 
              y1={center} 
              x2={arrowX} 
              y2={arrowY} 
              stroke="#22d3ee" 
              strokeWidth="2" 
              markerEnd="url(#arrowhead)"
            />
          </>
        )}
      </svg>
      <div className="text-center -mt-8">
        <span className="text-3xl font-mono text-white font-bold">{liftToDrag.toFixed(2)}</span>
        <p className="text-xs text-slate-500 uppercase tracking-wider">L/D Ratio</p>
      </div>
    </div>
  );
};

export default PolarGraph;
