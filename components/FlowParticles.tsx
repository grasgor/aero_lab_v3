import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import '../types';

interface FlowParticlesProps {
  count?: number;
  speed?: number;
  angle: number; // Angle of attack in degrees
  thickness: number; // To estimate deflection magnitude
  flowType: 'discrete' | 'steam';
  showVortices: boolean;
  showHeatmap: boolean; // Toggle for heatmap coloring
  turbulenceIntensity?: number;
  paused?: boolean; // New prop to pause/hide flow
}

const NUM_STREAMS = 25; // Define the number of smoke tracer lines for 'steam' mode

const FlowParticles: React.FC<FlowParticlesProps> = ({ 
  count = 4000, 
  speed = 0.15, 
  angle, 
  thickness, 
  flowType, 
  showVortices,
  showHeatmap,
  turbulenceIntensity = 1.0,
  paused = false
}) => {
  const mesh = useRef<THREE.InstancedMesh>(null);
  
  // Helper object for positioning and color
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const colorHelper = useMemo(() => new THREE.Color(), []);

  // Create a soft particle texture for the mist effect
  const steamTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext('2d');
    if (!context) return null;
    const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.2, 'rgba(255,255,255,0.8)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(canvas);
  }, []);

  const finalCount = useMemo(() => (flowType === 'steam' ? count * 2 : count), [count, flowType]);

  // Initial positions
  const particles = useMemo(() => {
    const temp: any[] = [];
    if (flowType === 'steam') {
      const particlesPerStream = Math.floor(finalCount / NUM_STREAMS);
      for (let i = 0; i < NUM_STREAMS; i++) {
        const streamY = (i / (NUM_STREAMS - 1) - 0.5) * 10;
        for (let j = 0; j < particlesPerStream; j++) {
          const jitter = (Math.random() - 0.5) * 0.15; // Jitter to make streams less rigid
          temp.push({
            x: (Math.random() - 0.5) * 25,
            y: streamY + jitter,
            z: (Math.random() - 0.5) * 0.1,
            speedOffset: Math.random() * 0.02,
            baseY: streamY + jitter,
            phase: Math.random() * Math.PI * 2,
            wakeSpread: 0,
          });
        }
      }
    } else {
      for (let i = 0; i < finalCount; i++) {
        temp.push({
          x: (Math.random() - 0.5) * 25,
          y: (Math.random() - 0.5) * 12,
          z: (Math.random() - 0.5) * 4,
          speedOffset: Math.random() * 0.02,
          baseY: (Math.random() - 0.5) * 12,
          phase: Math.random() * Math.PI * 2
        });
      }
    }
    return temp;
  }, [finalCount, flowType]);

  useFrame((state) => {
    if (!mesh.current || paused) return;

    const time = state.clock.getElapsedTime();
    const angleRad = THREE.MathUtils.degToRad(angle);
    
    // Aerodynamic Constants
    const absAngle = Math.abs(angle);
    const isStalled = absAngle > 15;
    const separationPoint = isStalled ? 0.2 : 0.95; 
    
    const interactionRadius = 1.2 + (thickness / 25); 
    const liftFactor = Math.sin(angleRad) * 3.5;

    const BOUND_START = -10;
    const BOUND_END = 12;
    const FADE_DIST = 3;

    particles.forEach((p, i) => {
      // 1. BASE MOVEMENT
      const currentSpeed = speed + p.speedOffset;
      p.x += currentSpeed;

      if (p.x > BOUND_END) {
        p.x = BOUND_START - (Math.random() * 2); 
        p.y = p.baseY; 
        if (p.wakeSpread !== undefined) p.wakeSpread = 0; // Reset for steam
      }

      // Variables for heatmap calculation
      let velocityScalar = 0;

      // 2. POTENTIAL FLOW DEFLECTION (Same for both modes)
      const dx = p.x - 0.3; 
      const dy = p.y; 
      const distSq = dx * dx + dy * dy;
      const dist = Math.sqrt(distSq);

      if (dist < interactionRadius * 2.5) {
        const influence = Math.exp(-distSq * 1.5); 
        const thicknessPush = (Math.sign(p.y) || 1) * influence * (thickness / 100) * 0.6;
        let liftPush = (dx < 0) ? (influence * liftFactor * 0.15) : (-influence * liftFactor * 0.15);
        p.y += thicknessPush + liftPush;
        velocityScalar += influence * 0.8; 
      }

      // 3. WAKE TURBULENCE
      if (showVortices && p.x > separationPoint) {
        const distBehind = p.x - separationPoint;
        const wakeWidth = (thickness / 100) + (absAngle / 30) + (distBehind * 0.25);
        
        if (Math.abs(p.y) < wakeWidth || p.wakeSpread > 0) {
            if (flowType === 'steam') {
                // Diffuse and expand the smoke stream in the wake
                p.wakeSpread = Math.min(2.0, p.wakeSpread + 0.01 * turbulenceIntensity);
                const jitterX = (Math.random() - 0.5) * 0.05 * turbulenceIntensity;
                const jitterY = (Math.random() - 0.5) * 0.2 * p.wakeSpread;
                p.x += jitterX;
                p.y += jitterY;
                velocityScalar += p.wakeSpread * 0.5;
            } else {
                // Original 'discrete' vortex logic
                const wakeIntensity = Math.min(1.0, (absAngle / 10) + 0.2) * Math.exp(-distBehind * 0.1) * turbulenceIntensity;
                const vortexFreq = 12.0;
                const vortexSpeed = 15.0;
                const vortexAmp = (absAngle / 40) * 0.5 * turbulenceIntensity; 
                const sign = Math.sign(p.y) || 1;
                const oscillation = Math.sin(distBehind * vortexFreq - time * vortexSpeed + p.phase) * vortexAmp * sign;
                const jitterX = (Math.random() - 0.5) * 0.05 * wakeIntensity;
                const jitterY = (Math.random() - 0.5) * 0.05 * wakeIntensity;
                if (isStalled) {
                    p.y += oscillation * 2.0 + jitterY * 2.0;
                    p.x += jitterX * 2.0; 
                } else {
                    p.y += oscillation * Math.exp(-Math.abs(p.y)*2) + jitterY * 0.5;
                }
                if (wakeIntensity > 0.1) velocityScalar += wakeIntensity * 1.2;
            }
        }
      } else if (p.wakeSpread !== undefined) {
         p.wakeSpread = 0; // Reset spread if before wake
      }
      
      dummy.position.set(p.x, p.y, p.z);
      
      // 4. SCALING, VISIBILITY AND BILLBOARDING
      let baseScale = 1.0;
      if (flowType === 'steam') {
        baseScale = 0.1 + p.wakeSpread * 0.15; // Larger base size for mist particles
        dummy.lookAt(state.camera.position); // Billboard the sprite
      } else {
        const scaleX = Math.min(0.4, 0.15 + currentSpeed);
        dummy.scale.set(scaleX, 0.02, 0.02);
      }
      
      const fadeIn = THREE.MathUtils.smoothstep(p.x, BOUND_START, BOUND_START + FADE_DIST);
      const fadeOut = THREE.MathUtils.smoothstep(p.x, BOUND_END - FADE_DIST, BOUND_END);
      
      if (flowType === 'steam') {
        dummy.scale.set(baseScale, baseScale, baseScale); // Apply uniform scale after billboard
      }
      
      dummy.scale.multiplyScalar(fadeIn * (1.0 - fadeOut));
      
      dummy.updateMatrix();
      mesh.current!.setMatrixAt(i, dummy.matrix);

      // 5. COLOR UPDATE
      if (showHeatmap) {
         const t = Math.min(1.5, Math.max(0, velocityScalar));
         const hue = 0.6 - (t * 0.5); 
         const sat = 0.5 + (t * 0.5);
         const light = 0.5 + (t * 0.1);
         colorHelper.setHSL(Math.max(0, hue), Math.min(1, sat), Math.min(0.9, light));
      } else {
         colorHelper.set(flowType === 'steam' ? "#ffffff" : "#93c5fd");
      }
      mesh.current!.setColorAt(i, colorHelper);
    });

    mesh.current.instanceMatrix.needsUpdate = true;
    if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true;
  });

  if (paused) return null;

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, finalCount]}>
      {flowType === 'steam' ? 
        <planeGeometry args={[1, 1]} /> : 
        <boxGeometry args={[1, 1, 1]} />
      }
      <meshBasicMaterial 
        map={flowType === 'steam' ? steamTexture : null}
        color={showHeatmap ? "#ffffff" : (flowType === 'steam' ? "#ffffff" : "#93c5fd")}
        transparent 
        opacity={flowType === 'steam' ? 0.08 : 0.5} 
        blending={THREE.AdditiveBlending}
        depthWrite={false} 
      />
    </instancedMesh>
  );
};

export default FlowParticles;
