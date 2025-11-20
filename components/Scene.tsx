import React, { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Environment, Grid } from '@react-three/drei';
import Airfoil from './Airfoil';
import FlowParticles from './FlowParticles';
import { AirfoilParams } from '../types';

interface SceneProps {
  params: AirfoilParams;
  setParams?: React.Dispatch<React.SetStateAction<AirfoilParams>>;
  onDragStart?: () => void;
}

const Scene: React.FC<SceneProps> = ({ params, setParams, onDragStart }) => {
  const [orbitEnabled, setOrbitEnabled] = useState(true);

  // Determine if flow should be paused/hidden
  // Global Switch OFF OR (Sculpt Mode + Editing + Hide Flow Option)
  const isFlowPaused = !params.isFlowActive || (params.mode === 'freeform' && params.isEditing && params.pauseFlowDuringEdit);

  return (
    <Canvas shadows dpr={[1, 2]} gl={{ antialias: true }}>
      <PerspectiveCamera makeDefault position={[0, 0, 5]} fov={50} />
      <OrbitControls 
        enabled={orbitEnabled}
        enablePan={true}
        minPolarAngle={Math.PI / 4} 
        maxPolarAngle={Math.PI / 1.5}
      />
      
      {/* Lighting */}
      <ambientLight intensity={0.5} />
      <spotLight 
        position={[10, 10, 10]} 
        angle={0.15} 
        penumbra={1} 
        intensity={1} 
        castShadow 
      />
      <Environment preset="city" />

      {/* Visualization Elements */}
      <group position={[params.posX, params.posY, 0]}>
        <Airfoil 
          params={params} 
          setParams={setParams} 
          setOrbitEnabled={setOrbitEnabled}
          onDragStart={onDragStart}
        />
        <FlowParticles 
          angle={params.angle} 
          thickness={params.thickness} 
          flowType={params.flowType}
          showVortices={params.showVortices}
          showHeatmap={params.showHeatmap}
          count={params.particleCount}
          speed={params.flowSpeed}
          turbulenceIntensity={params.turbulenceIntensity}
          paused={isFlowPaused}
        />
      </group>

      {/* Background Grid for reference */}
      <Grid 
        position={[0, -2, 0]} 
        args={[20, 20]} 
        cellSize={1} 
        cellThickness={1} 
        cellColor="#334155" 
        sectionSize={5} 
        sectionThickness={1.5} 
        sectionColor="#475569" 
        fadeDistance={15} 
        fadeStrength={1}
      />
    </Canvas>
  );
};

export default Scene;